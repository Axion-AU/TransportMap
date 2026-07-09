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
