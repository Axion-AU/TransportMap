import { Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import LandingPage from './pages/LandingPage';
import SuburbScorePage from './pages/SuburbScorePage';
import ResultPage from './pages/ResultPage';
import LeagueTablePage from './pages/LeagueTablePage';
import EmbedLeagueTable from './pages/EmbedLeagueTable';
import EmbedSuburbScore from './pages/EmbedSuburbScore';
import ComparePage from './pages/ComparePage';
import Methodology from './pages/Methodology';
import NetworkPlanPage from './pages/NetworkPlanPage';
import ClientOnly from './components/ClientOnly';
import CompareIndexPage from './pages/CompareIndexPage';

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
        <Route path="/embed/score/:slug" element={<EmbedSuburbScore />} />
        <Route path="/compare" element={<CompareIndexPage />} />
        <Route path="/compare/:slugA_vs_slugB" element={<ComparePage />} />
        <Route path="/methodology" element={<Methodology />} />
        <Route path="/the-plan" element={<NetworkPlanPage />} />
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
