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

import type { Band, SuburbBreakdown, ModeBreakdown } from './scoring';
import { friendlyModeName } from './scoring';

export interface VerdictContext {
    /** Median peak wait in minutes across the suburb's primary (most prevalent) mode, if known. */
    medianWaitMinutes: number | null;
    /** Plural noun for the primary mode: "Trains", "Trams", "Buses", "Services". */
    modeNoun: string;
    /** Population-weighted (or legacy-mean) frequency/coverage/reliability, 0-100. */
    breakdown: SuburbBreakdown;
    /** Per-mode summaries, sorted by prevalence (stopCount) first. */
    modeBreakdown: ModeBreakdown[];
}

/** Median wait is half the headway; riders experience the headway. */
export function headwayMinutes(medianWaitMinutes: number): number {
    return Math.round(medianWaitMinutes * 2);
}

/** avgScore gap large enough that "depends which street you live on" is a fair read, not noise from one or two stops. */
const MODE_SPLIT_GAP = 25;
/** Gap between a suburb's weakest and second-weakest breakdown dimension needed to call the weakest one "the" binding constraint. Below this, treat every dimension as equally broken. */
const CLEAR_WEAKEST_GAP = 12;
/** Coverage this low is a reachability problem on its own terms, even if frequency/reliability are equally bad. */
const COVERAGE_CRITICAL = 15;
/** Reliability below this is worth naming explicitly ("if it shows up"); above it, don't imply a cancellation problem that isn't there. */
const RELIABILITY_POOR = 40;

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

export function verdictFor(bandValue: Band, ctx: VerdictContext): string {
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

/** Mode id to plural noun, matching the Rust processor's mode ids. Kept for callers without a full ModeBreakdown. */
export function modeNounFor(modeIds: number[]): string {
    const has = (id: number) => modeIds.includes(id);
    if (has(2) || has(1)) return 'Trains';
    if (has(3)) return 'Trams';
    if (has(4) || has(6) || has(5)) return 'Buses';
    return 'Services';
}
