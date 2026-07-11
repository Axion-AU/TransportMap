import { setConfig } from '../config';
import type { EngagementCounts, Env, PublishResult } from '../types';

/**
 * Bluesky AT-protocol adapter (§5.1). App-password sessions are short-lived,
 * so access/refresh JWTs are persisted in the config table and rotated on use.
 */

interface Session {
  did: string;
  accessJwt: string;
  refreshJwt: string;
  handle: string;
}

function svc(env: Env): string {
  return env.BSKY_SERVICE.replace(/\/$/, '');
}

async function createSession(env: Env): Promise<Session> {
  const res = await fetch(`${svc(env)}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: env.BSKY_IDENTIFIER,
      password: env.BSKY_APP_PASSWORD,
    }),
  });
  if (!res.ok) throw new Error(`bsky createSession failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as Session;
}

async function refreshSession(env: Env, refreshJwt: string): Promise<Session | null> {
  const res = await fetch(`${svc(env)}/xrpc/com.atproto.server.refreshSession`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${refreshJwt}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as Session;
}

async function storeSession(db: D1Database, s: Session): Promise<void> {
  await setConfig(db, 'bsky_session', {
    did: s.did,
    accessJwt: s.accessJwt,
    refreshJwt: s.refreshJwt,
    handle: s.handle,
  });
}

async function loadSession(env: Env): Promise<Session> {
  const row = await env.DB.prepare('SELECT value FROM config WHERE key = ?')
    .bind('bsky_session')
    .first<{ value: string }>();
  if (row) return JSON.parse(row.value) as Session;
  const s = await createSession(env);
  await storeSession(env.DB, s);
  return s;
}

/** Authenticated XRPC call with one refresh-and-retry on auth failure. */
async function xrpc(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  let session = await loadSession(env);
  const doFetch = (s: Session) =>
    fetch(`${svc(env)}/xrpc/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${s.accessJwt}`,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  let res = await doFetch(session);
  if (res.status === 400 || res.status === 401) {
    const refreshed =
      (await refreshSession(env, session.refreshJwt)) ?? (await createSession(env));
    await storeSession(env.DB, refreshed);
    session = refreshed;
    res = await doFetch(session);
  }
  return res;
}

/** Byte-offset link facets so URLs are tappable in the composed text. */
export function linkFacets(
  text: string
): Array<{ index: { byteStart: number; byteEnd: number }; features: unknown[] }> {
  const enc = new TextEncoder();
  const facets: Array<{ index: { byteStart: number; byteEnd: number }; features: unknown[] }> = [];
  const re = /https?:\/\/[^\s)\]]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const byteStart = enc.encode(text.slice(0, m.index)).length;
    const byteEnd = byteStart + enc.encode(m[0]).length;
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }],
    });
  }
  return facets;
}

export async function publishPost(
  env: Env,
  text: string,
  reply?: { rootUri: string; rootCid: string; parentUri: string; parentCid: string }
): Promise<PublishResult> {
  const session = await loadSession(env);
  const record: Record<string, unknown> = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString(),
  };
  const facets = linkFacets(text);
  if (facets.length > 0) record.facets = facets;
  if (reply) {
    record.reply = {
      root: { uri: reply.rootUri, cid: reply.rootCid },
      parent: { uri: reply.parentUri, cid: reply.parentCid },
    };
  }
  const res = await xrpc(env, 'com.atproto.repo.createRecord', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repo: session.did,
      collection: 'app.bsky.feed.post',
      record,
    }),
  });
  if (!res.ok) throw new Error(`bsky post failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { uri: string; cid: string };
  const rkey = json.uri.split('/').pop();
  return {
    platformPostId: json.uri,
    platformPostUrl: `https://bsky.app/profile/${session.handle}/post/${rkey}`,
  };
}

/** Batch fetch — app.bsky.feed.getPosts takes up to 25 URIs per call. */
export async function fetchPostCounts(
  env: Env,
  uris: string[]
): Promise<Map<string, EngagementCounts>> {
  const out = new Map<string, EngagementCounts>();
  for (let i = 0; i < uris.length; i += 25) {
    const chunk = uris.slice(i, i + 25);
    const qs = chunk.map((u) => `uris=${encodeURIComponent(u)}`).join('&');
    const res = await xrpc(env, `app.bsky.feed.getPosts?${qs}`);
    if (!res.ok) throw new Error(`bsky getPosts failed: ${res.status}`);
    const json = (await res.json()) as {
      posts: Array<{
        uri: string;
        likeCount?: number;
        repostCount?: number;
        replyCount?: number;
        quoteCount?: number;
      }>;
    };
    const seen = new Set<string>();
    for (const p of json.posts) {
      seen.add(p.uri);
      out.set(p.uri, {
        likes: p.likeCount ?? 0,
        reposts: p.repostCount ?? 0,
        replies: p.replyCount ?? 0,
        quotes: p.quoteCount ?? 0,
      });
    }
    for (const u of chunk) {
      if (!seen.has(u)) out.set(u, { likes: 0, reposts: 0, replies: 0, quotes: 0, deleted: true });
    }
  }
  return out;
}

export async function fetchFollowerCount(env: Env): Promise<number> {
  const session = await loadSession(env);
  const res = await xrpc(
    env,
    `app.bsky.actor.getProfile?actor=${encodeURIComponent(session.did)}`
  );
  if (!res.ok) throw new Error(`bsky getProfile failed: ${res.status}`);
  const json = (await res.json()) as { followersCount: number };
  return json.followersCount ?? 0;
}

export interface BskyMention {
  notifId: string; // we use the notification uri+cid pair as the id
  authorHandle: string;
  uri: string;
  cid: string;
  text: string;
  rootUri: string;
  rootCid: string;
  parentUri: string | null; // uri of the post being replied to, when a reply
  indexedAt: string;
}

export async function fetchMentions(env: Env, seenAt?: string): Promise<BskyMention[]> {
  const res = await xrpc(env, 'app.bsky.notification.listNotifications?limit=50');
  if (!res.ok) throw new Error(`bsky listNotifications failed: ${res.status}`);
  const json = (await res.json()) as {
    notifications: Array<{
      uri: string;
      cid: string;
      reason: string;
      author: { handle: string };
      record: {
        text?: string;
        reply?: { root: { uri: string; cid: string }; parent: { uri: string; cid: string } };
      };
      indexedAt: string;
    }>;
  };
  return json.notifications
    .filter((n) => n.reason === 'mention' || n.reason === 'reply')
    .filter((n) => !seenAt || n.indexedAt > seenAt)
    .map((n) => ({
      notifId: n.uri,
      authorHandle: n.author.handle,
      uri: n.uri,
      cid: n.cid,
      text: n.record.text ?? '',
      rootUri: n.record.reply?.root.uri ?? n.uri,
      rootCid: n.record.reply?.root.cid ?? n.cid,
      parentUri: n.record.reply?.parent.uri ?? null,
      indexedAt: n.indexedAt,
    }));
}
