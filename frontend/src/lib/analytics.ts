/**
 * Privacy-respecting analytics adapter.
 *
 * Provider is Plausible custom events when VITE_ANALYTICS_DOMAIN is set;
 * otherwise a console logger in dev and a no-op in production. No cookies,
 * no ad pixels, and never any lookup text: events carry suburb slug and
 * band only. Address strings and coordinates stay in the browser.
 */

import { site } from '../config/site';

export type FunnelEvent =
    | 'lookup_performed'
    | 'score_viewed'
    | 'route_score_viewed'
    | 'share_clicked'
    | 'link_copied'
    | 'cta_clicked'
    | 'embed_loaded'
    | 'compare_viewed';

type EventProps = Record<string, string | number | boolean>;

declare global {
    interface Window {
        plausible?: (event: string, options?: { props?: EventProps }) => void;
    }
}

export function track(event: FunnelEvent, props: EventProps = {}): void {
    if (typeof window === 'undefined') return;
    if (site.analyticsDomain && typeof window.plausible === 'function') {
        window.plausible(event, { props });
        return;
    }
    if (import.meta.env.DEV) {
        console.debug('[analytics]', event, props);
    }
}

/** Inject the Plausible script once, only when a domain is configured. */
export function initAnalytics(): void {
    if (typeof document === 'undefined' || !site.analyticsDomain) return;
    if (document.querySelector('script[data-analytics]')) return;
    const s = document.createElement('script');
    s.defer = true;
    s.dataset.analytics = 'plausible';
    s.dataset.domain = site.analyticsDomain;
    s.src = 'https://analytics.fusionparty.org.au/js/script.tagged-events.js';
    document.head.appendChild(s);
    window.plausible = window.plausible ?? ((event, options) => {
        (window.plausible as unknown as { q?: unknown[] }).q?.push([event, options]);
    });
}
