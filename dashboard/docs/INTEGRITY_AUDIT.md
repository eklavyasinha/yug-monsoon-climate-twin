# Scientific Integrity Audit — Multiverse of Monsoon

This document audits every user-facing claim, metric, label, calculation, and visualization in the **Multiverse of Monsoon** frontend (`dashboard/`).

**Audit scope**: Frontend source code (`src/`), configuration (`src/config/projectFacts.ts`), documentation (`docs/`), and Vitest calculation tests (`src/tests/`). Backend model weights, training pipelines, and live local ERA5/model datasets were **not** inspected in this environment.

---

## 1. Classification of User-Facing Content

Every claim, metric, and label rendered in the application belongs to exactly one of five provenance categories:

| Route / Component | Displayed Item | Classification | Provenance / Verification |
|---|---|---|---|
| `/` (`LandingPage`) | Domain grid (`32 × 36`, 1°), 6 physical channels (`t2m`, `tp`, `u10`, `v10`, `msl`, `tcwv`), 1–10 day rollout horizon | `TEAM-PROVIDED` | Verified against `R1_CONTRACT.md`, `serve.py`, and `docs/API_CONTRACT.md` via `src/config/projectFacts.ts`. |
| `/` (`HeroAtmosphericSchematic`) | 32 × 36 schematic visual in hero | `PLACEHOLDER` | Explicitly labeled `"Conceptual schematic. Not model output."` in caption and SVG `aria-label`. Never represented as a forecast. |
| `/` (`LandingPage`) | Structural limitations list (1° resolution, daily means, experimental model, exploratory perturbations) | `TEAM-PROVIDED` | `PROJECT_FACTS.limitations.structuralLimitations`. |
| `/status` (`StatusPage`) | `status`, `model_name`, `inference_ms`, rollout shape `[steps, 6, 32, 36]`, finite-value check | `ACTUAL MODEL OUTPUT` | Parsed and Zod-validated live from `POST /health` and `POST /simulate` via `src/api/client.ts`. |
| `/status` (`StatusPage`) | Frontend round-trip latency (`roundTripMs`) | `FRONTEND-COMPUTED` | Measured locally via `performance.now()` around `fetch()`, always displayed separately from server `inference_ms`. |
| `/twin` (`TwinPage`) | Discrete 32 × 36 field values, Day 1–N slider (`rollout[0]` = Day 1) | `ACTUAL MODEL OUTPUT` | Stored verbatim in raw physical units inside `Float32Array` (`src/utils/rolloutStore.ts`); no silent clipping or interpolation. |
| `/twin` (`TwinPage`) | Display unit conversions (`K → °C`, `Pa → hPa`), wind speed `hypot(u10, v10)`, wind direction toward `(atan2(u10, v10)·180/π + 360) mod 360`, Day B − Day A delta | `FRONTEND-COMPUTED` | Deterministic formulas in `src/utils/units.ts` & `src/utils/rolloutStore.ts`, locked by `src/tests/unitsAndAggregation.test.ts` and `src/tests/rolloutStore.test.ts`. |
| `/twin` (`TwinPage`) | Regional area-weighted mean (`cos(latitude)`), min, max, daily series, PNG & CSV exports | `FRONTEND-COMPUTED` | `src/utils/aggregation.ts` & `src/utils/exportData.ts`; CSV includes metadata header with model name, IC label, `inference_ms`, and `roundTripMs`. |
| `/twin` (`TwinPage`, dev-only opt-in) | Synthetic dev fixture when `VITE_ENABLE_FIXTURE=true` and explicitly clicked | `SYNTHETIC FIXTURE` | Guarded behind `VITE_ENABLE_FIXTURE === 'true'`, tree-shaken out of production builds, watermarked `"SYNTHETIC FIXTURE — NOT MODEL OUTPUT"` on banner, PNG, and CSV, and blocked from `/lab` and `/impact`. |
| `/lab` (`LabPage`) | Perturbation tensor `[6][32][36]` (Box & Gaussian footprints) | `FRONTEND-COMPUTED` | Constructed in physical delta units in `src/utils/shockBuilder.ts`, aligned to IC `grid.lat`/`grid.lon`, locked by `src/tests/shockBuilder.test.ts`. |
| `/lab` (`LabPage`) | Baseline rollout (`perturbation: null`) & Scenario rollout (`perturbation: [6][32][36]`) | `ACTUAL MODEL OUTPUT` | Executed sequentially against live `POST /simulate` for uncontaminated `inference_ms`. |
| `/lab` (`LabPage`) | Scenario − Baseline difference map, region-box mean delta, max absolute delta, descriptive integrity checks (no NaN/Inf, plausible ranges, nonzero response, Day 1 localization, numerical blow-up check) | `FRONTEND-COMPUTED` | `src/utils/labDiagnostics.ts`, explicitly labeled **"Descriptive diagnostics — not scientific validation"** and locked by `src/tests/labDiagnostics.test.ts`. |
| `/impact` (`ImpactPage`) | Multi-day accumulated rainfall (mm), user-editable heavy-rain days (`tp >= threshold`), dry days (`tp < threshold`), optional heat days (`t2m_C >= threshold`), baseline vs scenario deltas, CSV/PNG exports | `FRONTEND-COMPUTED` | Strictly derived from actual backend rollouts (`src/utils/impactMetrics.ts`), locked by `src/tests/impactMetrics.test.ts`. Synthetic fixtures are explicitly blocked. |
| `/model` (`ModelPage`) | Model name (`WeatherNet-Rollout-Baseline`), `POST /health` and `POST /simulate` contract facts | `TEAM-PROVIDED` | Directly verified in `serve.py` and `R1_CONTRACT.md`. |
| `/model` & `/about` | Architecture details, parameter count, training years, evaluation scores (RMSE/ACC), team members, institution, contact | `PLACEHOLDER` | Explicitly rendered as `TO BE PROVIDED BY TEAM` (`null` in `src/config/projectFacts.ts`). Never fabricated. |
| `/method` (`MethodPage`) | Grid conventions, `mom-ic-v1` JSON schema, Round 1 benchmark shocks, limitations & interpretation boundaries | `TEAM-PROVIDED` | Directly derived from `R1_CONTRACT.md` and `docs/API_CONTRACT.md`. |

