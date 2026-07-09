import { useEffect, useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Share2, Link as LinkIcon, Check } from 'lucide-react';
import ClientOnly from '../components/ClientOnly';
import anchorsConfig from '../config/anchors.json';
import { joinHref, site } from '../config/site';
import { usePageMeta } from '../lib/meta';
import { track } from '../lib/analytics';
import type { NetworkPlan } from '../types/data';

const PLAN_SLUG = 'the-plan';
const NetworkPlanMapInner = lazy(() => import('../components/NetworkPlanMap'));

/** Same JSON-island pattern as SuburbScorePage: zero fetches on a prerendered load. */
function islandData(): NetworkPlan | null {
    if (typeof document === 'undefined') return null;
    const el = document.getElementById('network-plan-data');
    if (!el?.textContent) return null;
    try {
        return JSON.parse(el.textContent) as NetworkPlan;
    } catch {
        return null;
    }
}

const money = (n: number) => n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });

const StatBlock = ({ label, before, after, accent }: { label: string; before: number; after: number; accent: string }) => (
    <div className="bg-surface-raised border border-border-subtle rounded-[4px] p-5" style={{ borderTop: `2px solid ${accent}` }}>
        <div className="type-overline text-ink-faint mb-2">{label}</div>
        <div className="flex items-baseline gap-3">
            <span className="type-data text-2xl text-ink-faint line-through decoration-2">{before.toFixed(0)}%</span>
            <span className="type-data text-4xl" style={{ color: accent }}>{after.toFixed(0)}%</span>
        </div>
        <div className="text-xs text-ink-faint mt-1">today, then with the plan</div>
    </div>
);

