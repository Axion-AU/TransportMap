import { getArm, samplePosterior, updateArm } from './bandit';
import { getConfig } from './config';
import { melbourneLocal } from './slots';
import type { Env, Platform, VolumeLevel } from './types';

/**
 * Cadence bandit (§7.4): a second, independent Thompson sampler that decides
 * how many posts to target per platform per day. Its reward is day-level.
 *
 * The spec was truncated mid-§7.4, so the day reward is defined here as:
 *   day_reward = mean(effective post reward for posts published that day)
 * computed at date+72h (after every post's correction pass could land).
 * Mean-per-post naturally penalises volume-driven dilution/fatigue while still
 * crediting days where higher volume held per-post engagement. Days with zero
 * posts record day_reward = 0 but do NOT update the arm (an empty pool is not
 * evidence about volume choice).
 */

export interface CadenceDay {
  platform: Platform;
  date: string;
  day_type: string;
  volume_level: VolumeLevel;
  target_volume: number;
  actual_volume: number;
  day_reward: number | null;
}

export async function getTodayCadence(
  db: D1Database,
  platform: Platform,
  now: Date
): Promise<CadenceDay | null> {
  const local = melbourneLocal(now);
  return db
    .prepare('SELECT * FROM cadence_days WHERE platform = ? AND date = ?')
    .bind(platform, local.dateStr)
    .first<CadenceDay>();
}

/**
 * Morning sample: the first housekeeping tick at/after 05:00 local creates the
 * day's row per platform. The PRIMARY KEY (platform, date) makes this
 * idempotent under concurrent ticks.
 */
export async function sampleDailyVolume(env: Env, now: Date = new Date()): Promise<void> {
  const db = env.DB;
  const local = melbourneLocal(now);
  if (local.minutesOfDay < 5 * 60) return;

  const targets = await getConfig<Record<string, number>>(db, 'volume_targets');
  for (const platform of ['mastodon', 'bluesky'] as Platform[]) {
    const existing = await getTodayCadence(db, platform, now);
    if (existing) continue;

    let bestLevel: VolumeLevel = 'medium';
    let best = -Infinity;
    for (const level of ['low', 'medium', 'high'] as VolumeLevel[]) {
      const arm = await getArm(db, 'cadence_arms', {
        platform,
        day_type: local.dayType,
        volume_level: level,
      });
      const draw = samplePosterior(arm);
      if (draw > best) {
        best = draw;
        bestLevel = level;
      }
    }

    await db
      .prepare(
        `INSERT OR IGNORE INTO cadence_days
           (platform, date, day_type, volume_level, target_volume, actual_volume)
         VALUES (?, ?, ?, ?, ?, 0)`
      )
      .bind(platform, local.dateStr, local.dayType, bestLevel, targets[bestLevel] ?? 4)
      .run();
  }
}

/** Compute day rewards for days whose 72h settling window has passed. */
export async function computeDayRewards(env: Env, now: Date = new Date()): Promise<void> {
  const db = env.DB;
  // A local date is settled once now > (date end) + 72h; comparing local date
  // strings against (now - 4 days) is a conservative, tz-safe bound.
  const settledBefore = melbourneLocal(new Date(now.getTime() - 4 * 86400_000)).dateStr;
  const pending = await db
    .prepare(
      `SELECT * FROM cadence_days
       WHERE day_reward IS NULL AND date <= ? LIMIT 20`
    )
    .bind(settledBefore)
    .all<CadenceDay>();

  for (const day of pending.results) {
    if (day.actual_volume === 0) {
      // No pulls happened; record but don't update the arm.
      await db
        .prepare('UPDATE cadence_days SET day_reward = 0 WHERE platform = ? AND date = ?')
        .bind(day.platform, day.date)
        .run();
      continue;
    }
    const rewards = await db
      .prepare(
        `SELECT COALESCE(pr.corrected_reward, pr.reward) AS r
         FROM post_rewards pr
         JOIN posts p ON p.id = pr.post_id
         WHERE p.platform = ? AND p.posted_local_date = ?`
      )
      .bind(day.platform, day.date)
      .all<{ r: number }>();
    if (rewards.results.length === 0) continue; // rewards not landed yet; retry next tick

    const dayReward =
      rewards.results.reduce((a, b) => a + b.r, 0) / rewards.results.length;
    await db
      .prepare('UPDATE cadence_days SET day_reward = ? WHERE platform = ? AND date = ?')
      .bind(dayReward, day.platform, day.date)
      .run();
    await updateArm(
      db,
      'cadence_arms',
      { platform: day.platform, day_type: day.day_type, volume_level: day.volume_level },
      dayReward
    );
  }
}
