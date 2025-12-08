import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

interface LayoutProps {
    children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
    const location = useLocation();

    return (
        <div className="h-screen flex flex-col bg-slate-900 text-white overflow-hidden">
            <nav className="h-14 bg-slate-900/90 backdrop-blur-md border-b border-slate-700 flex items-center justify-between px-4 z-[5000]">
                <div className="flex items-center gap-2">
                    <span className="text-xl">🚋</span>
                    <h1 className="font-bold text-lg tracking-tight">Transport Inequality</h1>
                </div>

                <div className="flex items-center gap-1 bg-slate-800/50 p-1 rounded-lg border border-slate-700/50">
                    <Link
                        to="/"
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${location.pathname === '/' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
                    >
                        Map
                    </Link>
                    <Link
                        to="/about"
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${location.pathname === '/about' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
                    >
                        About
                    </Link>
                </div>
            </nav>

            <main className="flex-1 relative overflow-hidden">
                {children}
            </main>
        </div>
    );
};

export default Layout;
