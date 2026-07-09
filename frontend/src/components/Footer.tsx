import { Link } from 'react-router-dom';
import { site } from '../config/site';
import manifest from '../data/generated/manifest.json';

/**
 * Rendered on every page. The authorisation line comes from config and is
 * verified against every built page by scripts/check-compliance.mjs.
 */
const Footer = () => {
    return (
        <footer className="border-t border-border-subtle bg-purple-900">
            <div className="spectrum-line" />
            <div className="max-w-4xl mx-auto px-5 py-8 space-y-4 text-sm text-ink-soft">
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                    <Link to="/methodology" className="text-blue hover:brightness-125">How the score works</Link>
                    <Link to="/suburbs" className="text-blue hover:brightness-125">Worst served suburbs</Link>
                    <Link to="/map" className="text-blue hover:brightness-125">Explore the map</Link>
                    <a href={site.joinUrl} className="text-blue hover:brightness-125">Join Fusion</a>
                </div>
                <p>
                    Your privacy: addresses are geocoded in your browser and never stored by us.
                    We count lookups per suburb, never per person. No ad pixels, no cookies.
                </p>
                <p className="text-ink-faint">
                    Scores computed from {manifest.dataVintageLabel}. Methodology version {manifest.methodologyVersion}.
                    Every number on this site is reproducible from the <Link to="/methodology" className="underline">methodology page</Link>.
                </p>
                <p className="type-overline text-ink">
                    {site.authorisationLine}
                </p>
            </div>
        </footer>
    );
};

export default Footer;
