import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect, type ReactNode } from 'react';
import Footer from './Footer';
import { site } from '../config/site';
import manifest from '../data/generated/manifest.json';
import { initAnalytics } from '../lib/analytics';

interface LayoutProps {
    children: ReactNode;
}

const NAV = [
    { to: '/', label: 'Your score' },
    { to: '/suburbs', label: 'Worst 20' },
    { to: '/the-plan', label: 'The plan', beta: manifest.planFixture },
    { to: '/methodology', label: 'Methodology' },
    { to: '/map', label: 'Map' },
];

const Layout = ({ children }: LayoutProps) => {
    const location = useLocation();
    const isMap = location.pathname.startsWith('/map');
    const isEmbed = location.pathname.startsWith('/embed');
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    useEffect(() => {
        initAnalytics();
    }, []);

    // Close menu when location changes (in case navigation happens without click)
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsMenuOpen(false);
    }, [location.pathname]);

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
            <nav className="h-14 border-b border-border-subtle flex items-center justify-between px-5 z-[5000] bg-purple-900/90 backdrop-blur-md sticky top-0">
                <Link to="/" className="flex items-center gap-2.5 shrink-0">
                    <img src="/solo-mono-white.svg" alt="Fusion Logo" className="h-7 w-7" />
                    <span className="type-display text-xl tracking-tight whitespace-nowrap">FUSION<span className="hidden md:inline text-ink-soft font-bold"> TRANSPORT SCORE</span></span>
                </Link>

                {/* Desktop Navigation */}
                <div className="hidden md:flex items-center gap-1.5">
                    {NAV.map(item => (
                        <Link
                            key={item.to}
                            to={item.to}
                            className={`px-3 py-1.5 rounded-[4px] text-sm font-semibold whitespace-nowrap transition-colors ${location.pathname === item.to
                                ? 'bg-surface-raised text-ink border border-border-strong'
                                : 'text-ink-soft hover:text-ink hover:bg-surface-raised/60'}`}
                        >
                            {item.label}
                            {item.beta && (
                                <sup className="ml-1 text-magenta font-bold tracking-wide" style={{ fontSize: '0.65em' }}>BETA</sup>
                            )}
                        </Link>
                    ))}
                </div>

                {/* Mobile Menu Button */}
                <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="md:hidden p-2 text-ink-soft hover:text-ink hover:bg-surface-raised/60 rounded-[4px] transition-colors focus-visible:outline-none"
                    aria-label="Toggle menu"
                    aria-expanded={isMenuOpen}
                >
                    {isMenuOpen ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    ) : (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    )}
                </button>
            </nav>

            {/* Mobile Navigation Drawer */}
            {isMenuOpen && (
                <div className="fixed inset-x-0 bottom-0 z-[4999] md:hidden bg-purple-900/98 backdrop-blur-lg flex flex-col border-b border-border-subtle" style={{ top: '56px' }}>
                    <div className="flex flex-col p-5 gap-2">
                        {NAV.map(item => (
                            <Link
                                key={item.to}
                                to={item.to}
                                className={`px-4 py-3.5 rounded-[4px] text-lg font-semibold transition-colors flex items-center justify-between ${location.pathname === item.to
                                    ? 'bg-surface-raised text-ink border border-border-strong'
                                    : 'text-ink-soft hover:text-ink hover:bg-surface-raised/40'}`}
                            >
                                <span>{item.label}</span>
                                {item.beta && (
                                    <span className="text-magenta font-bold tracking-wide text-xs">BETA</span>
                                )}
                            </Link>
                        ))}
                    </div>
                </div>
            )}

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
