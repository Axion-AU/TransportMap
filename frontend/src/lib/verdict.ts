/**
 * Plain-language verdict lines, one per suburb.
 *
 * Voice rules (enforced by scripts/check-voice.mjs): plain, specific,
 * furious but sourced. Every number comes from the data or from
 * src/config/anchors.json. No em-dashes. No negate-then-correct sentences.
 *
 * This is NOT a band -> fixed-sentence lookup. A single overall band hides
 * unrelated real stories: a mode/location split (some streets get a great
 * service, most don't), a reachability problem (stops exist but are too far
 * to walk to), a genuine reliability problem, or a suburb where every
 * dimension is uniformly weak with no single fix. A canned per-band
 * sentence has produced real mistakes here:
 *   - Pakenham: pooling hourly V/Line with turn-up-and-go Metro trains under
 *     one "Trains every N minutes" line produced a meaningless blended
 *     number.
 *   - Thomastown: picking the mode with the single best isolated stop (2
 *     excellent train stops) as "the" mode, when 20 mediocre bus stops are
 *     what most residents actually have, attached a good headway number to
 *     an overall STRANDED verdict -- self-contradictory.
 *   - Deanside: "if they show up" (a reliability claim) on a suburb whose
 *     binding constraint is that its stops are unreachable on foot (a
 *     coverage problem), not that the service is unreliable once reached.
 * Build the sentence from whichever of these stories the numbers actually
 * support, and only fall back to a generic per-band line when none do.
 */

import type { Band, SuburbBreakdown, ModeBreakdown, VerdictInputs } from './scoring';
import { friendlyModeName } from './scoring';

export interface VerdictContext {
    /** Median peak wait in minutes across the suburb's primary (most prevalent) mode, if known. Stop-based; only used on the legacy (no verdictInputs) path. */
    medianWaitMinutes: number | null;
    /** Plural noun for the primary mode: "Trains", "Trams", "Buses", "Services". Stop-based; only used on the legacy path. */
    modeNoun: string;
    /** Population-weighted (or legacy-mean) frequency/coverage/reliability, 0-100. */
    breakdown: SuburbBreakdown;
    /** Per-mode summaries, sorted by prevalence (stopCount) first. Stop-based; used for the legacy path and for the reach gate's "strong anchor" check. */
    modeBreakdown: ModeBreakdown[];
    /**
     * Population-weighted grid inputs (methodology refactor, verdict piece).
     * Present only for grid-scored suburbs -- when set, verdictFor uses the
     * reach/mode-share/weakest-dimension gates built on these instead of the
     * legacy stop-based logic below. Absent (undefined) for legacy-mean
     * suburbs and for every address-level caller (ResultPage, ConnectivityPin),
     * which have no suburb-wide population grid to draw from.
     */
    verdictInputs?: VerdictInputs;
}

/** Median wait is half the headway; riders experience the headway. */
export function headwayMinutes(medianWaitMinutes: number): number {
    return Math.round(medianWaitMinutes * 2);
}

/** avgScore gap large enough that "depends which street you live on" is a fair read, not noise from one or two stops. Reused for the population-weighted mode-share gap (gate 2). */
const MODE_SPLIT_GAP = 25;
/** Gap between a suburb's weakest and second-weakest breakdown dimension needed to call the weakest one "the" binding constraint. Below this, treat every dimension as equally broken. */
const CLEAR_WEAKEST_GAP = 12;
/** Coverage this low is a reachability problem on its own terms, even if frequency/reliability are equally bad. */
const COVERAGE_CRITICAL = 15;
/** Reliability below this is worth naming explicitly ("if it shows up"); above it, don't imply a cancellation problem that isn't there. */
const RELIABILITY_POOR = 40;
/** Below this reachShare, most of the suburb can't walk to any viable route -- that's the story, not the mode split or the weakest dimension. */
const REACH_CRITICAL = 0.4;
/** A minority mode must carry at least this share of the reached population to headline a population mode split; smaller pockets aren't the suburb's story. */
const SPLIT_MIN_SHARE = 0.2;
/** A stop-level mode with bestScore at or above this is worth crediting as "genuinely good" in the reach verdict, even though most of the suburb can't reach it. */
const STRONG_ANCHOR = 70;

/**
 * A suburb's transit access can depend entirely on which mode reaches your
 * street: a lucky pocket near a good minority mode, or most people stuck on
 * a worse mode while a minority is well served.
 *
 * Two distinct comparisons, not one: a "lucky pocket" (some minority mode
 * has a genuinely excellent stop somewhere, better than the primary mode's
 * typical experience) is checked using the minority's *best* stop, because
 * with only one or two stops of that mode its own average can be dragged
 * down by a second, unrelated, mediocre stop (confirmed on Thomastown: 2
 * train stops averaging 68 -- one excellent at 88, one so-so at 48 --
 * would otherwise wash out against 20 bus stops averaging 58.7, even
 * though that one 88 is a real, reachable pocket of excellence). A
 * "primary is fine, minority mode is just bad" story is checked average
 * to average instead, since there we're asking whether that mode is
 * typically bad, not whether it has one typically-bad stop.
 */
