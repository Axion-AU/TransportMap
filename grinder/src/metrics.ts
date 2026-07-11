import * as bluesky from './adapters/bluesky';
import * as mastodon from './adapters/mastodon';
import { logEvent } from './alerts';
import { apply72hCorrection, computePostReward } from './reward';
import { melbourneLocal } from './slots';
import type { AgeBucket, EngagementCounts, Env, MetricSnapshotRow, PostRow } from './types';
import { nowIso, uuid } from './util';

/**
 * Metrics ingestion (§5). Runs every 15 minutes; captures 1h/6h/24h/72h
 * snapshots per posted post. A bucket >2h past its window is captured with
 * partial=1 so the reward computation can fall back to the nearest bucket.
 *
 * D1 budget note: the candidate query is bounded to posts published in the
 * last ~80h via the (platform, status, posted_at) index, so steady-state cost
 * is a handful of row reads per tick.
 */

const BUCKETS: Array<{ bucket: AgeBucket; hours: number }> = [
  { bucket: '1h', hours: 1 },
  { bucket: '6h', hours: 6 },
  { bucket: '24h', hours: 24 },
  { bucket: '72h', hours: 72 },
];
const LATE_GRACE_HOURS = 2;

interface DuePost {
  post: PostRow;
  due: AgeBucket[];
  late: Set<AgeBucket>;
}

async function collectDue(db: D1Database, now: Date): Promise<DuePost[]> {
  const horizon = new Date(now.getTime() - 80 * 3600_000).toISOString();
  const posts = await db
    .prepare(
      `SELECT * FROM posts
       WHERE status = 'posted' AND metrics_terminal = 0 AND posted_at >= ?
       ORDER BY posted_at LIMIT 200`
    )
    .bind(horizon)
    .all<PostRow>();
  const out: DuePost[] = [];
  for (const post of posts.results) {
    const captured = await db
      .prepare('SELECT age_bucket FROM metric_snapshots WHERE post_id = ?')
      .bind(post.id)
      .all<{ age_bucket: AgeBucket }>();
    const have = new Set(captured.results.map((r) => r.age_bucket));
    const postedAt = new Date(post.posted_at!).getTime();
    const due: AgeBucket[] = [];
    const late = new Set<AgeBucket>();
    for (const { bucket, hours } of BUCKETS) {
      if (have.has(bucket)) continue;
      const dueAt = postedAt + hours * 3600_000;
      if (now.getTime() < dueAt) continue;
      due.push(bucket);
      if (now.getTime() > dueAt + LATE_GRACE_HOURS * 3600_000) late.add(bucket);
    }
    if (due.length > 0) out.push({ post, due, late });
  }
  return out;
}

async function insertSnapshot(
  db: D1Database,
  post: PostRow,
  bucket: AgeBucket,
  counts: EngagementCounts,
  followers: number,
  partial: boolean
): Promise<MetricSnapshotRow> {
  const row: MetricSnapshotRow = {
    id: uuid(),
    post_id: post.id,
    captured_at: nowIso(),
    age_bucket: bucket,
    likes: counts.likes,
    reposts: counts.reposts,
    replies: counts.replies,
    quotes: counts.quotes,
    followers_at_capture: followers,
    partial: partial ? 1 : 0,
  };
  await db
    .prepare(
      `INSERT OR IGNORE INTO metric_snapshots
         (id, post_id, captured_at, age_bucket, likes, reposts, replies, quotes,
          followers_at_capture, partial)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      row.id,
      row.post_id,
      row.captured_at,
      row.age_bucket,
      row.likes,
      row.reposts,
      row.replies,
      row.quotes,
      row.followers_at_capture,
      row.partial
    )
    .run();
  return row;
}

export async function pollMetrics(env: Env, now: Date = new Date()): Promise<void> {
  const duePosts = await collectDue(env.DB, now);
  if (duePosts.length === 0) return;

  const byPlatform = {
    mastodon: duePosts.filter((d) => d.post.platform === 'mastodon'),
    bluesky: duePosts.filter((d) => d.post.platform === 'bluesky'),
  };

  // One follower fetch per platform per tick, shared across snapshots.
  const followers: Record<string, number> = {};
  const handle = async (d: DuePost, counts: EngagementCounts) => {
    if (counts.deleted) {
      await env.DB.prepare('UPDATE posts SET metrics_terminal = 1 WHERE id = ?')
        .bind(d.post.id)
        .run();
      await logEvent(env, 'warn', 'metrics.deleted_upstream', d.post.id);
      return;
    }
    for (const bucket of d.due) {
      const snap = await insertSnapshot(
        env.DB,
        d.post,
        bucket,
        counts,
        followers[d.post.platform] ?? d.post.followers_at_post ?? 0,
        d.late.has(bucket)
      );
      if (bucket === '24h') await computePostReward(env.DB, d.post, snap);
      if (bucket === '72h') {
        // If 24h was missed entirely, fall back to the nearest bucket (§5.2).
        const has24 = await env.DB.prepare(
          `SELECT id FROM metric_snapshots WHERE post_id = ? AND age_bucket = '24h'`
        )
          .bind(d.post.id)
          .first();
        if (!has24) await computePostReward(env.DB, d.post, snap);
        await apply72hCorrection(env.DB, d.post, snap);
      }
    }
  };

  if (byPlatform.mastodon.length > 0) {
    try {
      followers.mastodon = await mastodon.fetchFollowerCount(env);
      for (const d of byPlatform.mastodon) {
        try {
          const counts = await mastodon.fetchStatusCounts(env, d.post.platform_post_id!);
          await handle(d, counts);
        } catch (e) {
          await logEvent(env, 'warn', 'metrics.mastodon_fetch_failed', `${d.post.id}: ${e}`);
        }
      }
    } catch (e) {
      await logEvent(env, 'error', 'metrics.mastodon_unavailable', String(e));
    }
  }

  if (byPlatform.bluesky.length > 0) {
    try {
      followers.bluesky = await bluesky.fetchFollowerCount(env);
      const uris = byPlatform.bluesky.map((d) => d.post.platform_post_id!);
      const counts = await bluesky.fetchPostCounts(env, uris);
      for (const d of byPlatform.bluesky) {
        const c = counts.get(d.post.platform_post_id!);
        if (c) await handle(d, c);
      }
    } catch (e) {
      await logEvent(env, 'error', 'metrics.bluesky_unavailable', String(e));
    }
  }
}

/** Daily follower counts per platform (§3.4), keyed by Melbourne local date. */
export async function dailyAccountSnapshot(env: Env, now: Date = new Date()): Promise<void> {
  const localDate = melbourneLocal(now).dateStr;
  for (const platform of ['mastodon', 'bluesky'] as const) {
    const exists = await env.DB.prepare(
      'SELECT platform FROM account_snapshots WHERE platform = ? AND captured_at = ?'
    )
      .bind(platform, localDate)
      .first();
    if (exists) continue;
    try {
      const count =
        platform === 'mastodon'
          ? await mastodon.fetchFollowerCount(env)
          : await bluesky.fetchFollowerCount(env);
      await env.DB.prepare(
        'INSERT OR IGNORE INTO account_snapshots (platform, captured_at, followers) VALUES (?, ?, ?)'
      )
        .bind(platform, localDate, count)
        .run();
    } catch (e) {
      await logEvent(env, 'warn', 'metrics.account_snapshot_failed', `${platform}: ${e}`);
    }
  }
}
