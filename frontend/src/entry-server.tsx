import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { StaticRouter } from 'react-router';
import App from './App';

/** Called per-route by scripts/prerender.mjs. */
export function render(url: string): string {
    return ReactDOMServer.renderToString(
        <React.StrictMode>
            <StaticRouter location={url}>
                <App />
            </StaticRouter>
        </React.StrictMode>,
    );
}
