/**
 * Single source of truth for campaign-level values.
 *
 * The authorisation line lives here and only here: the footer, the OG image
 * generator, and the compliance gate all import this constant. Changing the
 * wording is one edit; removing it fails the build.
 */

export const site = {
    siteName: 'Transport Score',
    orgName: 'Fusion Party Australia',
    /** Production origin for absolute URLs (og:image, canonical). */
    origin: (import.meta.env?.VITE_SITE_ORIGIN as string | undefined) ?? 'https://transportscore.fusionparty.org.au',
    /** TODO(launch): confirm the join flow URL with the membership team. */
    joinUrl: 'https://www.fusionparty.org.au/join',
    utm: {
        source: 'tie',
        medium: 'web',
        campaign: 'transport-score',
    },
    /**
     * Victorian electoral law authorisation. Rendered in the footer of every
     * page and baked into every generated share image. Hard gate: assets
     * that omit it fail the build. Confirm current wording before launch.
     */
    authorisationLine: 'Authorised by K. Hunt, FUSION, Mansfield VIC',
    /** Plausible domain; unset means the analytics adapter stays silent. */
    analyticsDomain: (import.meta.env?.VITE_ANALYTICS_DOMAIN as string | undefined) ?? '',
    geocoder: {
        /** Explicit-submit only; per-keystroke geocoding breaches the usage policy. */
        endpoint: 'https://nominatim.openstreetmap.org/search',
        /** Victoria bounding box, keeps results local. */
        viewbox: '140.9,-39.2,150.0,-33.9',
        attribution: 'Address search by OpenStreetMap Nominatim',
    },
} as const;

/** Join URL with funnel attribution. suburb slug lands in utm_content. */
export function joinHref(suburbSlug?: string): string {
    const url = new URL(site.joinUrl);
    url.searchParams.set('utm_source', site.utm.source);
    url.searchParams.set('utm_medium', site.utm.medium);
    url.searchParams.set('utm_campaign', site.utm.campaign);
    if (suburbSlug) url.searchParams.set('utm_content', suburbSlug);
    return url.toString();
}

export function scoreUrl(slug: string): string {
    return `${site.origin}/score/${slug}`;
}
