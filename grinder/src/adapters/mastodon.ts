import type { EngagementCounts, Env, PublishResult } from '../types';

/**
 * Mastodon REST adapter (§5.1). Auth: account token with
 * read:statuses read:notifications write:statuses.
 */

function base(env: Env): string {
  return env.MASTODON_BASE_URL.replace(/\/$/, '');
}

function headers(env: Env): Record<string, string> {
  return { Authorization: `Bearer ${env.MASTODON_TOKEN}` };
}

async function req(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${base(env)}${path}`, {
    ...init,
    headers: { ...headers(env), ...(init.headers as Record<string, string> | undefined) },
  });
}

export async function publishStatus(
  env: Env,
  text: string,
  inReplyToId?: string
): Promise<PublishResult> {
  const body = new URLSearchParams({ status: text });
  if (inReplyToId) body.set('in_reply_to_id', inReplyToId);
  const res = await req(env, '/api/v1/statuses', {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // dedupe safety if a tick retries
      'Idempotency-Key': crypto.randomUUID(),
    },
  });
  if (!res.ok) throw new Error(`mastodon post failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { id: string; url: string };
  return { platformPostId: json.id, platformPostUrl: json.url };
}

export async function fetchStatusCounts(env: Env, id: string): Promise<EngagementCounts> {
  const res = await req(env, `/api/v1/statuses/${encodeURIComponent(id)}`);
  if (res.status === 404) return { likes: 0, reposts: 0, replies: 0, quotes: 0, deleted: true };
  if (!res.ok) throw new Error(`mastodon status fetch failed: ${res.status}`);
  const json = (await res.json()) as {
    favourites_count: number;
    reblogs_count: number;
    replies_count: number;
  };
  return {
    likes: json.favourites_count ?? 0,
    reposts: json.reblogs_count ?? 0,
    replies: json.replies_count ?? 0,
    quotes: 0, // mastodon has no quote counts (§3.3)
  };
}

export async function fetchFollowerCount(env: Env): Promise<number> {
  const res = await req(env, '/api/v1/accounts/verify_credentials');
  if (!res.ok) throw new Error(`mastodon verify_credentials failed: ${res.status}`);
  const json = (await res.json()) as { followers_count: number };
  return json.followers_count ?? 0;
}

export interface MastodonMention {
  notifId: string;
  authorHandle: string;
  statusId: string;
  html: string;
  inReplyToStatusId: string | null;
}

export async function fetchMentions(env: Env, sinceId?: string): Promise<MastodonMention[]> {
  const qs = new URLSearchParams({ 'types[]': 'mention', limit: '30' });
  if (sinceId) qs.set('since_id', sinceId);
  const res = await req(env, `/api/v1/notifications?${qs}`);
  if (!res.ok) throw new Error(`mastodon notifications failed: ${res.status}`);
  const json = (await res.json()) as Array<{
    id: string;
    account: { acct: string };
    status?: { id: string; content: string; in_reply_to_id: string | null };
  }>;
  return json
    .filter((n) => n.status)
    .map((n) => ({
      notifId: n.id,
      authorHandle: n.account.acct,
      statusId: n.status!.id,
      html: n.status!.content,
      inReplyToStatusId: n.status!.in_reply_to_id,
    }));
}
