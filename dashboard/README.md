# Multiverse of Monsoon — India's Climate Digital Twin (Frontend)

Standalone, offline-first scientific frontend built to live inside the `dashboard/` directory of the climate-model repository and integrate with the Round 1 FastAPI backend (`serve.py`).

---

## 1. Implemented Capabilities

- **Editorial Landing Page (`/`)**: Deep slate scientific atlas palette, self-hosted typography (`Fraunces`, `IBM Plex Sans`, `IBM Plex Mono`), and a deterministic 32 × 36 conceptual atmospheric schematic (`6.5–37.5°N`, `65.5–100.5°E`) explicitly labeled `"Conceptual schematic. Not model output."`
- **Backend Status & Contract Verification (`/status`)**: Live `POST /health` probe, HTTP/HTTPS API base URL override with validation, browser-local `mom-ic-v1` JSON loader and Zod validator (5 MB max), 1-step `POST /simulate` contract test (`perturbation: null`), `AbortController` cancellation, 30 s default timeout, and 6 classified error states.
- **Climate Twin Dashboard (`/twin`)**: Compact `Float32Array` rollout storage with `(step, channel, row, col)` indexing, sequential baseline execution with per-IC caching, zero-interpolation discrete 32 × 36 canvas map with IC-derived orientation, optional `land_sea_mask` outline, wind-vector overlay (*direction toward which wind blows*), colourblind-safe scientific scales (Cividis/Viridis, `log1p` rainfall, symmetric diverging RdBu), fixed-run vs per-day range toggle, Day 1–10 scrubbing (`rollout[0]` = Day 1), Day A vs Day B comparison, `cos(latitude)` regional aggregation, lazy-loaded daily time-series chart with accessible data table, and client-side PNG/CSV exports.
- **Experiment Lab & Live Shock Builder (`/lab`)**: Multi-channel `[6, 32, 36]` physical-unit perturbation builder with Box and cosine-corrected Gaussian footprints, live preview map, 3 editable demonstration presets (`Control — Zero Shock`, `Warm Bay of Bengal`, `Weaker Arabian Sea Wind`), Zod JSON import/export (1 MB max), synchronized 3-map Baseline / Scenario / Difference (`Scenario − Baseline`) comparison, and a descriptive diagnostics panel (**"Descriptive diagnostics — not scientific validation"**).
- **Impact Lens (`/impact`)**: Actual-run multi-day accumulated rainfall (mm), editable heavy-rain and dry-day thresholds, optional editable heat-day (`°C`) counts, baseline vs scenario difference maps, regional summary table, lazy-loaded daily rainfall chart, explicit Scientific Limitations card, and CSV/PNG exports. Synthetic fixtures are strictly blocked.
- **Model, Method & About Transparency (`/model`, `/method`, `/about`)**: Verified wire contract (`docs/API_CONTRACT.md`), centralized facts (`src/config/projectFacts.ts`), explicit `TO BE PROVIDED BY TEAM` placeholders for unprovided facts, and visible Limitations & Interpretation Boundaries sections.

---

## 2. Running Locally (Offline-First)

1. Copy `.env.example` to `.env` if you need custom local settings (defaults work out of the box):
   ```bash
   cp .env.example .env
   ```
2. Start the climate backend from your climate-model repository:
   ```bash
   python serve.py --port 8000
   ```
3. Install dependencies and start the frontend:
   ```bash
   npm install
   npm run dev
   ```
   Open `http://localhost:3000/status`. Requests to `/api/*` are proxied on the same origin by Vite (`server.proxy` and `preview.proxy`) to `VITE_API_PROXY_TARGET` (default `http://localhost:8000`), stripping the `/api` prefix so browser CORS restrictions on `serve.py` are avoided during local runs.

> **Important**: A remote cloud preview cannot reach `localhost:8000` on your personal computer. Run both `serve.py` and this frontend locally on your machine to execute live model rollouts.

### Initial-Conditions (`mom-ic-v1`) File Generation

This frontend validates and consumes local `mom-ic-v1` JSON files (`[3, 6, 32, 36]` physical states + `doy_sincos` + `grid.lat`/`grid.lon` + optional `static.land_sea_mask`, up to 5 MB). **Writing and maintaining the Python extraction script that exports real ERA5 / climate-dataset slices into `mom-ic-v1` JSON files is the climate-model team's responsibility** inside the backend repository. Store generated `*.ic.json` files inside `local-data/` (excluded via `.gitignore`) so raw datasets are never committed to version control.

