import { useEffect } from 'react';
import { WorstTable } from './LeagueTablePage';
import { site } from '../config/site';
import { track } from '../lib/analytics';
import manifest from '../data/generated/manifest.json';

/**
 * Iframe-embeddable league table: no nav, compact, links open the parent
 * page. The authorisation line renders here too; requirement 6 covers
 * every page including embeds.
 */
const EmbedLeagueTable = () => {
    useEffect(() => {
        let host = 'direct';
        try {
            host = document.referrer ? new URL(document.referrer).host : 'direct';
        } catch {
            /* unparseable referrer stays "direct" */
        }
        track('embed_loaded', { referrerHost: host });
    }, []);

    return (
        <div className="min-h-screen bg-purple-900 text-ink p-4">
            {manifest.fixture && (
                <div data-sample-banner className="bg-magenta text-white text-center text-xs font-semibold px-2 py-1 mb-3 rounded-[2px]">
                    SAMPLE DATA
                </div>
            )}
            <h1 className="type-display text-2xl mb-3">The 20 worst served suburbs in Melbourne</h1>
            <WorstTable compact linkTarget="_parent" />
            <div className="mt-4 text-xs text-ink-faint space-y-1">
                <p>
                    Source: <a href={site.origin} target="_parent" className="text-blue">{site.siteName}</a>, computed from PTV GTFS timetable data.
                </p>
                <p className="type-overline text-ink">{site.authorisationLine}</p>
            </div>
        </div>
    );
};

export default EmbedLeagueTable;
