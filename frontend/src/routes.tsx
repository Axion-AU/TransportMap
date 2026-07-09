import { Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import LandingPage from './pages/LandingPage';
import SuburbScorePage from './pages/SuburbScorePage';
import ResultPage from './pages/ResultPage';
import LeagueTablePage from './pages/LeagueTablePage';
import EmbedLeagueTable from './pages/EmbedLeagueTable';
import Methodology from './pages/Methodology';
import ClientOnly from './components/ClientOnly';

// Leaflet stays out of every funnel chunk: the map page is lazy and
// mounts only in the browser.
const MapPage = lazy(() => import('./pages/MapPage'));

const AppRoutes = () => (
    <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/score/:slug" element={<SuburbScorePage />} />
        <Route path="/result" element={<ResultPage />} />
        <Route path="/suburbs" element={<LeagueTablePage />} />
        <Route path="/embed/suburbs" element={<EmbedLeagueTable />} />
        <Route path="/methodology" element={<Methodology />} />
        <Route
            path="/map"
            element={
                <ClientOnly fallback={<div className="p-8 text-ink-soft">Loading map…</div>}>
                    <Suspense fallback={<div className="p-8 text-ink-soft">Loading map…</div>}>
                        <MapPage />
                    </Suspense>
                </ClientOnly>
            }
        />
    </Routes>
);

export default AppRoutes;
