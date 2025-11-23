# Repository Guidelines

## Project Structure & Module Organization
- `app/` hosts the App Router entrypoints (`layout.tsx`, `page.tsx`, `globals.css`) that mount the ocean canvas.
- `components/` includes React Three Fiber modules (`OceanScene`, `WaveGenerator`, Leva controls, post-processing).
- `src/` retains the low-level simulation: `ocean/` geometry, `waves/` cascade logic, and `resources/shader/` WGSL kernels.
- `public/` and `resources/` store static assets plus the SharedArrayBuffer service worker.
- Root configs (`next.config.js`, `tsconfig.json`, `coi-serviceworker.js`) centralize environment tweaks—do not scatter copies inside feature code.

## Build, Test, and Development Commands
- `npm run dev` starts the Next.js dev server with hot reload for everyday iteration.
- `npm run build` emits the production bundle and catches missing shader imports; run it before merging.
- `npm run start` serves the compiled app locally, mirroring Vercel.
- `npm run lint` runs `next lint` (`eslint-config-next`), our only automated quality gate.

## Coding Style & Naming Conventions
Favor TypeScript functional components, 2-space indentation, and trailing commas where ESLint expects them. Components/classes are `PascalCase`, hooks/utilities `camelCase`, and GPU constants may stay `SCREAMING_SNAKE_CASE`. Keep heavy math and WGSL wiring in `src/`, while UI orchestration lives in `components/`. No repo-wide formatter exists, so mirror existing files and run `npm run lint` before committing.

## Testing Guidelines
There is no Jest/Vitest suite; rely on lint + manual GPU checks. Run `npm run lint`, then `npm run dev` and confirm the canvas initializes without console warnings in Chrome or Edge ≥113 with WebGPU enabled. When touching WGSL files, test the 5 m, 17 m, and 250 m cascades through `OceanControls` to confirm phase continuity. Provide a screenshot or short clip when visuals or Leva panels change, so reviewers can verify remotely.

## Commit & Pull Request Guidelines
History favors short, imperative commit messages (“codrops example”, “stack cleanup and doc submit”). Continue that style and optionally prefix with the subsystem (`ocean:`). Each PR should summarize intent, call out touched components or shaders, list manual test browsers/GPUs, and include screenshots or metrics for rendering changes. Confirm `npm run build` passes and link any related issues or Vercel deploy previews.

## Security & Configuration Tips
SharedArrayBuffer support depends on `coi-serviceworker.js`, COOP/COEP headers, and `vercel.json`; modify these only with reviewer buy-in. The simulation runs fully client-side, so keep `.env` files local and never commit API tokens or browser flag dumps.
