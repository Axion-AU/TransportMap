import { getConfig, setConfig } from './config';
import { approveAndPostReply } from './mentions';
import { composeText, firePost } from './scheduler';
import { currentSlot } from './slots';
import { transition } from './transitions';
import type { Env, Platform, PostRow, RiskTier } from './types';
import { graphemeLength, hoursFrom, levenshtein, nowIso, spearman, uuid, zScore } from './util';
import { renderAdminPage } from './ui';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function bad(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function authorized(request: Request, env: Env): boolean {
  const header = request.headers.get('Authorization') ?? '';
  return Boolean(env.ADMIN_TOKEN) && header === `Bearer ${env.ADMIN_TOKEN}`;
}

interface TakeInput {
  batch_id?: string;
  platform: Platform;
  text: string;
  media_refs?: unknown[];
  link_url?: string;
  source_url?: string;
  source_title?: string;
  topic: string;
  archetype: string;
  narrative_tags?: string[];
  risk_tier: RiskTier;
  risk_notes?: string;
  length_bucket?: string;
  predicted_score?: number;
  news_published_at?: string;
  freshness_expiry?: string;
}

async function defaultExpiry(db: D1Database, take: TakeInput, now: Date, manual: boolean): Promise<string> {
  const cfg = await getConfig<{
    news_reactive_hours: number;
    evergreen_days: number;
    manual_days: number;
  }>(db, 'freshness');
  const evergreen = await getConfig<string[]>(db, 'evergreen_archetypes');
  if (manual) return hoursFrom(now, cfg.manual_days * 24);
  if (evergreen.includes(take.archetype)) return hoursFrom(now, cfg.evergreen_days * 24);
  const base = take.news_published_at ? new Date(take.news_published_at) : now;
  return hoursFrom(base, cfg.news_reactive_hours);
}

async function insertTake(
  db: D1Database,
  take: TakeInput,
  origin: 'grinder' | 'manual',
  now: Date
): Promise<string> {
  const id = uuid();
  const expiry = take.freshness_expiry ?? (await defaultExpiry(db, take, now, origin === 'manual'));
  const lengthBucket =
    take.length_bucket ?? (take.text.length < 120 ? 'short' : take.text.length < 260 ? 'medium' : 'long');
  await db
    .prepare(
      `INSERT INTO posts
         (id, batch_id, platform, status, origin, text_generated, text_final, media_refs,
          link_url, source_url, source_title, topic, archetype, narrative_tags, risk_tier,
          risk_notes, length_bucket, has_media, predicted_score, news_published_at,
          freshness_expiry, created_at)
       VALUES (?, ?, ?, 'generated', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      take.batch_id ?? uuid(),
      take.platform,
      origin,
      take.text,
      take.text,
      take.media_refs ? JSON.stringify(take.media_refs) : null,
      take.link_url ?? null,
      take.source_url ?? null,
      take.source_title ?? null,
      take.topic,
      take.archetype,
      take.narrative_tags ? JSON.stringify(take.narrative_tags) : null,
      take.risk_tier,
      take.risk_notes ?? null,
      lengthBucket,
      take.media_refs && take.media_refs.length > 0 ? 1 : 0,
      take.predicted_score ?? null,
      take.news_published_at ?? null,
      expiry,
      nowIso(now)
    )
    .run();
  return id;
}

async function getPost(db: D1Database, id: string): Promise<PostRow | null> {
  return db.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<PostRow>();
}

/** Platform limit check used at approval time (§4.1). */
async function overLimit(db: D1Database, post: PostRow): Promise<string | null> {
  const limits = await getConfig<Record<string, number>>(db, 'platform_limits');
  const text = composeText(post);
  const length = post.platform === 'bluesky' ? graphemeLength(text) : text.length;
  if (length > limits[post.platform]) {
    return `${length} exceeds the ${limits[post.platform]} limit for ${post.platform} (link included)`;
  }
  return null;
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const db = env.DB;
  const now = new Date();

  if (method === 'GET' && (path === '/' || path === '/index.html')) {
    return new Response(renderAdminPage(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (!path.startsWith('/api/')) return bad('not found', 404);
  if (!authorized(request, env)) return bad('unauthorized', 401);

  const body = async <T>(): Promise<T> => (await request.json()) as T;
  const seg = path.split('/').filter(Boolean); // ['api', ...]

  // ---- ingestion -----------------------------------------------------------

  if (method === 'POST' && path === '/api/ingest') {
    const payload = await body<{ takes: TakeInput[] }>();
    if (!Array.isArray(payload.takes)) return bad('takes must be an array');
    const ids: string[] = [];
    for (const t of payload.takes) ids.push(await insertTake(db, t, 'grinder', now));
    return json({ ids });
  }

  if (method === 'POST' && path === '/api/posts') {
    // Manual take entry (§4.2): enters at generated, same review gate.
    const t = await body<TakeInput & { author?: string }>();
    if (!t.platform || !t.text || !t.topic || !t.archetype || !t.risk_tier) {
      return bad('platform, text, topic, archetype, risk_tier are required');
    }
    const id = await insertTake(db, t, 'manual', now);
    if (t.author) {
      await db
        .prepare('UPDATE posts SET risk_notes = COALESCE(risk_notes, ?) WHERE id = ?')
        .bind(`author: ${t.author}`, id)
        .run();
    }
    return json({ id });
  }

  // ---- review queue --------------------------------------------------------

  if (method === 'GET' && path === '/api/posts') {
    const status = url.searchParams.get('status');
    const platform = url.searchParams.get('platform');
    const clauses: string[] = [];
    const binds: string[] = [];
    if (status) {
      clauses.push('status = ?');
      binds.push(status);
    }
    if (platform) {
      clauses.push('platform = ?');
      binds.push(platform);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await db
      .prepare(`SELECT * FROM posts ${where} ORDER BY created_at DESC LIMIT 100`)
      .bind(...binds)
      .all<PostRow>();
    return json(rows.results);
  }

  if (seg[1] === 'posts' && seg.length === 4 && method === 'POST') {
    const id = seg[2];
    const action = seg[3];
    const post = await getPost(db, id);
    if (!post) return bad('post not found', 404);

    switch (action) {
      case 'edit': {
        // §4.1: save writes text_final + an edit_pairs row. Human editors only;
        // content locks at publish (D1 trigger backs this up).
        if (!['generated', 'approved'].includes(post.status)) {
          return bad(`cannot edit a ${post.status} post`);
        }
        const { text, editor } = await body<{ text: string; editor?: string }>();
        if (typeof text !== 'string' || text.length === 0) return bad('text required');
        if (text !== post.text_final) {
          await db
            .prepare(
              `INSERT INTO edit_pairs
                 (id, post_id, platform, text_before, text_after, edit_distance, editor, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              uuid(),
              id,
              post.platform,
              post.text_final,
              text,
              levenshtein(post.text_final, text),
              editor ?? null,
              nowIso(now)
            )
            .run();
          await db.prepare('UPDATE posts SET text_final = ? WHERE id = ?').bind(text, id).run();
        }
        return json({ ok: true });
      }
      case 'approve': {
        const { approver } = await body<{ approver: string }>();
        if (!approver) return bad('approver identity is required (INV-1)');
        const limitErr = await overLimit(db, post);
        if (limitErr) return bad(limitErr);
        const ok = await transition(db, id, 'generated', 'approved', {
          approved_at: nowIso(now),
          approved_by: approver,
        });
        return ok ? json({ ok: true }) : bad('post is not in generated state');
      }
      case 'dismiss': {
        const from = post.status;
        if (from !== 'generated' && from !== 'approved') {
          return bad(`cannot dismiss a ${from} post`);
        }
        const ok = await transition(db, id, from, 'dismissed');
        return ok ? json({ ok: true }) : bad('dismiss failed');
      }
      case 'expiry': {
        const { freshness_expiry } = await body<{ freshness_expiry: string }>();
        if (!freshness_expiry) return bad('freshness_expiry required');
        await db
          .prepare('UPDATE posts SET freshness_expiry = ? WHERE id = ?')
          .bind(freshness_expiry, id)
          .run();
        return json({ ok: true });
      }
      case 'unschedule': {
        const ok = await transition(db, id, 'scheduled', 'approved', { scheduled_for: null });
        return ok ? json({ ok: true }) : bad('post is not scheduled');
      }
      case 'fire': {
        // Manual slotting: how high-risk (and any urgent) approved posts are
        // published — an explicit human action, so INV-1 holds.
        if (post.status !== 'approved') return bad('only approved posts can be fired');
        const limitErr = await overLimit(db, post);
        if (limitErr) return bad(limitErr);
        const ok = await firePost(env, post, currentSlot(now), now);
        return ok ? json({ ok: true }) : bad('publish failed; post reverted to approved', 502);
      }
      default:
        return bad('unknown action', 404);
    }
  }

  // ---- mentions + replies --------------------------------------------------

  if (method === 'GET' && path === '/api/mentions') {
    const triage = url.searchParams.get('triage');
    const rows = triage
      ? await db
          .prepare('SELECT * FROM mentions WHERE triage = ? ORDER BY created_at DESC LIMIT 100')
          .bind(triage)
          .all()
      : await db.prepare('SELECT * FROM mentions ORDER BY created_at DESC LIMIT 100').all();
    return json(rows.results);
  }

  if (seg[1] === 'mentions' && seg.length === 4 && method === 'POST') {
    const id = seg[2];
    if (seg[3] === 'triage') {
      const { action } = await body<{ action: 'ignore' | 'escalate' }>();
      if (!['ignore', 'escalate'].includes(action)) return bad('action must be ignore|escalate');
      await db.prepare('UPDATE mentions SET triage = ?, triage_reason = ? WHERE id = ?')
        .bind(action, 'manual override', id)
        .run();
      return json({ ok: true });
    }
    if (seg[3] === 'draft') {
      // Human-authored reply draft; still goes through approve-to-post.
      const { text } = await body<{ text: string }>();
      const mention = await db.prepare('SELECT * FROM mentions WHERE id = ?').bind(id).first<{
        platform: Platform;
      }>();
      if (!mention) return bad('mention not found', 404);
      if (!text) return bad('text required');
      const draftId = uuid();
      await db
        .prepare(
          `INSERT INTO reply_drafts
             (id, mention_id, platform, text_generated, text_final, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'draft', ?)`
        )
        .bind(draftId, id, mention.platform, text, text, nowIso(now))
        .run();
      await db.prepare(`UPDATE mentions SET triage = 'reply' WHERE id = ?`).bind(id).run();
      return json({ id: draftId });
    }
  }

  if (method === 'GET' && path === '/api/replies') {
    const rows = await db
      .prepare(
        `SELECT rd.*, m.author_handle, m.text AS mention_text
         FROM reply_drafts rd JOIN mentions m ON m.id = rd.mention_id
         ORDER BY rd.created_at DESC LIMIT 100`
      )
      .all();
    return json(rows.results);
  }

  if (seg[1] === 'replies' && seg.length === 4 && method === 'POST') {
    const id = seg[2];
    switch (seg[3]) {
      case 'edit': {
        const { text } = await body<{ text: string }>();
        if (!text) return bad('text required');
        const res = await db
          .prepare(`UPDATE reply_drafts SET text_final = ? WHERE id = ? AND status = 'draft'`)
          .bind(text, id)
          .run();
        return (res.meta.changes ?? 0) > 0 ? json({ ok: true }) : bad('draft not editable');
      }
      case 'approve': {
        const { approver } = await body<{ approver: string }>();
        if (!approver) return bad('approver identity is required (INV-1)');
        const result = await approveAndPostReply(env, id, approver);
        return result.ok ? json({ ok: true }) : bad(result.error ?? 'failed', 502);
      }
      case 'dismiss': {
        await db
          .prepare(`UPDATE reply_drafts SET status = 'dismissed' WHERE id = ? AND status = 'draft'`)
          .bind(id)
          .run();
        return json({ ok: true });
      }
    }
  }

  // ---- performance / calibration ------------------------------------------

  if (method === 'GET' && path === '/api/calibration') {
    // §4.4: prediction and outcome are kept independent, so every posted take
    // yields a free (predicted_score, realised reward) pair.
    const platform = url.searchParams.get('platform') ?? 'mastodon';
    const since = new Date(now.getTime() - 90 * 86400_000).toISOString();
    const rows = await db
      .prepare(
        `SELECT p.id, p.text_final, p.predicted_score,
                COALESCE(pr.corrected_reward, pr.reward) AS reward
         FROM posts p JOIN post_rewards pr ON pr.post_id = p.id
         WHERE p.platform = ? AND p.predicted_score IS NOT NULL AND p.posted_at >= ?
         ORDER BY p.posted_at DESC LIMIT 500`
      )
      .bind(platform, since)
      .all<{ id: string; text_final: string; predicted_score: number; reward: number }>();
    const pts = rows.results;
    const rho = spearman(
      pts.map((p) => p.predicted_score),
      pts.map((p) => p.reward)
    );
    const predSample = pts.map((p) => p.predicted_score);
    const rewardSample = pts.map((p) => p.reward);
    const withGap = pts.map((p) => ({
      ...p,
      gap: zScore(p.predicted_score, predSample) - zScore(p.reward, rewardSample),
    }));
    const sorted = [...withGap].sort((a, b) => b.gap - a.gap);
    return json({
      platform,
      n: pts.length,
      spearman: rho,
      points: pts,
      overconfident: sorted.slice(0, 5),
      underrated: sorted.slice(-5).reverse(),
    });
  }

  if (method === 'GET' && path === '/api/arms') {
    const arms = await db
      .prepare('SELECT * FROM bandit_arms ORDER BY platform, slot, archetype')
      .all();
    const cadence = await db
      .prepare('SELECT * FROM cadence_arms ORDER BY platform, day_type, volume_level')
      .all();
    const days = await db
      .prepare('SELECT * FROM cadence_days ORDER BY date DESC LIMIT 30')
      .all();
    return json({ slot_arms: arms.results, cadence_arms: cadence.results, cadence_days: days.results });
  }

  if (method === 'GET' && path === '/api/stats') {
    const statuses = await db
      .prepare('SELECT status, platform, COUNT(*) AS c FROM posts GROUP BY status, platform')
      .all<{ status: string; platform: string; c: number }>();
    const expiredRecent = await db
      .prepare(`SELECT COUNT(*) AS c FROM posts WHERE status = 'expired'`)
      .first<{ c: number }>();
    const events = await db
      .prepare('SELECT * FROM events_log ORDER BY created_at DESC LIMIT 50')
      .all();
    return json({
      by_status: statuses.results,
      expired_total: expiredRecent?.c ?? 0,
      recent_events: events.results,
    });
  }

  // ---- prompt feedback + style rules ----------------------------------------

  if (method === 'GET' && path === '/api/prompt-feedback') {
    // Pulled by the generator to build its system prompt (§4.3).
    return json({
      block: await getConfig<string>(db, 'prompt_feedback_block'),
      style: await getConfig<string>(db, 'prompt_feedback_style'),
      top_performers: await getConfig<string>(db, 'prompt_feedback_top'),
      approved_style_rules: await getConfig<string>(db, 'approved_style_rules'),
      quality_bar: await getConfig<number>(db, 'quality_bar'),
    });
  }

  if (method === 'GET' && path === '/api/style-rules') {
    const rows = await db
      .prepare('SELECT * FROM style_rule_proposals ORDER BY created_at DESC LIMIT 24')
      .all();
    return json(rows.results);
  }

  if (seg[1] === 'style-rules' && seg.length === 4 && seg[3] === 'review' && method === 'POST') {
    const { decision, reviewer } = await body<{ decision: 'approved' | 'rejected'; reviewer: string }>();
    if (!['approved', 'rejected'].includes(decision)) return bad('decision must be approved|rejected');
    if (!reviewer) return bad('reviewer required');
    const proposal = await db
      .prepare(`SELECT * FROM style_rule_proposals WHERE id = ? AND status = 'proposed'`)
      .bind(seg[2])
      .first<{ rules: string }>();
    if (!proposal) return bad('proposal not found or already reviewed', 404);
    await db
      .prepare('UPDATE style_rule_proposals SET status = ?, reviewed_by = ? WHERE id = ?')
      .bind(decision, reviewer, seg[2])
      .run();
    if (decision === 'approved') {
      const current = await getConfig<string>(db, 'approved_style_rules');
      const combined = [typeof current === 'string' ? current : '', proposal.rules]
        .filter(Boolean)
        .join('\n');
      await setConfig(db, 'approved_style_rules', combined);
    }
    return json({ ok: true });
  }

  // ---- config ----------------------------------------------------------------

  if (method === 'GET' && path === '/api/config') {
    const rows = await db.prepare('SELECT key, value, updated_at FROM config').all();
    return json(rows.results);
  }

  if (method === 'PUT' && path === '/api/config') {
    const { key, value } = await body<{ key: string; value: unknown }>();
    if (!key) return bad('key required');
    await setConfig(db, key, value);
    return json({ ok: true });
  }

  return bad('not found', 404);
}
