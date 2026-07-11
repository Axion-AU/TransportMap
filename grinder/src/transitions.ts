import type { PostStatus } from './types';

/**
 * Allowed status transitions (§3.1 notes). Anything not listed is rejected.
 * The D1 triggers additionally enforce INV-1 (approval before scheduled/posted)
 * at the data layer.
 */
export const TRANSITIONS: Record<PostStatus, PostStatus[]> = {
  generated: ['approved', 'dismissed'],
  approved: ['scheduled', 'expired', 'dismissed'],
  scheduled: ['posted', 'approved'], // approved = unschedule
  posted: [],
  dismissed: [],
  expired: [],
};

export function canTransition(from: PostStatus, to: PostStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Guarded status transition: the UPDATE only applies while the row is still in
 * `from`, so concurrent ticks can't double-fire a post. Extra column updates
 * ride along atomically.
 */
export async function transition(
  db: D1Database,
  postId: string,
  from: PostStatus,
  to: PostStatus,
  extra: Record<string, string | number | null> = {}
): Promise<boolean> {
  if (!canTransition(from, to)) {
    throw new Error(`illegal transition ${from} -> ${to}`);
  }
  const cols = Object.keys(extra);
  const setClause = ['status = ?', ...cols.map((c) => `${c} = ?`)].join(', ');
  const res = await db
    .prepare(`UPDATE posts SET ${setClause} WHERE id = ? AND status = ?`)
    .bind(to, ...cols.map((c) => extra[c]), postId, from)
    .run();
  return (res.meta.changes ?? 0) > 0;
}