---

## 2. Locked Scientific Calculations & Automated Test Coverage

Every derived calculation in the frontend is unit-tested in Vitest (`npm test`):

1. **Kelvin → Celsius & Pascal → hPa conversions** (`src/utils/units.ts`) — tested in `src/tests/unitsAndAggregation.test.ts` (including difference scaling: ΔK = Δ°C, ΔPa / 100 = ΔhPa).
2. **Wind speed & direction convention** (`hypot(u10, v10)` and direction *toward* which wind blows: `(atan2(u10, v10) * 180 / π + 360) mod 360`) — tested in `src/tests/unitsAndAggregation.test.ts`.
3. **Rollout tensor indexing `(step, channel, row, col)` & Day 1 = `rollout[0]` mapping** (`src/utils/rolloutStore.ts`) — tested in `src/tests/rolloutStore.test.ts`.
4. **Grid orientation inference from `grid.lat` / `grid.lon`** (supporting both ascending and descending latitude/longitude without silent flipping) — tested in `src/tests/rolloutStore.test.ts` and `src/tests/icSchema.test.ts`.
5. **`cos(latitude)` area-weighted regional aggregation** (`src/utils/aggregation.ts`) — tested in `src/tests/unitsAndAggregation.test.ts`.
6. **Box and Gaussian `[6][32][36]` perturbation tensor construction** (`src/utils/shockBuilder.ts`) — tested for centring, radial symmetry, radius decay, cell alignment, orientation invariance, and exact outside-box zeros in `src/tests/shockBuilder.test.ts`.
7. **Scenario − Baseline difference & descriptive diagnostics** (`src/utils/labDiagnostics.ts`) — tested in `src/tests/labDiagnostics.test.ts`.
8. **Accumulated precipitation, heavy-rain day counts, dry-day counts, and heat-day counts** (`src/utils/impactMetrics.ts`) — tested in `src/tests/impactMetrics.test.ts`.
9. **Export traceability (CSV metadata comments & synthetic fixture watermarking)** (`src/utils/exportData.ts`) — tested in `src/tests/unitsAndAggregation.test.ts` and `src/tests/impactMetrics.test.ts`.

---

## 3. Limitations Visibility Audit

Visible limitations and interpretation boundaries were verified across all four analytical and reference routes:

- **`/lab` (`LabPage` / `LabIntegrityPanel`)**: Displays *"Descriptive diagnostics — not scientific validation"* and explicitly warns that counterfactual shocks are exploratory perturbations, not validated climate projections.
- **`/impact` (`ImpactPage`)**: Displays the dedicated **Scientific Limitations & Interpretation Boundaries** card stating 1° (~110 km) grid resolution, daily temporal averaging, experimental ML model nature, user-editable thresholds, and non-operational scope (no flood warnings, crop-yield forecasts, or economic damage claims).
- **`/model` (`ModelPage`)**: Displays **Known Limitations** and preserves `TO BE PROVIDED BY TEAM` for every unverified model fact.
- **`/method` (`MethodPage`)**: Displays **Limitations & Interpretation Boundaries** covering spatial/temporal resolution, descriptive diagnostics boundaries, and threshold interpretation limits.

---

## 4. Prohibited Claims Check

Confirmed **zero** instances in `src/` of:
- Fabricated accuracy, RMSE, ACC, skill scores, or benchmark rankings.
- Fabricated partner logos, user testimonials, or institutional endorsements.
- Claims of operational meteorological forecasting, flood advisories, crop-yield predictions, or economic/GDP loss calculations.
- Hidden synthetic fallbacks when the backend is unavailable or returns an error.
- AI/LLM API calls or prompt-generated climate explanations.
