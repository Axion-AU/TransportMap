# Meat Grinder — analytics loop + autonomous scheduler

Cloudflare Workers implementation of the "Meat Grinder: Analytics Loop + Autonomous
Scheduler Spec" v1.0 (July 2026): editorial capture, engagement metrics ingestion,
a Thompson-sampling scheduler over the approved pool, a daily cadence bandit, the
prompt feedback loop, and the mention → triage → reply-review pipeline.

> **Repo note.** The existing grinder (news ingestion + take generation) is not in
> this repository, so this ships as a self-contained worker. The generator
> integrates through two endpoints: it pushes takes to `POST /api/ingest` and pulls
> its prompt-feedback block from `GET /api/prompt-feedback`.

## Layout

```
grinder/
  wrangler.toml            worker config: D1 binding, cron triggers, vars
  migrations/0001_init.sql D1 schema + invariant triggers
  src/
    index.ts               fetch router + cron dispatcher
    api.ts                 admin/generator HTTP API
    ui.ts                  single-page admin UI (review queue, replies, performance)
    scheduler.ts           §7.2 slot tick: candidates → urgency → risk → diversity → TS
    cadence.ts             §7.4 daily volume bandit
    bandit.ts              Gaussian Thompson sampling + conjugate updates
    reward.ts              §6 reward, z-scoring, 72h correction, follower delta
    metrics.ts             §5 snapshot poller + daily account snapshots
    feedback.ts            §4.3 weekly prompt refresh + monthly LLM diff analysis
    mentions.ts            mention poller, LLM triage, approve-to-post replies
    slots.ts               Australia/Melbourne DST-aware slot grid
    adapters/              mastodon.ts (REST), bluesky.ts (AT proto + JWT refresh)
    transitions.ts         status transition map (guarded compare-and-set updates)
    config.ts              config table access + tunable defaults (§3.7)
    alerts.ts              events_log + optional webhook alerting
```

## Setup

```sh
cd grinder
npm install
npx wrangler d1 create meat-grinder        # put the id in wrangler.toml
npm run migrate                            # apply migrations/0001_init.sql
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put MASTODON_TOKEN     # read:statuses read:notifications write:statuses
npx wrangler secret put BSKY_IDENTIFIER
npx wrangler secret put BSKY_APP_PASSWORD
npx wrangler secret put ANTHROPIC_API_KEY  # optional: triage + monthly style analysis
npm run deploy
```

Set `MASTODON_BASE_URL` in `wrangler.toml` to the party's instance. Open the
worker URL, paste the admin token, and set your name (recorded as editor /
approver identity — INV-4 provenance).

## Invariants and where they are enforced

| Invariant | Enforcement |
|---|---|
| INV-1: nothing publishes without human approval | D1 triggers `trg_require_approval`, `trg_insert_generated_only`, `trg_reply_require_approval`; transition map in `transitions.ts` |
| INV-2: LLM/scheduler never modify content | `trg_text_generated_immutable` (write-once), `trg_posted_content_locked` (immutable at publish); only the `edit`/`reply edit` endpoints touch `text_final`, and both are human-driven |
| INV-3: scheduler picks timing only | `scheduler.ts` selects rows from the approved pool; it has no write path to any text column |
| INV-4: full provenance | `posts` retains source, generated text, `edit_pairs` chain, approver, publish timestamps, platform ids |
| §4.4 hard rule: `predicted_score` never influences scheduling or rewards | the column is not referenced anywhere in `scheduler.ts`, `cadence.ts`, `bandit.ts`, or `reward.ts` — only in the calibration endpoint and UI display |

High-risk posts are never auto-scheduled; they are published only through the
explicit **Fire now** action in the pool tab (manual slotting). Risk windows for
medium-risk posts apply even under the urgency override — freshness beats
optimality, not safety.

## Cron layout

| Schedule | Work |
|---|---|
| `*/10` | mention poller + LLM triage |
| `*/15` | metric snapshots (1h/6h/24h/72h), reward computation, 72h correction |
| `0,30` | scheduler tick, expiry sweep, cadence morning sample (first tick ≥ 05:00 local), daily account snapshots, weekly feedback refresh, monthly style analysis, log pruning |

Weekly/monthly jobs key off config markers, not extra cron slots.

## D1 free-tier budget

Limits: 5M rows read/day, 100K rows written/day, 5 GB. Steady state at ~10
posts/day/platform:

- **Reads.** Every hot query is index-backed and `LIMIT`ed. Worst-case tick costs:
  metrics poller ~a few hundred row reads (bounded to posts < 80h old, ≤ 200 rows),
  scheduler ~a hundred (candidate pool capped at 100), mention poller ~tens.
  ≈ 144 + 96 + 48 runs/day ⇒ well under ~100K reads/day, i.e. ~2% of the free tier.
- **Writes.** Snapshots (≤ 4/post), rewards (1–2/post), arm updates, cadence rows
  (2/day), config markers (written only when a job actually runs), and warn/error
  logs ⇒ low hundreds/day against the 100K cap.
- **Storage.** Text rows only; `events_log` is pruned to 14 days. Years of
  headroom inside 5 GB.

## Spec deviations / assumptions (flag on review)

- **§7.4 was truncated** in the brief. Day reward implemented as the mean
  effective post reward for the day, computed at date+72h; zero-post days record
  0 without updating the arm. Adjust in `cadence.ts` if the full spec differs.
- **§§8–9 were not included.** Mentions follow the §2 architecture diagram;
  alerting is `events_log` + optional `ALERT_WEBHOOK_URL` POSTs on errors.
- **Media**: `media_refs` is stored and surfaced, but adapters post text-only —
  the spec doesn't define media storage/upload. Wire up `POST /api/v1/media` and
  `uploadBlob` when an asset store exists.
- **post_rewards table** added beyond the spec's list: the trailing z-score
  windows, correction pass, cadence day rewards and calibration view all need
  persisted per-post rewards.
- **bskyhub CSV import** (§4.4 migration note): nothing here consumes it; retire
  it when this ships.

## Testing

`npm test` covers the pure logic: conjugate updates and sampling moments,
Melbourne slot/DST conversion, the transition map (including every INV-1 bypass
path), reward weighting, grapheme counting, and bluesky facet byte offsets.
`npm run typecheck` for the rest. Anything touching D1/network is exercised via
`wrangler dev` + `migrate:local`.
