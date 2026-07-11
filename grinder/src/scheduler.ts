import * as bluesky from './adapters/bluesky';
import * as mastodon from './adapters/mastodon';
import { logEvent } from './alerts';
import { getArm, samplePosterior } from './bandit';
import { getTodayCadence } from './cadence';
import { getConfig } from './config';
import { currentSlot, melbourneLocal } from './slots';
import { transition } from './transitions';
import type { Env, Platform, PostRow, PublishResult } from './types';
import { nowIso } from './util';

/**
 * Scheduler (§7.2). Runs on the 0,30 cron tick. Selects WHICH approved post
 * fires in the current slot — timing and ordering only, never content (INV-3).
 *
 * predicted_score is deliberately absent from every query and computation in
 * this module (§4.4 hard rule).
 */

export function composeText(post: Pick<PostRow, 'text_final' | 'link_url'>): string {
  if (post.link_url && !post.text_final.includes(post.link_url)) {
    return `${post.text_final}\n\n${post.link_url}`;
  }
  return post.text_final;
}

async function publish(env: Env, post: PostRow): Promise<PublishResult> {
  const text = composeText(post);
  if (post.platform === 'mastodon') return mastodon.publishStatus(env, text);
  return bluesky.publishPost(env, text);
}

async function fetchFollowers(env: Env, platform: Platform): Promise<number> {
  try {
    return platform === 'mastodon'
      ? await mastodon.fetchFollowerCount(env)
      : await bluesky.fetchFollowerCount(env);
  } catch {
    return 0;
  }
}

/** §7.2 last bullet: expire approved posts past freshness, surfaced in the UI. */
export async function expireStalePosts(db: D1Database, now: Date): Promise<number> {
  const res = await db
    .prepare(
      `UPDATE posts SET status = 'expired'
       WHERE status = 'approved' AND freshness_expiry < ?`
    )
    .bind(nowIso(now))
    .run();
  return res.meta.changes ?? 0;
}

interface Candidate extends PostRow {}

async function buildCandidates(
  db: D1Database,
  platform: Platform,
  now: Date,
  minutesOfDay: number
): Promise<Candidate[]> {
  // Step 3 + step 5. High risk is never auto-scheduled; medium risk only inside
  // the awake window. Risk windows are safety constraints, so they apply even
  // when the urgency override later fires.
  const rows = await db
    .prepare(
      `SELECT * FROM posts
       WHERE status = 'approved' AND platform = ? AND freshness_expiry > ?
         AND risk_tier != 'high'
       ORDER BY freshness_expiry LIMIT 100`
    )
    .bind(platform, nowIso(now))
    .all<PostRow>();
  const windows = await getConfig<{ medium: { start_minutes: number; end_minutes: number } }>(
    db,
    'risk_windows'
  );
  return rows.results.filter((p) => {
    if (p.risk_tier !== 'medium') return true;
    return minutesOfDay >= windows.medium.start_minutes && minutesOfDay <= windows.medium.end_minutes;
  });
}

/** Steps 9-11: schedule → fire → posted (or revert to approved on failure). */
export async function firePost(
  env: Env,
  post: PostRow,
  slot: string | null,
  now: Date
): Promise<boolean> {
  const db = env.DB;
  // Guarded transition: if another tick got here first, changes = 0 and we stop.
  const claimed = await transition(db, post.id, 'approved', 'scheduled', {
    scheduled_for: nowIso(now),
  });
  if (!claimed) return false;

  try {
    const result = await publish(env, post);
    const followers = await fetchFollowers(env, post.platform);
    const local = melbourneLocal(now);
    await transition(db, post.id, 'scheduled', 'posted', {
      posted_at: nowIso(now),
      posted_local_date: local.dateStr,
      posted_slot: slot,
      platform_post_id: result.platformPostId,
      platform_post_url: result.platformPostUrl,
      followers_at_post: followers,
    });
    await db
      .prepare(
        `UPDATE cadence_days SET actual_volume = actual_volume + 1
         WHERE platform = ? AND date = ?`
      )
      .bind(post.platform, local.dateStr)
      .run();
    return true;
  } catch (e) {
    await transition(db, post.id, 'scheduled', 'approved', { scheduled_for: null });
    await logEvent(env, 'error', 'scheduler.publish_failed', `${post.platform} ${post.id}: ${e}`);
    return false;
  }
}

