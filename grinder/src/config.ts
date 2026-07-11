import { nowIso } from './util';

/**
 * Exec-facing tunables live in the `config` D1 table so changes don't require a
 * deploy (§3.7). These are the defaults used when a key is absent.
 */
export const DEFAULTS = {
  // §4.4 generation-time culling bar (used by the generator, exposed via API)
  quality_bar: 6.0,

  // §7.2 scheduler
  exploration_floor: 0.2,
  max_posts_per_day: 10,
  min_gap_minutes: 90,
  urgency_window_hours: 6,
  diversity_lookback: 3,
  // medium-risk posts only fire between these local times; high risk is never
  // auto-scheduled (§7.2 step 5)
  risk_windows: { medium: { start_minutes: 7 * 60, end_minutes: 19 * 60 + 30 } },

  // §6 reward function
  reward_weights: { reposts: 0.5, replies: 0.3, likes: 0.2 },
  reward_blend: { engagement: 0.8, follower_delta: 0.2 },
  reward_window_days: 30,
  reward_min_sample: 10,
  correction_threshold: 0.5,

  // §7.4 cadence bandit
  volume_targets: { low: 2, medium: 4, high: 7 } as Record<string, number>,

  // §4.3 prompt feedback loop
  prompt_feedback: {
    edit_pairs: 12,
    min_edit_distance: 15,
    top_performers: 5,
    token_budget: 3000,
  },

  // freshness defaults (§3.1 notes)
  freshness: { news_reactive_hours: 48, evergreen_days: 14, manual_days: 14 },
  evergreen_archetypes: ['policy_explainer', 'data_drop'],

  // §4.1 per-platform limits (mastodon: chars, bluesky: graphemes)
  platform_limits: { mastodon: 500, bluesky: 300 },

  // OpenRouter model id used for triage + monthly style analysis
  llm_model: 'anthropic/claude-sonnet-4.5',

  // mention triage engagement policy, injected into the triage prompt
  engagement_policy:
    'Reply to good-faith questions and correctable factual points. Ignore bait, ' +
    'abuse, and low-effort dunks. Escalate anything from journalists or media ' +
    'accounts, anything legally sensitive, and anything about candidates or ' +
    'internal party matters.',
} as const;

export type ConfigKey = keyof typeof DEFAULTS | string;

export async function getConfig<T>(db: D1Database, key: ConfigKey): Promise<T> {
  const row = await db
    .prepare('SELECT value FROM config WHERE key = ?')
    .bind(key)
    .first<{ value: string }>();
  if (row) return JSON.parse(row.value) as T;
  return (DEFAULTS as Record<string, unknown>)[key] as T;
}

export async function setConfig(db: D1Database, key: string, value: unknown): Promise<void> {
  await db
    .prepare(
      `INSERT INTO config (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .bind(key, JSON.stringify(value), nowIso())
    .run();
}

export async function getConfigString(
  db: D1Database,
  key: string,
  fallback = ''
): Promise<string> {
  const v = await getConfig<string | undefined>(db, key);
  return typeof v === 'string' ? v : fallback;
}
