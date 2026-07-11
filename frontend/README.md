# Transport Score frontend

Vite + React + Tailwind 4 site for the Fusion Transport Score funnel.

## Commands

- `npm run dev` starts the dev server. If scored stop data is missing it generates a labelled sample dataset first.
- `npm run build` runs the full production pipeline: data derivation, typecheck, client build, SSR build, share image generation, prerender of every suburb page, then voice and compliance checks. The build fails when a page or share image lacks the authorisation line.
- `npm run test` runs the golden scoring tests. They recompute suburb aggregates from stop inputs using only the formulas printed on the methodology page.
- `npm run check` runs the voice lint and compliance scan on their own.

## Environment

- `VITE_SITE_ORIGIN` production origin, required for a non-sample build (absolute `og:image` URLs).
- `VITE_ANALYTICS_DOMAIN` Plausible domain. Unset means the analytics adapter logs to the console and sends nothing.

## Where things live

- `src/config/` every campaign-tunable value: brand tokens, join URL and UTM tagging, authorisation line, price anchors (refreshed each July 1), CTA copy variants.
- `src/lib/scoring.ts` the one implementation of the catchment and suburb formulas, shared by the browser and the build scripts.
- `scripts/` build-time pipeline: data derivation, fixture generation, prerender, share images, checks.
- `public/data/` generated stop and suburb data. Regenerate with the Rust processor plus `npm run build:data`; never hand-edit.
- `data-src/shapes.json` the committed source for the /map route lines. `npm run build:shapes` shards it into `public/data/shapes/` (each shard under 25MB); if the Rust processor drops a fresh `shapes.json` into `public/data/`, the sharding script promotes it into `data-src/` automatically and removes the oversized copy from the public dir.

## Deploy to Cloudflare Workers

The production build is fully static (`dist/client`), so it deploys as a static-assets Worker: no server-side Worker script, Wrangler just serves the prerendered output.

1. `npx wrangler login` once, if this machine hasn't authenticated before.
2. Set the build-time environment before building. These are **Vite env vars baked in at build time**, not Workers runtime vars, because nothing here reads them per-request:
   ```
   VITE_SITE_ORIGIN=https://your-domain.example
   VITE_ANALYTICS_DOMAIN=your-plausible-domain.example
   ```
3. `npm run deploy:workers` builds (via its `predeploy:workers` hook) and runs `wrangler deploy`.
4. Confirm `wrangler.toml`'s `name` matches the Worker you want in your account, and attach a custom domain in the Cloudflare dashboard if `VITE_SITE_ORIGIN` points at one.

Every static asset must be under Cloudflare's 25 MiB per-file limit. The only file in this repo that ever approached it, the route-line geometry, is pre-sharded by `npm run build:shapes` into per-mode files well under that cap; nothing else in the build comes close.
