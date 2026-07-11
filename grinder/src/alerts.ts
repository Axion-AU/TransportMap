import type { Env } from './types';
import { nowIso, uuid } from './util';

/**
 * Operational logging + alerting (§7.2 step 11; spec §9 was not included in
 * the brief, so this is intentionally minimal: an events_log table surfaced in
 * the admin UI, plus an optional webhook for error-level events).
 *
 * D1 budget: only warn/error and rare info events are logged; the table is
 * pruned to 14 days by the housekeeping tick.
 */

export async function logEvent(
  env: Env,
  level: 'info' | 'warn' | 'error',
  kind: string,
  detail?: string
): Promise<void> {
  try {
    await env.DB.prepare(
      'INSERT INTO events_log (id, level, kind, detail, created_at) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(uuid(), level, kind, detail ?? null, nowIso())
      .run();
  } catch {
    // never let logging break the pipeline
  }
  if (level === 'error' && env.ALERT_WEBHOOK_URL) {
    try {
      await fetch(env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'meat-grinder', level, kind, detail, at: nowIso() }),
      });
    } catch {
      // alerting is best-effort
    }
  }
}

export async function pruneEventsLog(db: D1Database, retainDays = 14): Promise<void> {
  const cutoff = new Date(Date.now() - retainDays * 86400_000).toISOString();
  await db.prepare('DELETE FROM events_log WHERE created_at < ?').bind(cutoff).run();
}
