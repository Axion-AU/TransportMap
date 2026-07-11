import { Link } from 'react-router-dom';
import { usePageMeta } from '../lib/meta';

const NotFoundPage = () => {
    usePageMeta('Page not found | Transport Score', 'The page you requested does not exist.');

    return (
        <div className="max-w-md mx-auto px-5 py-20 text-center space-y-6">
            <div className="space-y-2">
                <span className="type-overline text-magenta text-sm">Error 404</span>
                <h1 className="type-display text-4xl uppercase">Page not found</h1>
            </div>
            <p className="text-ink-soft leading-relaxed">
                The page you are looking for does not exist, has been moved, or is temporarily unavailable.
            </p>
            <div className="pt-4">
                <Link
                    to="/"
                    className="pressable inline-block px-6 py-3 bg-magenta text-white font-semibold rounded-[4px] shadow-lg hover:bg-magenta/90 transition-all text-sm uppercase tracking-wider"
                >
                    Go back home
                </Link>
            </div>
        </div>
    );
};

export default NotFoundPage;