---

## 3. Quality Gates & Verification Commands

```bash
npm run typecheck   # Strict TypeScript check (tsc --noEmit)
npm run lint        # Type/syntax validation (tsc --noEmit)
npm test            # Vitest + Testing Library + axe-core suite (17 files, 79 tests)
npm run build       # Production bundle (NODE_ENV=production vite build) with static CSP
npm run preview     # Preview built dist/ on http://localhost:4173 with /api proxy
```

### Measured Production Bundle Sizes (`NODE_ENV=production vite build`)
- **Landing-page JS (`index-*.js` + `rolldown-runtime-*.js`)**: `318.17 kB` raw / **`101.05 kB` gzip** (target: ≤ 200 kB gzip)
- **Compiled CSS (`index-*.css`)**: `42.40 kB` raw / `7.86 kB` gzip
- **Lazy-loaded workspace & chart chunks**: `TwinPage` (`13.15 kB` gz), `LabPage` (`12.24 kB` gz), `ImpactPage` (`8.37 kB` gz), `StatusPage` (`6.00 kB` gz), `VariableTimeSeriesChart` (`2.84 kB` gz), `DailyRainfallChart` (`2.04 kB` gz)
- **Total JS across all 20 chunks**: `661.05 kB` raw / `200.66 kB` gzip

---

## 4. Direct Dependencies & Verified Licences

### Runtime Dependencies
| Package | Version | Licence | Purpose |
|---|---:|---|---|
| `react` | `19.3.1` | MIT | UI component runtime |
| `react-dom` | `19.3.1` | MIT | Browser DOM renderer |
| `react-router-dom` | `7.18.7` | MIT | Client-side routing across all 8 routes |
| `zod` | `4.6.7` | MIT | Runtime contract & JSON file validation (`mom-ic-v1`, shock JSON, API schemas) |
| `d3-scale` | `4.0.3` | ISC | Quantitative scientific linear/log colour scales |
| `d3-scale-chromatic` | `3.1.1` | ISC | Colourblind-safe Cividis, Viridis, and RdBu interpolators |
| `lucide-react` | `0.546.0` | ISC | Lightweight UI icons |
| `@fontsource/fraunces` | `5.3.0` | OFL-1.1 | Self-hosted display serif typography (offline-first) |
| `@fontsource/ibm-plex-sans` | `5.3.0` | OFL-1.1 | Self-hosted body sans typography (offline-first) |
| `@fontsource/ibm-plex-mono` | `5.3.0` | OFL-1.1 | Self-hosted tabular monospace typography (offline-first) |

### Development Dependencies
`vite`, `@vitejs/plugin-react`, `typescript`, `tailwindcss`, `@tailwindcss/vite`, `vitest`, `happy-dom`, `@testing-library/react`, `@testing-library/jest-dom`, `axe-core`, and `@types/*` (`node`, `react`, `react-dom`, `d3-scale`, `d3-scale-chromatic`). Unused template dev packages (`tsx`, `esbuild`) were removed in Phase 3.

---

## 5. Documentation Index

- `docs/API_CONTRACT.md` — Verified Round 1 backend API wire contract (`POST /health`, `POST /simulate`, physical units, indexing).
- `docs/INTEGRITY_AUDIT.md` — Provenance audit of every user-facing claim, locked scientific calculation, and limitations disclosure.
- `docs/SECURITY.md` — Frontend threat model, input/API hardening, static Content Security Policy, and mandatory public backend deployment requirements.
- `docs/DEMO_SCRIPT.md` — 13-step 5-minute live judge demonstration script with 5 honest non-synthetic fallbacks.
- `docs/BRIEF_PAGE2_DRAFT.md` — Page 2 brief draft covering implemented visualisation and impact features with explicit team placeholders.

---

## 6. Security & Privacy Summary

- Zero AI/LLM API calls, zero external CDNs/fonts/map tiles, and zero client-side secrets (`VITE_*` variables are strictly public).
- Production builds inject a strict `<meta http-equiv="Content-Security-Policy">` tag and exclude dev synthetic fixture code (`VITE_ENABLE_FIXTURE=false` by default).
- Untrusted JSON inputs and API responses strip prototype-pollution keys, enforce strict size and Zod schema bounds, and never render raw HTML error pages or server tracebacks.
- **A frontend cannot secure a public backend.** Review `docs/SECURITY.md` before exposing `serve.py` beyond `localhost`.
