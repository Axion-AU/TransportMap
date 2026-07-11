import * as bluesky from './adapters/bluesky';
import * as mastodon from './adapters/mastodon';
import { logEvent } from './alerts';
import { getConfig, getConfigString, setConfig } from './config';
import { chatComplete, llmAvailable } from './llm';
import type { Env, MentionRow, Platform } from './types';
import { graphemeLength, nowIso, stripHtml, uuid } from './util';

/**
 * Mention pipeline (§2 architecture): 10-minute poller → LLM triage
 * (reply / ignore / escalate, per the engagement policy) → reply drafts →
 * human review tab → fires immediately on approval.
 *
 * INV-1 applies unchanged: a draft cannot post without a human approver (also
 * enforced by a D1 trigger). Triage goes through OpenRouter; without
 * OPENROUTER_API_KEY mentions stay 'pending' and are handled manually in the UI.
 */

export async function pollMentions(env: Env, now: Date = new Date()): Promise<void> {
  const db = env.DB;

  // Mastodon: cursor on notification id.
  try {
    const sinceId = await getConfigString(db, 'mastodon_last_notif_id');
    const items = await mastodon.fetchMentions(env, sinceId || undefined);
    let maxId = sinceId;
    for (const m of items) {
      if (!maxId || BigInt(m.notifId) > BigInt(maxId || '0')) maxId = m.notifId;
      const ours = m.inReplyToStatusId
        ? await db
            .prepare(`SELECT id FROM posts WHERE platform = 'mastodon' AND platform_post_id = ?`)
            .bind(m.inReplyToStatusId)
            .first<{ id: string }>()
        : null;
      await db
        .prepare(
          `INSERT OR IGNORE INTO mentions
             (id, platform, platform_notif_id, author_handle, text, platform_status_id,
              in_reply_to_post_id, triage, created_at)
           VALUES (?, 'mastodon', ?, ?, ?, ?, ?, 'pending', ?)`
        )
        .bind(uuid(), m.notifId, m.authorHandle, stripHtml(m.html), m.statusId, ours?.id ?? null, nowIso(now))
        .run();
    }
    if (maxId && maxId !== sinceId) await setConfig(db, 'mastodon_last_notif_id', maxId);
  } catch (e) {
    await logEvent(env, 'warn', 'mentions.mastodon_poll_failed', String(e));
  }

  // Bluesky: cursor on indexedAt.
  try {
    const seenAt = await getConfigString(db, 'bsky_last_seen_at');
    const items = await bluesky.fetchMentions(env, seenAt || undefined);
    let maxSeen = seenAt;
    for (const m of items) {
      if (!maxSeen || m.indexedAt > maxSeen) maxSeen = m.indexedAt;
      const ours = m.parentUri
        ? await db
            .prepare(`SELECT id FROM posts WHERE platform = 'bluesky' AND platform_post_id = ?`)
            .bind(m.parentUri)
            .first<{ id: string }>()
        : null;
      await db
        .prepare(
          `INSERT OR IGNORE INTO mentions
             (id, platform, platform_notif_id, author_handle, text, platform_status_id,
              platform_status_cid, root_uri, root_cid, in_reply_to_post_id, triage, created_at)
           VALUES (?, 'bluesky', ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
        )
        .bind(
          uuid(),
          m.notifId,
          m.authorHandle,
          m.text,
          m.uri,
          m.cid,
          m.rootUri,
          m.rootCid,
          ours?.id ?? null,
          nowIso(now)
        )
        .run();
    }
    if (maxSeen && maxSeen !== seenAt) await setConfig(db, 'bsky_last_seen_at', maxSeen);
  } catch (e) {
    await logEvent(env, 'warn', 'mentions.bsky_poll_failed', String(e));
  }

  await triagePending(env, now);
}

interface TriageVerdict {
  action: 'reply' | 'ignore' | 'escalate';
  reason: string;
  draft_reply: string | null;
}

const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['reply', 'ignore', 'escalate'] },
    reason: { type: 'string' },
    draft_reply: { type: ['string', 'null'] },
  },
  required: ['action', 'reason', 'draft_reply'],
  additionalProperties: false,
} as const;

async function triagePending(env: Env, now: Date): Promise<void> {
  if (!llmAvailable(env)) return;
  const db = env.DB;
  const pending = await db
    .prepare(`SELECT * FROM mentions WHERE triage = 'pending' ORDER BY created_at LIMIT 10`)
    .all<MentionRow>();
  if (pending.results.length === 0) return;

  const policy = await getConfig<string>(db, 'engagement_policy');
  const limits = await getConfig<Record<string, number>>(db, 'platform_limits');

  for (const mention of pending.results) {
    let context = '';
    if (mention.in_reply_to_post_id) {
      const parent = await db
        .prepare('SELECT text_final FROM posts WHERE id = ?')
        .bind(mention.in_reply_to_post_id)
        .first<{ text_final: string }>();
      if (parent) context = `\n\nIt replies to our post:\n${parent.text_final}`;
    }

    try {
      const text = await chatComplete(env, {
        system:
          `You triage social media mentions for the Fusion Party (Australia). ` +
          `Engagement policy: ${policy}\n\n` +
          `Classify the mention as reply / ignore / escalate. If reply, draft a ` +
          `courteous, factual reply under ${limits[mention.platform]} characters — ` +
          `no hashtag spam, no sarcasm, on-message. If not replying, draft_reply is null. ` +
          `Every reply is reviewed and approved by a human before posting. ` +
          `Respond with JSON only: {"action": "reply"|"ignore"|"escalate", "reason": string, "draft_reply": string|null}.`,
        user: `Mention on ${mention.platform} from @${mention.author_handle}:\n${mention.text}${context}`,
        jsonSchema: { name: 'triage_verdict', schema: TRIAGE_SCHEMA as unknown as Record<string, unknown> },
      });
      const verdict = JSON.parse(text) as TriageVerdict;

      await db
        .prepare('UPDATE mentions SET triage = ?, triage_reason = ? WHERE id = ?')
        .bind(verdict.action, verdict.reason, mention.id)
        .run();

      if (verdict.action === 'reply' && verdict.draft_reply) {
        await db
          .prepare(
            `INSERT INTO reply_drafts
               (id, mention_id, platform, text_generated, text_final, status, created_at)
             VALUES (?, ?, ?, ?, ?, 'draft', ?)`
          )
          .bind(uuid(), mention.id, mention.platform, verdict.draft_reply, verdict.draft_reply, nowIso(now))
          .run();
      }
      if (verdict.action === 'escalate') {
        await logEvent(env, 'warn', 'mentions.escalated', `${mention.platform} @${mention.author_handle}: ${verdict.reason}`);
      }
    } catch (e) {
      await logEvent(env, 'warn', 'mentions.triage_failed', `${mention.id}: ${e}`);
    }
  }
}

/** Human approval fires the reply immediately (§2 architecture). */
export async function approveAndPostReply(
  env: Env,
  draftId: string,
  approver: string
): Promise<{ ok: boolean; error?: string }> {
  const db = env.DB;
  const draft = await db
    .prepare(`SELECT * FROM reply_drafts WHERE id = ? AND status = 'draft'`)
    .bind(draftId)
    .first<{
      id: string;
      mention_id: string;
      platform: Platform;
      text_final: string;
    }>();
  if (!draft) return { ok: false, error: 'draft not found or not in draft state' };

  const mention = await db
    .prepare('SELECT * FROM mentions WHERE id = ?')
    .bind(draft.mention_id)
    .first<MentionRow>();
  if (!mention) return { ok: false, error: 'mention not found' };

  const limits = await getConfig<Record<string, number>>(db, 'platform_limits');
  const length =
    draft.platform === 'bluesky' ? graphemeLength(draft.text_final) : draft.text_final.length;
  if (length > limits[draft.platform]) {
    return { ok: false, error: `over the ${limits[draft.platform]} limit for ${draft.platform}` };
  }

  try {
    let result;
    if (draft.platform === 'mastodon') {
      const text = `@${mention.author_handle} ${draft.text_final}`;
      result = await mastodon.publishStatus(env, text, mention.platform_status_id ?? undefined);
    } else {
      result = await bluesky.publishPost(env, draft.text_final, {
        rootUri: mention.root_uri ?? mention.platform_status_id!,
        rootCid: mention.root_cid ?? mention.platform_status_cid!,
        parentUri: mention.platform_status_id!,
        parentCid: mention.platform_status_cid!,
      });
    }
    await db
      .prepare(
        `UPDATE reply_drafts
         SET status = 'posted', approved_by = ?, posted_at = ?, platform_post_id = ?
         WHERE id = ? AND status = 'draft'`
      )
      .bind(approver, nowIso(), result.platformPostId, draftId)
      .run();
    return { ok: true };
  } catch (e) {
    await logEvent(env, 'error', 'mentions.reply_post_failed', `${draftId}: ${e}`);
    return { ok: false, error: String(e) };
  }
}
