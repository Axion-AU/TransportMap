import { logEvent } from './alerts';
import { getConfig, getConfigString, setConfig } from './config';
import { chatComplete, llmAvailable } from './llm';
import type { Env } from './types';
import { estimateTokens, nowIso, uuid } from './util';

/**
 * Prompt feedback loop (§4.3).
 *
 * Weekly `feedback_refresh`: assembles the style-corrections block (recent
 * significant edit pairs) and the top-performers block, writes them to config
 * for the generator to pull into its system prompt (GET /api/prompt-feedback).
 *
 * Monthly diff analysis: passes the trailing month's edit pairs to the LLM
 * (via OpenRouter) to distil recurring correction patterns into <=10 style
 * rules. The result is a
 * PROPOSAL: it enters the generation prompt only after a human approves it in
 * the admin UI (same trust model as content).
 */

interface FeedbackCfg {
  edit_pairs: number;
  min_edit_distance: number;
  top_performers: number;
  token_budget: number;
}

export async function weeklyFeedbackRefresh(env: Env, now: Date = new Date()): Promise<void> {
  const db = env.DB;
  const cfg = await getConfig<FeedbackCfg>(db, 'prompt_feedback');

  // Style corrections: the (original generated, final approved) pair only, and
  // only for grinder-origin posts — manual posts have no LLM "before" (§4.2).
  const pairs = await db
    .prepare(
      `SELECT ep.text_before, ep.text_after, ep.platform, ep.edit_distance
       FROM edit_pairs ep
       JOIN posts p ON p.id = ep.post_id
       WHERE p.origin = 'grinder'
         AND p.approved_at IS NOT NULL
         AND ep.text_before = p.text_generated
         AND ep.text_after = p.text_final
         AND ep.edit_distance >= ?
       ORDER BY ep.created_at DESC LIMIT ?`
    )
    .bind(cfg.min_edit_distance, cfg.edit_pairs)
    .all<{ text_before: string; text_after: string; platform: string; edit_distance: number }>();

  // Top performers: highest effective reward, trailing 30 days, any origin —
  // manual posts qualify as exemplars if they earn it (§4.2).
  const since = new Date(now.getTime() - 30 * 86400_000).toISOString();
  const top = await db
    .prepare(
      `SELECT p.text_final, p.platform, COALESCE(pr.corrected_reward, pr.reward) AS reward
       FROM post_rewards pr
       JOIN posts p ON p.id = pr.post_id
       WHERE pr.computed_at >= ?
       ORDER BY reward DESC LIMIT ?`
    )
    .bind(since, cfg.top_performers)
    .all<{ text_final: string; platform: string; reward: number }>();

  let styleBlock = '';
  if (pairs.results.length > 0) {
    styleBlock =
      'These are corrections human editors made to your output. Write like the AFTER ' +
      'versions. Do not reproduce the patterns present in the BEFORE versions.\n\n' +
      pairs.results
        .map(
          (p, i) =>
            `[${i + 1}] (${p.platform})\nBEFORE: ${p.text_before}\nAFTER: ${p.text_after}`
        )
        .join('\n\n');
  }

  let topBlock = '';
  if (top.results.length > 0) {
    topBlock =
      'Recent top-performing posts, as style exemplars:\n\n' +
      top.results
        .map(
          (t, i) =>
            `[${i + 1}] (${t.platform}, reward ${t.reward.toFixed(2)})\n${t.text_final}`
        )
        .join('\n\n');
  }

  // Token budget cap: truncate oldest pairs first (§4.3). Pairs are ordered
  // newest-first, so dropping from the end drops the oldest.
  const kept = [...pairs.results];
  const render = () =>
    styleBlock &&
    'These are corrections human editors made to your output. Write like the AFTER ' +
      'versions. Do not reproduce the patterns present in the BEFORE versions.\n\n' +
      kept
        .map((p, i) => `[${i + 1}] (${p.platform})\nBEFORE: ${p.text_before}\nAFTER: ${p.text_after}`)
        .join('\n\n');
  while (kept.length > 0 && estimateTokens(render() + '\n\n' + topBlock) > cfg.token_budget) {
    kept.pop();
  }
  styleBlock = kept.length > 0 ? render() : '';

  const approvedRules = await getConfigString(db, 'approved_style_rules');
  const combined = [approvedRules, styleBlock, topBlock].filter(Boolean).join('\n\n---\n\n');

  await setConfig(db, 'prompt_feedback_style', styleBlock);
  await setConfig(db, 'prompt_feedback_top', topBlock);
  await setConfig(db, 'prompt_feedback_block', combined);
  await setConfig(db, 'feedback_last_run', nowIso(now));
  await logEvent(env, 'info', 'feedback.refreshed', `${kept.length} pairs, ${top.results.length} exemplars`);
}

/** Monthly diff-analysis job (§4.3), surfaced for human review before use. */
export async function monthlyStyleAnalysis(env: Env, now: Date = new Date()): Promise<void> {
  if (!llmAvailable(env)) return;
  const db = env.DB;
  const since = new Date(now.getTime() - 30 * 86400_000).toISOString();
  const pairs = await db
    .prepare(
      `SELECT ep.text_before, ep.text_after, ep.platform
       FROM edit_pairs ep
       JOIN posts p ON p.id = ep.post_id
       WHERE p.origin = 'grinder' AND ep.created_at >= ?
       ORDER BY ep.created_at DESC LIMIT 200`
    )
    .bind(since)
    .all<{ text_before: string; text_after: string; platform: string }>();
  if (pairs.results.length < 5) return; // not enough signal this month

  const pairsText = pairs.results
    .map((p, i) => `[${i + 1}] (${p.platform})\nBEFORE: ${p.text_before}\nAFTER: ${p.text_after}`)
    .join('\n\n');

  const text = await chatComplete(env, {
    system:
      'You analyse editorial corrections made to social media copy for an Australian ' +
      'political party. From the BEFORE/AFTER pairs, identify recurring correction ' +
      'patterns and distil them into at most 10 concise, imperative style rules a ' +
      'copywriter could follow. Output only the numbered rule list, one line per rule.',
    user: `Edit pairs from the trailing month:\n\n${pairsText}`,
  });
  if (!text) return;

  const month = nowIso(now).slice(0, 7);
  await db
    .prepare(
      `INSERT INTO style_rule_proposals (id, month, rules, status, created_at)
       VALUES (?, ?, ?, 'proposed', ?)`
    )
    .bind(uuid(), month, text, nowIso(now))
    .run();
  await setConfig(db, 'style_analysis_last_run', nowIso(now));
  await logEvent(env, 'info', 'feedback.style_rules_proposed', month);
}
