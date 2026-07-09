/**
 * Plain-language verdict lines, one per score band.
 *
 * Voice rules (enforced by scripts/check-voice.mjs): plain, specific,
 * furious but sourced. Every number comes from the data or from
 * src/config/anchors.json. No em-dashes. No negate-then-correct sentences.
 */

import type { Band } from './scoring';

export interface VerdictContext {
    /** Median peak wait in minutes across the suburb's stops, if known. */
    medianWaitMinutes: number | null;
    /** Plural noun for the dominant mode: "Trains", "Trams", "Buses", "Services". */
    modeNoun: string;
}

/** Median wait is half the headway; riders experience the headway. */
export function headwayMinutes(medianWaitMinutes: number): number {
    return Math.round(medianWaitMinutes * 2);
}

export function verdictFor(bandValue: Band, ctx: VerdictContext): string {
    const noun = ctx.modeNoun || 'Services';
    const wait = ctx.medianWaitMinutes;
    const headway = wait !== null && wait > 0 ? headwayMinutes(wait) : null;

    switch (bandValue) {
        case 'stranded':
            return headway !== null
                ? `${noun} every ${headway} minutes, if they come. Owning a car is compulsory here and that is a funding decision.`
                : `Almost nothing runs here worth planning around. Owning a car is compulsory and that is a funding decision.`;
        case 'poor':
            return headway !== null
                ? `${noun} every ${headway} minutes. You pay the same fare as the inner city for a fraction of the service.`
                : `You pay the same fare as the inner city for a fraction of the service.`;
        case 'patchy':
            return headway !== null
                ? `Usable if your plans match the timetable. ${noun} every ${headway} minutes leave zero room for a normal life.`
                : `Usable if your plans match the timetable. Spontaneous travel happens in other suburbs.`;
        case 'decent':
            return `Solid service through the day. The gaps show up at night and on weekends, and the fare stays the same.`;
        case 'good':
            return `Turn up and go. This is the standard every suburb pays for and few receive.`;
    }
}

/** Mode id to plural noun, matching the Rust processor's mode ids. */
export function modeNounFor(modeIds: number[]): string {
    const has = (id: number) => modeIds.includes(id);
    if (has(2) || has(1)) return 'Trains';
    if (has(3)) return 'Trams';
    if (has(4) || has(6) || has(5)) return 'Buses';
    return 'Services';
}
