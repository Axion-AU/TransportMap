import { useState } from 'react';
import { Share2, Link as LinkIcon, Check, MessageSquare } from 'lucide-react';
import { scoreUrl } from '../config/site';
import { track } from '../lib/analytics';
import suburbIndex from '../data/generated/suburb-index.json';
import type { SuburbIndex } from '../types/data';

const index = suburbIndex as SuburbIndex;

interface ShareBarProps {
    slug: string;
    suburbName: string;
    score: number;
    verdict: string;
    breakdown?: { frequency: number; coverage: number; reliability: number };
}

/**
 * Sharing always points at the canonical crawlable suburb page, never at a
 * coordinate result, so every share seeds the SEO surface.
 */
const ShareBar = ({ slug, suburbName, score, verdict, breakdown }: ShareBarProps) => {
    const [copied, setCopied] = useState(false);
    const [redditCopied, setRedditCopied] = useState(false);
    const url = scoreUrl(slug);
    const text = `${suburbName} scored ${score}/100 for public transport. ${verdict}`;

    const nativeShare = async () => {
        track('share_clicked', { suburb: slug, channel: 'native' });
        try {
            await navigator.share({ title: `${suburbName}: ${score}/100`, text, url });
        } catch {
            /* user dismissed the sheet */
        }
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            track('link_copied', { suburb: slug });
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard unavailable (unsupported or insecure context); no-op */
        }
    };

    const copyReddit = async () => {
        const allScores = [...index.suburbs].map(s => s.score).sort((a, b) => a - b);
        const melbourneMedian = allScores[Math.floor(allScores.length / 2)] ?? 50;

        const mdTable = `### ⚠️ Public Transport Ledger: ${suburbName} scores ${score}/100

Timetable analysis of public transport serving ${suburbName}, Victoria:
* **Overall Score:** ${score}/100 | **Melbourne Median:** ${melbourneMedian}/100
* **Frequency Score:** ${breakdown ? Math.round(breakdown.frequency) : 'N/A'}/100
* **Coverage Score:** ${breakdown ? Math.round(breakdown.coverage) : 'N/A'}/100
* **Reliability Score:** ${breakdown ? Math.round(breakdown.reliability) : 'N/A'}/100

**Verdict:** ${verdict}

[See the full breakdown, route details, and local coverage map for ${suburbName}](${url})

*Scores computed by Fusion Party Australia using official PTV GTFS timetable data.*`;

        try {
            await navigator.clipboard.writeText(mdTable);
            setRedditCopied(true);
            track('share_clicked', { suburb: slug, channel: 'reddit_table' });
            setTimeout(() => setRedditCopied(false), 2000);
        } catch {
            /* clipboard unavailable */
        }
    };

    const intent = (channel: string, href: string) => {
        track('share_clicked', { suburb: slug, channel });
        window.open(href, '_blank', 'noopener,noreferrer,width=600,height=500');
    };

    const canNative = typeof navigator !== 'undefined' && 'share' in navigator;

    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="type-overline text-ink-faint mr-1">Share this</span>
            {canNative && (
                <button onClick={nativeShare} className="pressable flex items-center gap-1.5 px-3 py-2 bg-magenta text-white text-sm font-semibold rounded-[4px]">
                    <Share2 className="h-4 w-4" /> Share
                </button>
            )}
            <button
                onClick={() => intent('x', `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`)}
                className="pressable px-3 py-2 bg-surface-raised border border-border-strong text-sm font-semibold rounded-[4px]"
            >
                X
            </button>
            <button
                onClick={() => intent('facebook', `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`)}
                className="pressable px-3 py-2 bg-surface-raised border border-border-strong text-sm font-semibold rounded-[4px]"
            >
                Facebook
            </button>
            <button
                onClick={() => intent('whatsapp', `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`)}
                className="pressable px-3 py-2 bg-surface-raised border border-border-strong text-sm font-semibold rounded-[4px]"
            >
                WhatsApp
            </button>
            <button onClick={copyReddit} className="pressable flex items-center gap-1.5 px-3 py-2 bg-surface-raised border border-border-strong text-sm font-semibold rounded-[4px]">
                {redditCopied ? <Check className="h-4 w-4 text-teal" /> : <MessageSquare className="h-4 w-4" />}
                {redditCopied ? 'Copied Table' : 'Reddit Table'}
            </button>
            <button onClick={copy} className="pressable flex items-center gap-1.5 px-3 py-2 bg-surface-raised border border-border-strong text-sm font-semibold rounded-[4px]">
                {copied ? <Check className="h-4 w-4 text-teal" /> : <LinkIcon className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy link'}
            </button>
        </div>
    );
};

export default ShareBar;