function modeSplitLine(modeBreakdown: ModeBreakdown[], headwayLine: string): string | null {
    if (modeBreakdown.length < 2) return null;
    const primary = modeBreakdown[0];
    const others = modeBreakdown.slice(1);
    const primaryNoun = friendlyModeName(primary.modeName).toLowerCase();

    const lucky = others.reduce((a, b) => (b.bestScore - primary.avgScore > a.bestScore - primary.avgScore ? b : a));
    if (lucky.bestScore - primary.avgScore >= MODE_SPLIT_GAP) {
        const luckyNoun = friendlyModeName(lucky.modeName).toLowerCase();
        return `The ${luckyNoun} nearby are good, but most of this suburb relies on the ${primaryNoun}${headwayLine ? ` (${headwayLine})` : ''} instead. Whether you get decent transit here depends entirely on which street you live on.`;
    }

    const bad = others.reduce((a, b) => (primary.avgScore - b.avgScore > primary.avgScore - a.avgScore ? b : a));
    if (primary.avgScore - bad.avgScore >= MODE_SPLIT_GAP) {
        const badNoun = friendlyModeName(bad.modeName).toLowerCase();
        return `The ${primaryNoun} are good${headwayLine ? ` (${headwayLine})` : ''}, the ${badNoun} are bad. Whether you get decent transit here depends entirely on which street you live on.`;
    }

    return null;
}

function coverageBottleneckLine(breakdown: SuburbBreakdown): string | null {
    const { frequency, coverage, reliability } = breakdown;
    const isRelativeOutlier = Math.min(frequency, reliability) - coverage >= CLEAR_WEAKEST_GAP;
    const isCriticallyLow = coverage <= COVERAGE_CRITICAL;
    if (!isRelativeOutlier && !isCriticallyLow) return null;
    return `The service that exists isn't bad, it's just out of reach. Most of this suburb is beyond an 800m walk of a stop worth using.`;
}

type WeakDimension = 'uniform' | 'frequency' | 'coverage' | 'reliability';

/** Which single dimension is clearly the binding constraint, or 'uniform' when no one dimension stands out as uniquely worse. */
function weakestDimension(breakdown: SuburbBreakdown): WeakDimension {
    const entries: [WeakDimension, number][] = [
        ['frequency', breakdown.frequency],
        ['coverage', breakdown.coverage],
        ['reliability', breakdown.reliability],
    ];
    entries.sort((a, b) => a[1] - b[1]);
    const [worstDim, worstVal] = entries[0];
    const [, secondVal] = entries[1];
    if (secondVal - worstVal < CLEAR_WEAKEST_GAP) return 'uniform';
    return worstDim;
}

/** The factual core of the verdict: what's actually wrong, in plain terms, before the band-severity closing line. */
function bindingIssueLine(dim: WeakDimension, breakdown: SuburbBreakdown, noun: string, headway: number | null): string {
    const reliabilityQualifier = breakdown.reliability < RELIABILITY_POOR ? ', if it shows up' : '';
    switch (dim) {
        case 'frequency':
            return headway !== null
                ? `${noun} every ${headway} minutes${reliabilityQualifier}`
                : `Long waits between services${reliabilityQualifier}`;
        case 'coverage':
            return `The service that exists isn't bad, it's just out of reach. Most of this suburb is beyond an 800m walk of a stop worth using`;
        case 'reliability':
            return `${noun} run to a timetable, but not one you can trust${headway !== null ? ` -- even the scheduled every-${headway}-minute service gets cancelled or delayed often enough to matter` : ''}`;
        case 'uniform':
            return headway !== null
                ? `${noun} run about every ${headway} minutes when they run at all, and coverage and reliability are just as weak`
                : `Frequency, coverage, and reliability are all weak here, there's no single fix`;
    }
}

/** The band-severity closing line, shared by the legacy path and the grid reach/weakest-dimension gates. `decent`/`good` ignore `issue`, matching current behaviour. */
function bandClosingLine(bandValue: Band, issue: string): string {
    switch (bandValue) {
        case 'stranded':
            return `${issue}. A car is compulsory here because state budgets ignore this suburb.`;
        case 'poor':
            return `${issue}. You pay full fare for a tiny fraction of the service.`;
        case 'patchy':
            return `Usable only if your plans match the timetable. ${issue} leaves zero room for spontaneous trips.`;
        case 'decent':
            return `Solid service through the day. The gaps show up at night and on weekends, and the fare stays the same.`;
        case 'good':
            return `Turn up and go. This is the standard every suburb pays for and few receive.`;
    }
}

/**
 * Stop-based verdict path: today's logic, kept unchanged for legacy-mean
 * suburbs (no populated grid cells) and for every address-level caller
 * (ResultPage, ConnectivityPin), where a single address has no internal
 * gradient for a population-weighted reach/mode-share story to describe.
 */