const NetworkPlanPage = () => {
    const [plan, setPlan] = useState<NetworkPlan | null>(() => islandData());
    const [failed, setFailed] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (plan) return;
        fetch('/data/network_plan.json')
            .then(res => (res.ok ? res.json() : Promise.reject(new Error('missing'))))
            .then((d: NetworkPlan) => setPlan(d))
            .catch(() => setFailed(true));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    usePageMeta(
        'The plan | Transport Score',
        plan
            ? `A costed feeder bus network moving 400m coverage from ${plan.baseline_pct_within_400.toFixed(0)}% to ${plan.proposed_pct_within_400.toFixed(0)}%, net ${money(plan.net_annual_cost)} a year.`
            : 'The costed plan to connect every suburb to high-quality transit.',
    );

    const shareUrl = `${site.origin}/the-plan`;

    const share = async (channel: string, href?: string) => {
        if (!plan) return;
        track('share_clicked', { suburb: PLAN_SLUG, channel });
        const shareText = `Fusion costed the fix. A feeder network lifting 400m transit coverage from ${plan.baseline_pct_within_400.toFixed(0)}% to ${plan.proposed_pct_within_400.toFixed(0)}%, net ${money(plan.net_annual_cost)} a year.`;
        if (channel === 'native' && typeof navigator !== 'undefined' && 'share' in navigator) {
            try {
                await navigator.share({ title: 'The plan', text: shareText, url: shareUrl });
            } catch {
                /* dismissed */
            }
            return;
        }
        if (href) window.open(href, '_blank', 'noopener,noreferrer,width=600,height=500');
    };

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            track('link_copied', { suburb: PLAN_SLUG });
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard unavailable */
        }
    };

    if (failed) {
        return <div className="max-w-3xl mx-auto px-5 py-16 text-ink-soft">Could not load the plan. Try again shortly.</div>;
    }
    if (!plan) {
        return <div className="max-w-3xl mx-auto px-5 py-16 text-ink-soft">Loading the plan…</div>;
    }

    const shareText = `Fusion costed the fix. A feeder network lifting 400m transit coverage from ${plan.baseline_pct_within_400.toFixed(0)}% to ${plan.proposed_pct_within_400.toFixed(0)}%, net ${money(plan.net_annual_cost)} a year.`;

    return (
        <div className="max-w-3xl mx-auto px-5 py-10 md:py-16 space-y-8">
            <header className="space-y-4">
                <p className="type-overline text-magenta">We costed the fix</p>
                <h1 className="type-display text-5xl md:text-6xl">The plan</h1>
                <p className="text-lg text-ink-soft max-w-2xl leading-relaxed">
                    A feeder bus network connecting residents to the transit that already works, threaded
                    through schools, hospitals, and shopping centres where the route allows. Below is what
                    it covers, what it costs, and which existing routes it makes redundant.
                </p>
                {plan.fixture && (
                    <p className="border border-magenta rounded-[4px] p-3 text-sm text-ink-soft max-w-2xl">
                        {plan.stub
                            ? 'This build has no Rust-computed plan available and shows illustrative placeholder numbers only.'
                            : 'This plan runs on generated sample population, points of interest, and road data, clearly marked and excluded from search indexing until real datasets replace them.'}
                    </p>
                )}
            </header>

            <section className="grid gap-4 sm:grid-cols-2">
                <StatBlock label="Within 400m of high-quality transit" before={plan.baseline_pct_within_400} after={plan.proposed_pct_within_400} accent="#D428D4" />
                <StatBlock label="Within 800m of high-quality transit" before={plan.baseline_pct_within_800} after={plan.proposed_pct_within_800} accent="#0BB8D4" />
            </section>

            {!plan.targets_met && (
                <p className="text-sm text-ink-faint border-l-2 border-border-strong pl-4">
                    The candidate road corridors available to this build do not reach the 80% within 400m and
                    100% within 800m targets. Every route below is still worth building; the shortfall is
                    reported honestly rather than hidden. See <Link to="/methodology" className="text-blue">methodology</Link> for the corridor set this run used.
                </p>
            )}

            <section className="bg-surface-raised border border-border-subtle border-t-2 border-t-teal rounded-[4px] p-6 md:p-8 space-y-3">
                <div className="type-overline text-teal">Net annual cost</div>
                <div className="type-data text-5xl text-ink">{money(plan.net_annual_cost)}</div>
                <p className="text-ink-soft">
                    {money(plan.new_network_annual_cost)} to run the new routes, minus {money(plan.decommission_annual_savings)}
                    {' '}saved by retiring {plan.redundant_routes.length} existing route{plan.redundant_routes.length === 1 ? '' : 's'} the network makes redundant.
                    Costed at {anchorsConfig.anchors.busOperatingCostPerKm.display} per service kilometre.
                </p>
                <p className="text-xs text-ink-faint">
                    Source: {plan.cost_source}. Today's whole network costs an estimated {money(plan.current_total_network_annual_cost)} a year to run, for context, not counted in the net figure above.
                </p>
            </section>

            <section className="space-y-3">
                <h2 className="type-display text-2xl">Proposed routes ({plan.proposed_routes.length})</h2>
                <div className="bg-surface-raised border border-border-subtle rounded-[4px] overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border-strong text-left">
                                <th className="py-2 px-3 type-overline text-ink-faint">Route</th>
                                <th className="py-2 px-3 type-overline text-ink-faint text-right">Length</th>
                                <th className="py-2 px-3 type-overline text-ink-faint text-right">Annual cost</th>
                                <th className="py-2 px-3 type-overline text-ink-faint text-right">New residents covered</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                            {plan.proposed_routes.map(r => (
                                <tr key={r.id}>
                                    <td className="py-2 px-3">{r.name}</td>
                                    <td className="py-2 px-3 type-data text-right">{r.length_km.toFixed(1)}km</td>
                                    <td className="py-2 px-3 type-data text-right">{money(r.annual_cost)}</td>
                                    <td className="py-2 px-3 type-data text-right">{Math.round(r.newly_covered_population_400 + r.newly_covered_population_800).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {plan.redundant_routes.length > 0 && (
                <section className="space-y-3">
                    <h2 className="type-display text-2xl">Routes this plan retires</h2>
                    <div className="bg-surface-raised border border-border-subtle rounded-[4px] overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border-strong text-left">
                                    <th className="py-2 px-3 type-overline text-ink-faint">Route</th>
                                    <th className="py-2 px-3 type-overline text-ink-faint">Why</th>
                                    <th className="py-2 px-3 type-overline text-ink-faint text-right">Annual saving</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle">
                                {plan.redundant_routes.map(r => (
                                    <tr key={r.route_id}>
                                        <td className="py-2 px-3 type-data">{r.route_id}</td>
                                        <td className="py-2 px-3 text-ink-soft">{r.reason}</td>
                                        <td className="py-2 px-3 type-data text-right">{money(r.annual_saving)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {plan.proposed_routes.length > 0 && (
                <section className="space-y-3">
                    <h2 className="type-display text-2xl">The map</h2>
                    <div className="h-[420px] rounded-[4px] overflow-hidden border border-border-subtle">
                        <ClientOnly fallback={<div className="h-full w-full flex items-center justify-center text-ink-faint">Loading map…</div>}>
                            <Suspense fallback={<div className="h-full w-full flex items-center justify-center text-ink-faint">Loading map…</div>}>
                                <NetworkPlanMapInner routes={plan.proposed_routes} />
                            </Suspense>
                        </ClientOnly>
                    </div>
                </section>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <span className="type-overline text-ink-faint mr-1">Share this</span>
                <button onClick={() => share('native')} className="pressable flex items-center gap-1.5 px-3 py-2 bg-magenta text-white text-sm font-semibold rounded-[4px]">
                    <Share2 className="h-4 w-4" /> Share
                </button>
                <button onClick={() => share('x', `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`)} className="pressable px-3 py-2 bg-surface-raised border border-border-strong text-sm font-semibold rounded-[4px]">
                    X
                </button>
                <button onClick={() => share('facebook', `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`)} className="pressable px-3 py-2 bg-surface-raised border border-border-strong text-sm font-semibold rounded-[4px]">
                    Facebook
                </button>
                <button onClick={copyLink} className="pressable flex items-center gap-1.5 px-3 py-2 bg-surface-raised border border-border-strong text-sm font-semibold rounded-[4px]">
                    {copied ? <Check className="h-4 w-4 text-teal" /> : <LinkIcon className="h-4 w-4" />}
                    {copied ? 'Copied' : 'Copy link'}
                </button>
            </div>

            <section className="bg-fusion-purple border border-border-strong rounded-[4px] p-6 md:p-8">
                <h2 className="type-display text-3xl md:text-4xl mb-3">Fund the plan that's already costed</h2>
                <p className="text-lg leading-relaxed mb-6 max-w-2xl">
                    This is not a wish list. Every route above has a length, a cost, and a reason. Membership
                    funds the campaign to get it built.
                </p>
                <a
                    href={joinHref(PLAN_SLUG)}
                    onClick={() => track('cta_clicked', { suburb: PLAN_SLUG, band: 'plan' })}
                    className="pressable cta-glow inline-block px-8 py-4 bg-magenta text-white text-lg font-semibold rounded-[4px]"
                >
                    Join Fusion
                </a>
            </section>

            <p className="text-sm">
                See how a single stop scores instead: <Link to="/" className="text-blue">look up your suburb</Link>, or read
                the <Link to="/methodology" className="text-blue">full methodology</Link> behind this plan.
            </p>
        </div>
    );
};

export default NetworkPlanPage;
