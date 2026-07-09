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

// Prerendered pages hydrate; the dev server and non-prerendered routes render
// fresh. Check element children, not hasChildNodes(): the unprocessed
// index.html template still has the literal <!--app-html--> comment node,
// which would otherwise look like server-rendered content in dev.
if (root.children.length > 0) {
    ReactDOM.hydrateRoot(root, app);
} else {
    ReactDOM.createRoot(root).render(app);
}
