import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

const root = document.getElementById('root')!;
const app = (
    <React.StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </React.StrictMode>
);

// Prerendered pages hydrate; the dev server and non-prerendered routes render fresh.
if (root.hasChildNodes()) {
    ReactDOM.hydrateRoot(root, app);
} else {
    ReactDOM.createRoot(root).render(app);
}
