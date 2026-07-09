import { useState } from 'react';
import { Share2, Link as LinkIcon, Check } from 'lucide-react';
import { scoreUrl } from '../config/site';
import { track } from '../lib/analytics';

interface ShareBarProps {
    slug: string;
    suburbName: string;
    score: number;
    verdict: string;
}

/**
 * Sharing always points at the canonical crawlable suburb page, never at a
 * coordinate result, so every share seeds the SEO surface.
 */
const ShareBar = ({ slug, suburbName, score, verdict }: ShareBarProps) => {
    const [copied, setCopied] = useState(false);
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
        await navigator.clipboard.writeText(url);
        setCopied(true);
        track('link_copied', { suburb: slug });
        setTimeout(() => setCopied(false), 2000);
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
            <button onClick={copy} className="pressable flex items-center gap-1.5 px-3 py-2 bg-surface-raised border border-border-strong text-sm font-semibold rounded-[4px]">
                {copied ? <Check className="h-4 w-4 text-teal" /> : <LinkIcon className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy link'}
            </button>
        </div>
    );
};

export default ShareBar;
