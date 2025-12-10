import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useState } from 'react';
import Map from './components/Map';
import Legend from './components/Legend';
import Controls from './components/Controls';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import AboutPage from './pages/AboutPage';
import Methodology from './pages/Methodology';
import AddressSearch from './components/AddressSearch';

function MapPage() {
  const [viewMode, setViewMode] = useState<'connectivity' | 'mode'>('connectivity');

  return (
    <div className="relative h-full w-full">
      <Map viewMode={viewMode}>
        <AddressSearch />
      </Map>
      <Controls viewMode={viewMode} setViewMode={setViewMode} />
      <Legend viewMode={viewMode} onInfoClick={() => { }} />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<MapPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/methodology" element={<Methodology />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
