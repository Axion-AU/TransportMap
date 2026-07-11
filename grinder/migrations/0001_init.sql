-- Meat Grinder analytics loop + scheduler — initial schema.
-- Invariants INV-1..INV-4 (spec §1) are enforced here with triggers, not just in
-- application code.

CREATE TABLE posts (
  id            TEXT PRIMARY KEY,
  batch_id      TEXT NOT NULL,
  platform      TEXT NOT NULL CHECK (platform IN ('mastodon','bluesky')),
  status        TEXT NOT NULL CHECK (status IN
                  ('generated','approved','scheduled','posted','dismissed','expired')),
  origin        TEXT NOT NULL DEFAULT 'grinder' CHECK (origin IN ('grinder','manual')),

  -- content
  text_generated  TEXT NOT NULL,          -- original LLM output, never mutated (trigger below)
  text_final      TEXT NOT NULL,          -- what will actually post (starts = generated)
  media_refs      TEXT,                   -- JSON array of media asset refs, nullable
  link_url        TEXT,

  -- generation-time metadata
  source_url      TEXT,
  source_title    TEXT,
  topic           TEXT NOT NULL,
  archetype       TEXT NOT NULL,
  narrative_tags  TEXT,                   -- JSON array
  risk_tier       TEXT NOT NULL CHECK (risk_tier IN ('low','medium','high')),
  risk_notes      TEXT,
  length_bucket   TEXT,
  has_media       INTEGER NOT NULL DEFAULT 0,
  predicted_score REAL,                   -- LLM self-assessment; display + calibration ONLY.
                                          -- Must never enter scheduling or reward paths (§4.4).

  -- freshness
  news_published_at  TEXT,
  freshness_expiry   TEXT NOT NULL,

  -- lifecycle / provenance (INV-4)
  created_at        TEXT NOT NULL,
  approved_at       TEXT,
  approved_by       TEXT,
  scheduled_for     TEXT,
  posted_at         TEXT,
  posted_local_date TEXT,                 -- Australia/Melbourne local date at publish
  posted_slot       TEXT,                 -- slot key the scheduler fired in, e.g. weekday_0930
  platform_post_id  TEXT,
  platform_post_url TEXT,
  followers_at_post INTEGER,
  metrics_terminal  INTEGER NOT NULL DEFAULT 0   -- post deleted upstream; stop polling
);

CREATE INDEX idx_posts_pool   ON posts (platform, status, freshness_expiry);
CREATE INDEX idx_posts_posted ON posts (platform, status, posted_at);

-- INV-2: text_generated is write-once.
CREATE TRIGGER trg_text_generated_immutable
BEFORE UPDATE OF text_generated ON posts
WHEN NEW.text_generated <> OLD.text_generated
BEGIN
  SELECT RAISE(ABORT, 'INV-2: text_generated is write-once');
END;

-- INV-2: content becomes immutable at publish time.
CREATE TRIGGER trg_posted_content_locked
BEFORE UPDATE OF text_final ON posts
WHEN OLD.status = 'posted' AND NEW.text_final <> OLD.text_final
BEGIN
  SELECT RAISE(ABORT, 'INV-2: content is immutable after publish');
END;

-- INV-1: nothing reaches scheduled/posted without recorded human approval.
CREATE TRIGGER trg_require_approval
BEFORE UPDATE OF status ON posts
WHEN NEW.status IN ('scheduled','posted')
     AND (NEW.approved_at IS NULL OR NEW.approved_by IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'INV-1: no publish path without human approval');
END;

-- INV-1: rows can only be inserted in the pre-approval state.
CREATE TRIGGER trg_insert_generated_only
BEFORE INSERT ON posts
WHEN NEW.status <> 'generated'
BEGIN
  SELECT RAISE(ABORT, 'posts must enter the pipeline as generated');
END;

-- posted is terminal.
CREATE TRIGGER trg_posted_terminal
BEFORE UPDATE OF status ON posts
WHEN OLD.status = 'posted' AND NEW.status <> 'posted'
BEGIN
  SELECT RAISE(ABORT, 'posted is a terminal status');
END;