function legacyVerdictFor(bandValue: Band, ctx: VerdictContext): string {
    const noun = ctx.modeNoun || 'Services';
    const wait = ctx.medianWaitMinutes;
    const headway = wait !== null && wait > 0 ? headwayMinutes(wait) : null;
    const headwayLine = headway !== null ? `${noun.toLowerCase()} every ${headway} minutes` : '';

    const split = modeSplitLine(ctx.modeBreakdown, headwayLine);
    if (split) return split;

    if ((bandValue === 'stranded' || bandValue === 'poor') && weakestDimension(ctx.breakdown) === 'coverage') {
        const line = coverageBottleneckLine(ctx.breakdown);
        if (line) return line;
    }

    const dim = weakestDimension(ctx.breakdown);
    const issue = bindingIssueLine(dim, ctx.breakdown, noun, headway);
    return bandClosingLine(bandValue, issue);
}

/**
 * Gate 1: most of the suburb can't walk to any viable route at all. That's
 * the story, ahead of any mode split or weakest-dimension read, which would
 * otherwise describe only the reached minority's experience as if it were
 * the suburb's.
 */
function reachLine(ctx: VerdictContext): string {
    const { reachShare, fallbackWaitMinutes, fallbackModeName } = ctx.verdictInputs!;
    const excludedPct = Math.round((1 - reachShare) * 100);
    const anchor = ctx.modeBreakdown.find(m => m.bestScore >= STRONG_ANCHOR);

    if (anchor) {
        const anchorNoun = friendlyModeName(anchor.modeName).toLowerCase();
        const fallbackNoun = fallbackModeName ? friendlyModeName(fallbackModeName).toLowerCase() : null;
        const fallbackClause = fallbackWaitMinutes !== null && fallbackNoun
            ? `, and the ${fallbackNoun} filling the gap run every ${headwayMinutes(fallbackWaitMinutes)} minutes`
            : '';
        return `The ${anchorNoun} here are genuinely good. ${excludedPct}% of this suburb can't walk to them${fallbackClause}`;
    }

    return `The service that exists isn't bad, it's just out of reach. ${excludedPct}% of this suburb is beyond an 800m walk of a stop worth using`;
}

/**
 * Gate 2: a genuine population-level mode split -- a minority mode reaches a
 * real share of the suburb and clearly outscores the primary mode, not just
 * a pocket too small to be the suburb's actual story (SPLIT_MIN_SHARE) or
 * noise from one or two stops (MODE_SPLIT_GAP). Only the "lucky minority"
 * direction is modelled: a primary mode dragging down an unlucky minority is
 * already covered by that minority's own low reach/score, not a distinct
 * story worth a second template.
 */
function populationModeSplitLine(verdictInputs: VerdictInputs): string | null {
    const { modeShares } = verdictInputs;
    if (modeShares.length < 2) return null;
    const [primary, lucky] = modeShares;
    if (lucky.share < SPLIT_MIN_SHARE) return null;
    if (lucky.avgScore - primary.avgScore < MODE_SPLIT_GAP) return null;
    if (primary.medianWaitMinutes === null) return null;

    const luckyNoun = friendlyModeName(lucky.modeName).toLowerCase();
    const primaryNoun = friendlyModeName(primary.modeName).toLowerCase();
    const luckyPct = Math.round(lucky.share * 100);
    const restPct = 100 - luckyPct;
    const primaryHeadway = headwayMinutes(primary.medianWaitMinutes);

    return `The ${luckyNoun} serve the ${luckyPct}% of this suburb lucky enough to live near them. The other ${restPct}% rely on the ${primaryNoun} every ${primaryHeadway} minutes.`;
}

/**
 * Grid (population-weighted) verdict path: reach first, then a genuine
 * population mode split, then the usual weakest-dimension read -- but with
 * headway and mode noun both drawn from the population-weighted grid inputs
 * instead of stop counts, so the sentence describes what the median resident
 * actually experiences.
 */
function gridVerdictFor(bandValue: Band, ctx: VerdictContext): string {
    const verdictInputs = ctx.verdictInputs!;

    if (verdictInputs.reachShare < REACH_CRITICAL) {
        return bandClosingLine(bandValue, reachLine(ctx));
    }

    const split = populationModeSplitLine(verdictInputs);
    if (split) return split;

    const noun = verdictInputs.modeShares.length > 0 ? friendlyModeName(verdictInputs.modeShares[0].modeName) : (ctx.modeNoun || 'Services');
    const wait = verdictInputs.medianWaitMinutes;
    const headway = wait !== null && wait > 0 ? headwayMinutes(wait) : null;

    const dim = weakestDimension(ctx.breakdown);
    const issue = bindingIssueLine(dim, ctx.breakdown, noun, headway);
    return bandClosingLine(bandValue, issue);
}

export function verdictFor(bandValue: Band, ctx: VerdictContext): string {
    if (!ctx.verdictInputs) return legacyVerdictFor(bandValue, ctx);
    return gridVerdictFor(bandValue, ctx);
}

/** Mode id to plural noun, matching the Rust processor's mode ids. Kept for callers without a full ModeBreakdown. */
export function modeNounFor(modeIds: number[]): string {
    const has = (id: number) => modeIds.includes(id);
    if (has(2) || has(1)) return 'Trains';
    if (has(3)) return 'Trams';
    if (has(4) || has(6) || has(5)) return 'Buses';
    return 'Services';
}