export async function schedulerTick(env: Env, now: Date = new Date()): Promise<void> {
  const db = env.DB;
  const expired = await expireStalePosts(db, now);
  if (expired > 0) await logEvent(env, 'info', 'scheduler.expired', `${expired} approved posts expired`);

  const slot = currentSlot(now);
  if (!slot) return; // step 1: not at a slot start

  const local = melbourneLocal(now);
  const maxPerDay = await getConfig<number>(db, 'max_posts_per_day');
  const minGapMinutes = await getConfig<number>(db, 'min_gap_minutes');
  const urgencyHours = await getConfig<number>(db, 'urgency_window_hours');
  const diversityLookback = await getConfig<number>(db, 'diversity_lookback');
  const explorationFloor = await getConfig<number>(db, 'exploration_floor');

  for (const platform of ['mastodon', 'bluesky'] as Platform[]) {
    // Step 2: posting budget — cadence bandit's daily target, capped by the
    // hard max, plus the min-gap rule.
    const cadence = await getTodayCadence(db, platform, now);
    const target = Math.min(cadence?.target_volume ?? 0, maxPerDay);
    if (!cadence || cadence.actual_volume >= target) continue;

    const lastPost = await db
      .prepare(
        `SELECT posted_at FROM posts
         WHERE platform = ? AND status = 'posted'
         ORDER BY posted_at DESC LIMIT 1`
      )
      .bind(platform)
      .first<{ posted_at: string }>();
    if (
      lastPost &&
      now.getTime() - new Date(lastPost.posted_at).getTime() < minGapMinutes * 60_000
    ) {
      continue;
    }

    // Steps 3 + 5: candidate set with risk filtering.
    let candidates = await buildCandidates(db, platform, now, local.minutesOfDay);
    if (candidates.length === 0) continue;

    // Step 4: urgency override — freshness beats optimality.
    const urgencyCutoff = new Date(now.getTime() + urgencyHours * 3600_000).toISOString();
    const urgent = candidates.filter((c) => c.freshness_expiry < urgencyCutoff);
    if (urgent.length > 0) {
      urgent.sort((a, b) => a.freshness_expiry.localeCompare(b.freshness_expiry));
      await firePost(env, urgent[0], slot, now);
      continue;
    }

    // Step 6: diversity constraint — if the last N posts share a topic,
    // exclude that topic this tick.
    const recent = await db
      .prepare(
        `SELECT topic FROM posts
         WHERE platform = ? AND status = 'posted'
         ORDER BY posted_at DESC LIMIT ?`
      )
      .bind(platform, diversityLookback)
      .all<{ topic: string }>();
    if (
      recent.results.length === diversityLookback &&
      recent.results.every((r) => r.topic === recent.results[0].topic)
    ) {
      const banned = recent.results[0].topic;
      const filtered = candidates.filter((c) => c.topic !== banned);
      if (filtered.length > 0) candidates = filtered;
    }

    // Steps 7-8: Thompson sample per candidate arm, with an exploration floor.
    let chosen: Candidate;
    if (Math.random() < explorationFloor) {
      chosen = candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      let best = -Infinity;
      chosen = candidates[0];
      for (const c of candidates) {
        const arm = await getArm(db, 'bandit_arms', {
          platform,
          slot,
          archetype: c.archetype,
        });
        const draw = samplePosterior(arm);
        if (draw > best) {
          best = draw;
          chosen = c;
        }
      }
    }

    await firePost(env, chosen, slot, now);
  }
}
