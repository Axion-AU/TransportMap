import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { initAnalytics } from './lib/analytics';

initAnalytics();

// Global handler for dynamic import chunk load errors (Vite)
if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
        const isChunkError = 
            event.message?.includes('Failed to fetch dynamically imported module') ||
            event.message?.includes('Loading chunk') ||
            event.message?.includes('Failed to fetch');
            
        if (isChunkError) {
            const hasReloaded = sessionStorage.getItem('chunk-error-reload');
            if (!hasReloaded) {
                sessionStorage.setItem('chunk-error-reload', 'true');
                window.location.reload();
            }
        }
    }, true);

    window.addEventListener('unhandledrejection', (event) => {
        const isChunkError = 
            event.reason?.message?.includes('Failed to fetch dynamically imported module') ||
            event.reason?.message?.includes('Loading chunk') ||
            event.reason?.message?.includes('Failed to fetch');
            
        if (isChunkError) {
            const hasReloaded = sessionStorage.getItem('chunk-error-reload');
            if (!hasReloaded) {
                sessionStorage.setItem('chunk-error-reload', 'true');
                window.location.reload();
            }
        }
    });

    // Clear reload flag if the application loads successfully
    sessionStorage.removeItem('chunk-error-reload');
}

const root = document.getElementById('root')!;
const app = (
    <React.StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </React.StrictMode>
);

// Prerendered pages hydrate; the dev server and non-prerendered routes render
// fresh. Check element children, not hasChildNodes(): the unprocessed
// index.html template still has the literal <!--app-html--> comment node,
// which would otherwise look like server-rendered content in dev.
if (root.children.length > 0) {
    ReactDOM.hydrateRoot(root, app);
} else {
    ReactDOM.createRoot(root).render(app);
}