CREATE TABLE edit_pairs (
  id            TEXT PRIMARY KEY,
  post_id       TEXT NOT NULL REFERENCES posts(id),
  platform      TEXT NOT NULL,
  text_before   TEXT NOT NULL,
  text_after    TEXT NOT NULL,
  edit_distance INTEGER,
  editor        TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_edit_pairs_created ON edit_pairs (created_at);

CREATE TABLE metric_snapshots (
  id            TEXT PRIMARY KEY,
  post_id       TEXT NOT NULL REFERENCES posts(id),
  captured_at   TEXT NOT NULL,
  age_bucket    TEXT NOT NULL CHECK (age_bucket IN ('1h','6h','24h','72h')),
  likes         INTEGER NOT NULL DEFAULT 0,
  reposts       INTEGER NOT NULL DEFAULT 0,
  replies       INTEGER NOT NULL DEFAULT 0,
  quotes        INTEGER NOT NULL DEFAULT 0,
  followers_at_capture INTEGER NOT NULL,
  partial       INTEGER NOT NULL DEFAULT 0,   -- captured >2h past its window (§5.2)
  UNIQUE (post_id, age_bucket)
);

CREATE TABLE account_snapshots (
  platform     TEXT NOT NULL,
  captured_at  TEXT NOT NULL,               -- local date, Australia/Melbourne
  followers    INTEGER NOT NULL,
  PRIMARY KEY (platform, captured_at)
);

CREATE TABLE bandit_arms (
  platform     TEXT NOT NULL,
  slot         TEXT NOT NULL,
  archetype    TEXT NOT NULL,
  mean         REAL NOT NULL DEFAULT 0,
  variance     REAL NOT NULL DEFAULT 1,
  n_pulls      INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT,
  PRIMARY KEY (platform, slot, archetype)
);

CREATE TABLE cadence_arms (
  platform     TEXT NOT NULL,
  day_type     TEXT NOT NULL CHECK (day_type IN ('weekday','weekend')),
  volume_level TEXT NOT NULL CHECK (volume_level IN ('low','medium','high')),
  mean         REAL NOT NULL DEFAULT 0,
  variance     REAL NOT NULL DEFAULT 1,
  n_pulls      INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT,
  PRIMARY KEY (platform, day_type, volume_level)
);

CREATE TABLE cadence_days (
  platform      TEXT NOT NULL,
  date          TEXT NOT NULL,               -- local date, Australia/Melbourne
  day_type      TEXT NOT NULL,
  volume_level  TEXT NOT NULL,
  target_volume INTEGER NOT NULL,
  actual_volume INTEGER NOT NULL DEFAULT 0,
  day_reward    REAL,                        -- computed at date+72h
  PRIMARY KEY (platform, date)
);

CREATE TABLE config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,                  -- JSON
  updated_at TEXT NOT NULL
);

-- Reward bookkeeping (not in the spec's table list, but the z-score windows,
-- 72h correction pass and calibration view all need stored per-post rewards).
CREATE TABLE post_rewards (
  post_id          TEXT PRIMARY KEY REFERENCES posts(id),
  platform         TEXT NOT NULL,
  raw_reward       REAL NOT NULL,
  engagement_z     REAL NOT NULL,
  follower_delta   REAL NOT NULL DEFAULT 0,  -- per-post attributed raw delta
  follower_delta_z REAL NOT NULL DEFAULT 0,
  reward           REAL NOT NULL,
  computed_at      TEXT NOT NULL,
  corrected_at     TEXT,
  corrected_reward REAL
);
CREATE INDEX idx_post_rewards_platform ON post_rewards (platform, computed_at);

-- Mention pipeline (architecture §2: mention poller → triage → reply review).
CREATE TABLE mentions (
  id                  TEXT PRIMARY KEY,
  platform            TEXT NOT NULL,
  platform_notif_id   TEXT NOT NULL,
  author_handle       TEXT,
  text                TEXT,
  platform_status_id  TEXT,                  -- status id (mastodon) / at:// uri (bluesky)
  platform_status_cid TEXT,                  -- bluesky
  root_uri            TEXT,
  root_cid            TEXT,
  in_reply_to_post_id TEXT,                  -- our posts.id when resolvable
  triage              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (triage IN ('pending','reply','ignore','escalate')),
  triage_reason       TEXT,
  created_at          TEXT NOT NULL,
  UNIQUE (platform, platform_notif_id)
);

CREATE TABLE reply_drafts (
  id               TEXT PRIMARY KEY,
  mention_id       TEXT NOT NULL REFERENCES mentions(id),
  platform         TEXT NOT NULL,
  text_generated   TEXT NOT NULL,
  text_final       TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','posted','dismissed')),
  approved_by      TEXT,
  posted_at        TEXT,
  platform_post_id TEXT,
  created_at       TEXT NOT NULL
);

-- INV-1 for replies: a draft cannot become posted without an approver.
CREATE TRIGGER trg_reply_require_approval
BEFORE UPDATE OF status ON reply_drafts
WHEN NEW.status = 'posted' AND NEW.approved_by IS NULL
BEGIN
  SELECT RAISE(ABORT, 'INV-1: replies require human approval');
END;

-- Monthly diff-analysis output; human-approved before entering the prompt (§4.3).
CREATE TABLE style_rule_proposals (
  id          TEXT PRIMARY KEY,
  month       TEXT NOT NULL,
  rules       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'proposed'
                CHECK (status IN ('proposed','approved','rejected')),
  reviewed_by TEXT,
  created_at  TEXT NOT NULL
);

-- Operational log: adapter failures, expiries, alerts (§7.2 step 11 / §9).
CREATE TABLE events_log (
  id         TEXT PRIMARY KEY,
  level      TEXT NOT NULL CHECK (level IN ('info','warn','error')),
  kind       TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_events_log_created ON events_log (created_at);
