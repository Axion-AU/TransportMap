import { correctArm, updateArm } from './bandit';
import { getConfig } from './config';
import type { MetricSnapshotRow, Platform, PostRow } from './types';
import { nowIso, zScore } from './util';

/**
 * Reward function (§6):
 *   raw = (0.5*reposts + 0.3*replies + 0.2*likes) / followers_at_post_time
 * quotes count as reposts on bluesky; z-scored against the trailing 30-day
 * same-platform distribution; blended with a soft-attributed follower delta.
 *
 * predicted_score must NEVER enter this module (§4.4 hard rule).
 */

interface Weights {
  reposts: number;
  replies: number;
  likes: number;
}

export function rawReward(
  counts: { likes: number; reposts: number; replies: number; quotes: number },
  followersAtPost: number,
  weights: Weights
): number {
  if (followersAtPost <= 0) return 0;
  const reposts = counts.reposts + counts.quotes; // quotes count as reposts (§6)
  return (
    (weights.reposts * reposts + weights.replies * counts.replies + weights.likes * counts.likes) /
    followersAtPost
  );
}

/** Trailing raw-reward sample for the same platform; expanding window if thin. */
async function rewardSample(
  db: D1Database,
  platform: Platform,
  windowDays: number,
  minSample: number
): Promise<number[]> {
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const windowed = await db
    .prepare(
      `SELECT raw_reward FROM post_rewards
       WHERE platform = ? AND computed_at >= ? ORDER BY computed_at DESC LIMIT 500`
    )
    .bind(platform, since)
    .all<{ raw_reward: number }>();
  let rows = windowed.results;
  if (rows.length < minSample) {
    const all = await db
      .prepare(
        `SELECT raw_reward FROM post_rewards
         WHERE platform = ? ORDER BY computed_at DESC LIMIT 500`
      )
      .bind(platform)
      .all<{ raw_reward: number }>();
    rows = all.results;
  }
  return rows.map((r) => r.raw_reward);
}

/**
 * Follower-delta signal: followers(t+24h) - followers(t), soft-attributed
 * evenly across same-platform posts published in that 24h window (§6).
 */
async function followerDeltaForPost(
  db: D1Database,
  post: PostRow,
  snap24: MetricSnapshotRow
): Promise<number> {
  if (post.followers_at_post == null || !post.posted_at) return 0;
  const delta = snap24.followers_at_capture - post.followers_at_post;
  const windowEnd = new Date(new Date(post.posted_at).getTime() + 24 * 3600_000).toISOString();
  const n = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM posts
       WHERE platform = ? AND status = 'posted' AND posted_at >= ? AND posted_at < ?`
    )
    .bind(post.platform, post.posted_at, windowEnd)
    .first<{ c: number }>();
  const count = Math.max(1, n?.c ?? 1);
  return delta / count;
}

/** Computed once per post when its 24h snapshot lands (§6). */
export async function computePostReward(
  db: D1Database,
  post: PostRow,
  snap24: MetricSnapshotRow
): Promise<void> {
  const existing = await db
    .prepare('SELECT post_id FROM post_rewards WHERE post_id = ?')
    .bind(post.id)
    .first();
  if (existing) return;

  const weights = await getConfig<Weights>(db, 'reward_weights');
  const blend = await getConfig<{ engagement: number; follower_delta: number }>(
    db,
    'reward_blend'
  );
  const windowDays = await getConfig<number>(db, 'reward_window_days');
  const minSample = await getConfig<number>(db, 'reward_min_sample');

  const raw = rawReward(snap24, post.followers_at_post ?? 0, weights);
  const sample = await rewardSample(db, post.platform, windowDays, minSample);
  const engagementZ = zScore(raw, sample);

  const delta = await followerDeltaForPost(db, post, snap24);
  const deltaSample = await db
    .prepare(
      `SELECT follower_delta FROM post_rewards
       WHERE platform = ? ORDER BY computed_at DESC LIMIT 200`
    )
    .bind(post.platform)
    .all<{ follower_delta: number }>();
  const deltaZ = zScore(delta, deltaSample.results.map((r) => r.follower_delta));

  const reward = blend.engagement * engagementZ + blend.follower_delta * deltaZ;

  await db
    .prepare(
      `INSERT INTO post_rewards
         (post_id, platform, raw_reward, engagement_z, follower_delta, follower_delta_z,
          reward, computed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(post.id, post.platform, raw, engagementZ, delta, deltaZ, reward, nowIso())
    .run();

  // Posterior update for the slot/archetype arm this post pulled.
  if (post.posted_slot) {
    await updateArm(
      db,
      'bandit_arms',
      { platform: post.platform, slot: post.posted_slot, archetype: post.archetype },
      reward
    );
  }
}

/**
 * 72h correction pass (§6): recompute with 72h numbers; if the engagement
 * z-score moved by more than the threshold, apply the delta to the arm.
 */
export async function apply72hCorrection(
  db: D1Database,
  post: PostRow,
  snap72: MetricSnapshotRow
): Promise<void> {
  const rewardRow = await db
    .prepare('SELECT * FROM post_rewards WHERE post_id = ? AND corrected_at IS NULL')
    .bind(post.id)
    .first<{
      raw_reward: number;
      engagement_z: number;
      follower_delta_z: number;
      reward: number;
    }>();
  if (!rewardRow) return;

  const weights = await getConfig<Weights>(db, 'reward_weights');
  const blend = await getConfig<{ engagement: number; follower_delta: number }>(
    db,
    'reward_blend'
  );
  const windowDays = await getConfig<number>(db, 'reward_window_days');
  const minSample = await getConfig<number>(db, 'reward_min_sample');
  const threshold = await getConfig<number>(db, 'correction_threshold');

  const raw72 = rawReward(snap72, post.followers_at_post ?? 0, weights);
  const sample = await rewardSample(db, post.platform, windowDays, minSample);
  const z72 = zScore(raw72, sample);

  if (Math.abs(z72 - rewardRow.engagement_z) > threshold) {
    const newReward = blend.engagement * z72 + blend.follower_delta * rewardRow.follower_delta_z;
    const delta = newReward - rewardRow.reward;
    if (post.posted_slot) {
      await correctArm(
        db,
        'bandit_arms',
        { platform: post.platform, slot: post.posted_slot, archetype: post.archetype },
        delta
      );
    }
    await db
      .prepare('UPDATE post_rewards SET corrected_at = ?, corrected_reward = ? WHERE post_id = ?')
      .bind(nowIso(), newReward, post.id)
      .run();
  } else {
    await db
      .prepare('UPDATE post_rewards SET corrected_at = ? WHERE post_id = ?')
      .bind(nowIso(), post.id)
      .run();
  }
}

/** Effective reward for reporting: corrected value when present. */
export function effectiveReward(r: { reward: number; corrected_reward: number | null }): number {
  return r.corrected_reward ?? r.reward;
}
