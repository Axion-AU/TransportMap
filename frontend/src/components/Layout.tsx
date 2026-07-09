import { Link, useLocation } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';
import Footer from './Footer';
import { site } from '../config/site';
import ringsUrl from '../assets/fusion-rings.svg';
import manifest from '../data/generated/manifest.json';
import { initAnalytics } from '../lib/analytics';

interface LayoutProps {
    children: ReactNode;
}

const NAV = [
    { to: '/', label: 'Your score' },
    { to: '/suburbs', label: 'Worst 20' },
    { to: '/methodology', label: 'Methodology' },
    { to: '/map', label: 'Map' },
];

const Layout = ({ children }: LayoutProps) => {
    const location = useLocation();
    const isMap = location.pathname.startsWith('/map');
    const isEmbed = location.pathname.startsWith('/embed');

    useEffect(() => {
        initAnalytics();
    }, []);

    if (isEmbed) {
        return <>{children}</>;
    }

    return (
        <div className={`${isMap ? 'h-screen' : 'min-h-screen'} flex flex-col bg-purple-900 text-ink`}>
            {manifest.fixture && (
                <div data-sample-banner className="bg-magenta text-white text-center text-sm font-semibold px-4 py-1.5">
                    SAMPLE DATA. This build runs on generated example scores, published for testing only.
                </div>
            )}
            <nav className="h-14 border-b border-border-subtle flex items-center justify-between px-5 z-[5000] bg-purple-900/90 backdrop-blur-md">
                <Link to="/" className="flex items-center gap-2.5 shrink-0">
                    <img src={ringsUrl} alt="" className="h-7 w-7" />
                    <span className="type-display text-xl tracking-tight whitespace-nowrap">FUSION<span className="hidden md:inline text-ink-soft font-bold"> TRANSPORT SCORE</span></span>
                </Link>

                <div className="flex items-center gap-0.5 sm:gap-1">
                    {NAV.map(item => (
                        <Link
                            key={item.to}
                            to={item.to}
                            className={`px-2 sm:px-3 py-1.5 rounded-[4px] text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${location.pathname === item.to
                                ? 'bg-surface-raised text-ink border border-border-strong'
                                : 'text-ink-soft hover:text-ink hover:bg-surface-raised/60'}`}
                        >
                            {item.label}
                        </Link>
                    ))}
                </div>
            </nav>

            <main className={`flex-1 relative ${isMap ? 'overflow-hidden' : ''}`}>
                {children}
            </main>

            {isMap ? (
                <div className="border-t border-border-subtle bg-purple-900 px-5 py-1.5 type-overline text-ink text-center">
                    {site.authorisationLine}
                </div>
            ) : (
                <Footer />
            )}
        </div>
    );
};

export default Layout;
