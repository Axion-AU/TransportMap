import { joinHref } from '../config/site';
import anchorsConfig from '../config/anchors.json';
import ctaCopy from '../config/cta-copy.json';
import type { Band } from '../lib/scoring';
import { track } from '../lib/analytics';

interface JoinCtaProps {
    slug: string;
    suburbName: string;
    score: number;
    band: Band;
    /** True outside the Melbourne metro myki zone 1/2 area (V/Line fare territory). */
    isRegional: boolean;
}

function fill(template: string, values: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`);
}

/**
 * The conversion loop. Copy is matched to the score band and every price
 * comes from config/anchors.json. The href carries utm_content=<slug> so
 * score to join conversion is measurable per suburb.
 *
 * mykiDailyCapZone12 and mykiWeeklyCommute are metro zone 1/2 figures.
 * V/Line regional fares use a different, higher zone structure this site
 * doesn't compute per suburb, so regional suburbs get copy and a footer
 * that don't assert the metro figure as if it applied to them.
 */
const JoinCta = ({ slug, suburbName, score, band, isRegional }: JoinCtaProps) => {
    const copy = ctaCopy.bands[band];
    const anchors = anchorsConfig.anchors;
    const values = {
        suburb: suburbName,
        score: String(score),
        membershipStandard: anchors.membershipStandard.display,
        membershipConcession: anchors.membershipConcession.display,
        weeklyFares: anchors.mykiWeeklyCommute.display,
    };
    const regionalBody = (copy as { bodyRegional?: string }).bodyRegional;
    const bodyTemplate = (isRegional && regionalBody) ? regionalBody : copy.body;

    return (
        <section className="bg-fusion-purple border border-border-strong rounded-[4px] p-6 md:p-8">
            <h2 className="type-display text-3xl md:text-4xl mb-3">{fill(copy.heading, values)}</h2>
            <p className="text-lg leading-relaxed mb-6 max-w-2xl">{fill(bodyTemplate, values)}</p>
            <a
                href={joinHref(slug)}
                onClick={() => track('cta_clicked', { suburb: slug, band })}
                className="pressable cta-glow inline-block px-8 py-4 bg-magenta text-white text-lg font-semibold rounded-[4px]"
            >
                {fill(copy.button, values)}
            </a>
            <p className="mt-4 text-xs text-ink-faint">
                {isRegional
                    ? `Anchors current as at ${anchorsConfig.refreshed}: ${anchors.membershipStandard.display} ${anchors.membershipStandard.label}, ${anchors.membershipConcession.display} ${anchors.membershipConcession.label}. Myki zone 1/2 fares shown elsewhere on this site don't apply to V/Line regional fares.`
                    : `Anchors current as at ${anchorsConfig.refreshed}: ${anchors.mykiDailyCapZone12.display} ${anchors.mykiDailyCapZone12.label}, ${anchors.membershipStandard.display} ${anchors.membershipStandard.label}, ${anchors.membershipConcession.display} ${anchors.membershipConcession.label}.`}
            </p>
        </section>
    );
};

export default JoinCta;
