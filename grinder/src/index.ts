import { logEvent, pruneEventsLog } from './alerts';
import { handleRequest } from './api';
import { computeDayRewards, sampleDailyVolume } from './cadence';
import { getConfig, setConfig } from './config';
import { monthlyStyleAnalysis, weeklyFeedbackRefresh } from './feedback';
import { pollMentions } from './mentions';
import { dailyAccountSnapshot, pollMetrics } from './metrics';
import { schedulerTick } from './scheduler';
import type { Env } from './types';

/**
 * Cron layout (wrangler.toml):
 *   *\/10  → mention poller + triage
 *   *\/15  → metrics poller (1h/6h/24h/72h snapshots, reward computation)
 *   0,30  → scheduler tick + housekeeping (expiry sweep, cadence sample,
 *           account snapshots, weekly/monthly feedback, log pruning)
 *
 * Weekly/monthly jobs run off config markers rather than extra cron slots, so
 * quiet ticks cost only a couple of D1 row reads (free-tier friendly).
 */

async function markerDue(db: D1Database, key: string, intervalDays: number): Promise<boolean> {
  const last = await getConfig<string | undefined>(db, key);
  if (typeof last !== 'string' || !last) return true;
  return Date.now() - new Date(last).getTime() > intervalDays * 86400_000;
}

async function housekeeping(env: Env, now: Date): Promise<void> {
  await sampleDailyVolume(env, now); // no-op after the first post-05:00 tick
  await dailyAccountSnapshot(env, now); // no-op once today's rows exist
  await computeDayRewards(env, now);

  if (await markerDue(env.DB, 'feedback_last_run', 7)) {
    await weeklyFeedbackRefresh(env, now); // writes feedback_last_run
  }
  if (await markerDue(env.DB, 'style_analysis_last_run', 30)) {
    // Marker is written even when the run produces nothing, so a thin month
    // doesn't retry every tick.
    await setConfig(env.DB, 'style_analysis_last_run', now.toISOString());
    await monthlyStyleAnalysis(env, now);
  }
  if (await markerDue(env.DB, 'log_prune_last_run', 1)) {
    await setConfig(env.DB, 'log_prune_last_run', now.toISOString());
    await pruneEventsLog(env.DB);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const now = new Date(event.scheduledTime);
    const run = async () => {
      try {
        switch (event.cron) {
          case '*/10 * * * *':
            await pollMentions(env, now);
            break;
          case '*/15 * * * *':
            await pollMetrics(env, now);
            break;
          case '0,30 * * * *':
            await schedulerTick(env, now);
            await housekeeping(env, now);
            break;
          default:
            // unknown trigger — run the safe subset
            await pollMetrics(env, now);
            await schedulerTick(env, now);
        }
      } catch (e) {
        await logEvent(env, 'error', 'cron.uncaught', `${event.cron}: ${e}`);
      }
    };
    ctx.waitUntil(run());
  },
};
