export interface Env {
  DB: D1Database;
  MASTODON_BASE_URL: string;
  BSKY_SERVICE: string;
  ALERT_WEBHOOK_URL: string;
  ADMIN_TOKEN: string;
  MASTODON_TOKEN: string;
  BSKY_IDENTIFIER: string;
  BSKY_APP_PASSWORD: string;
  OPENROUTER_API_KEY?: string;
}

export type Platform = 'mastodon' | 'bluesky';
export type PostStatus =
  | 'generated'
  | 'approved'
  | 'scheduled'
  | 'posted'
  | 'dismissed'
  | 'expired';
export type RiskTier = 'low' | 'medium' | 'high';
export type AgeBucket = '1h' | '6h' | '24h' | '72h';
export type VolumeLevel = 'low' | 'medium' | 'high';
export type DayType = 'weekday' | 'weekend';

export interface PostRow {
  id: string;
  batch_id: string;
  platform: Platform;
  status: PostStatus;
  origin: 'grinder' | 'manual';
  text_generated: string;
  text_final: string;
  media_refs: string | null;
  link_url: string | null;
  source_url: string | null;
  source_title: string | null;
  topic: string;
  archetype: string;
  narrative_tags: string | null;
  risk_tier: RiskTier;
  risk_notes: string | null;
  length_bucket: string | null;
  has_media: number;
  predicted_score: number | null;
  news_published_at: string | null;
  freshness_expiry: string;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  scheduled_for: string | null;
  posted_at: string | null;
  posted_local_date: string | null;
  posted_slot: string | null;
  platform_post_id: string | null;
  platform_post_url: string | null;
  followers_at_post: number | null;
  metrics_terminal: number;
}

export interface MetricSnapshotRow {
  id: string;
  post_id: string;
  captured_at: string;
  age_bucket: AgeBucket;
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
  followers_at_capture: number;
  partial: number;
}

export interface MentionRow {
  id: string;
  platform: Platform;
  platform_notif_id: string;
  author_handle: string | null;
  text: string | null;
  platform_status_id: string | null;
  platform_status_cid: string | null;
  root_uri: string | null;
  root_cid: string | null;
  in_reply_to_post_id: string | null;
  triage: 'pending' | 'reply' | 'ignore' | 'escalate';
  triage_reason: string | null;
  created_at: string;
}

export interface PublishResult {
  platformPostId: string;
  platformPostUrl: string;
}

export interface EngagementCounts {
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
  deleted?: boolean;
}
