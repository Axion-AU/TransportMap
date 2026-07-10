import { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin } from 'lucide-react';
import suburbIndex from '../data/generated/suburb-index.json';
import type { SuburbIndexEntry } from '../types/data';
import { site } from '../config/site';
import { track } from '../lib/analytics';

const SUBURBS = (suburbIndex as { suburbs: SuburbIndexEntry[] }).suburbs;

/**
 * The funnel's front door. Suburb matches resolve instantly against the
 * bundled index with zero network. Address lookups go straight from the
 * browser to the geocoder on explicit submit only (per the Nominatim usage
 * policy); the address string is never stored, logged, or put in a URL.
 */
const LookupInput = ({ autoFocus = false }: { autoFocus?: boolean }) => {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const boxRef = useRef<HTMLDivElement>(null);

    const matches = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (q.length < 2) return [];
        const starts = SUBURBS.filter(s => s.name.toLowerCase().startsWith(q));
        const contains = SUBURBS.filter(s => !s.name.toLowerCase().startsWith(q) && s.name.toLowerCase().includes(q));
        return [...starts, ...contains].slice(0, 6);
    }, [query]);

    useEffect(() => {
        const close = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const goSuburb = (slug: string) => {
        track('lookup_performed', { method: 'suburb' });
        setOpen(false);
        if (document.startViewTransition) {
            document.startViewTransition(() => {
                navigate(`/score/${slug}`);
            });
        } else {
            navigate(`/score/${slug}`);
        }
    };

    const geocodeAddress = async () => {
        const q = query.trim();
        if (q.length < 4) return;
        setBusy(true);
        setError(null);
        try {
            const url = new URL(site.geocoder.endpoint);
            url.searchParams.set('format', 'json');
            url.searchParams.set('q', q);
            url.searchParams.set('viewbox', site.geocoder.viewbox);
            url.searchParams.set('bounded', '1');
            url.searchParams.set('limit', '1');
            const res = await fetch(url.toString());
            const data: { lat: string; lon: string }[] = await res.json();
            if (!data.length) {
                setError('No match found. Try a suburb name or a fuller address.');
                return;
            }
            // Coordinates rounded to ~11m; the address string goes nowhere.
            const lat = parseFloat(data[0].lat).toFixed(4);
            const lon = parseFloat(data[0].lon).toFixed(4);
            track('lookup_performed', { method: 'address' });
            if (document.startViewTransition) {
                document.startViewTransition(() => {
                    navigate(`/result?lat=${lat}&lon=${lon}`);
                });
            } else {
                navigate(`/result?lat=${lat}&lon=${lon}`);
            }
        } catch {
            setError('Address search is unavailable right now. Suburb search still works.');
        } finally {
            setBusy(false);
        }
    };

    const submit = () => {
        if (matches.length > 0) {
            goSuburb(matches[0].slug);
        } else {
            void geocodeAddress();
        }
    };

    return (
        <div ref={boxRef} className="relative w-full max-w-xl">
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-faint" />
                <input
                    type="text"
                    value={query}
                    autoFocus={autoFocus}
                    onChange={(e) => { setQuery(e.target.value); setOpen(true); setError(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                    placeholder="Your suburb or address"
                    aria-label="Search your suburb or address"
                    className="w-full pl-12 pr-28 py-4 bg-surface-raised border border-border-strong rounded-[4px] text-lg text-ink placeholder-ink-faint focus:outline-none"
                />
                <button
                    onClick={submit}
                    disabled={busy}
                    className="pressable absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-magenta text-white font-semibold rounded-[4px] disabled:opacity-60"
                >
                    {busy ? 'Searching' : 'Get score'}
                </button>
            </div>

            {open && matches.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-surface-raised border border-border-strong rounded-[4px] overflow-hidden z-50">
                    {matches.map(s => (
                        <button
                            key={s.slug}
                            onClick={() => goSuburb(s.slug)}
                            className="w-full text-left px-4 py-3 hover:bg-fusion-purple/50 border-b border-border-subtle last:border-0 flex items-center justify-between"
                        >
                            <span className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-ink-faint" />
                                {s.name}
                            </span>
                            <span className="type-data text-sm text-ink-soft">{s.score}/100</span>
                        </button>
                    ))}
                </div>
            )}

            {error && <p className="mt-2 text-sm text-band-poor">{error}</p>}
            <p className="mt-2 text-xs text-ink-faint">
                Addresses are geocoded in your browser and never stored. {site.geocoder.attribution}.
            </p>
        </div>
    );
};

export default LookupInput;
