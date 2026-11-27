# Project Brief — Page 2 Draft: Interactive Digital Twin, Counterfactual Lab & Impact Lens

> **Draft note**: This Page 2 brief describes **only** the visualization, experimentation, and impact-analysis capabilities implemented in the frontend (`dashboard/`). Unverified model benchmarks, training datasets, and team metadata are marked `TO BE PROVIDED BY TEAM` so the team can fill them in from measured experiment logs.

---

## Interactive Climate Twin & Scientific Visualisation

**Multiverse of Monsoon** pairs the team's autoregressive atmospheric forecasting model (`WeatherNet-Rollout-Baseline`, serving `POST /health` and `POST /simulate` over a 32 × 36, 1° Indian subcontinent grid) with an offline-first, contract-checked scientific dashboard:

- **Contract-Verified Initial Conditions & Rollouts (`/status`, `/twin`)**: Users load local `mom-ic-v1` initial-condition files (`[3, 6, 32, 36]` in raw physical units), which are validated client-side for exact tensor dimensions, finite floats, channel order (`t2m`, `tp`, `u10`, `v10`, `msl`, `tcwv`), and axis orientation before calling `POST /simulate`. Returned rollouts (`[steps, 6, 32, 36]`) are stored verbatim in `Float32Array` without silent clipping or smoothing; unit conversions (`K → °C`, `Pa → hPa`) occur strictly at display time.
- **Discrete Grid Inspection & Regional Aggregation (`/twin`)**: Each 1° cell is rendered distinctly on an HTML5 Canvas with colourblind-safe scientific palettes (Perceptual sequential scales for state variables, symmetric RdBu diverging scale for anomalies), optional `u10`/`v10` wind-vector overlays (using the explicit *"direction toward which wind blows"* convention), `cos(latitude)`-weighted regional time series across predefined Indian monsoon sub-regions or custom latitude/longitude boxes, same-run Day A vs Day B comparisons, and client-side PNG/CSV exports.
- **Live Counterfactual Experiment Lab (`/lab`)**: Reviewers can design new physical perturbations during a live session using either rectangular **Box** or radially smooth **Gaussian** footprints across one or multiple channels, inspect the `[6, 32, 36]` perturbation preview map, import/export shock configurations as validated JSON (≤ 1 MB), and run sequential Baseline (`perturbation: null`) vs Scenario rollouts. Synchronized 3-map canvases (Baseline, Scenario, and Scenario − Baseline) link zoom/pan interactions alongside a **Descriptive Diagnostics** panel checking finiteness, physical plausibility bounds, Day 1 localization, and numerical stability.
- **Descriptive Impact Lens (`/impact`)**: Strictly from actual backend rollouts (synthetic fixtures are blocked), the Impact Lens computes multi-day accumulated precipitation (`mm`), regional rainfall change maps, daily regional rainfall sequences, user-editable heavy-rain (`mm/day`) and dry-day (`mm/day`) exceedance counts, and optional near-surface heat-day (`°C`) counts, with regional summary tables and CSV/PNG export.

---

## Performance, Verification & Team Metrics

| Item | Value / Status |
|---|---|
| Target domain & variables | `32 × 36` (1° grid, 6.5–37.5°N, 65.5–100.5°E), 6 channels (`t2m`, `tp`, `u10`, `v10`, `msl`, `tcwv`), 1–10 day horizon |
| Measured 10-step CPU inference time (`inference_ms`) | `TO BE PROVIDED BY TEAM` (measured live by `serve.py` on target hardware) |
| Model architecture & parameter count | `TO BE PROVIDED BY TEAM` |
| Training & validation data split | `TO BE PROVIDED BY TEAM` |
| Round 1 forecast skill metrics (RMSE / ACC / Precipitation CSI) | `TO BE PROVIDED BY TEAM` |
| Benchmark shock experiment findings (S1 / S2 / S3) | `TO BE PROVIDED BY TEAM` |
| Team members & affiliation | `TO BE PROVIDED BY TEAM` |

---

## Scope & Interpretation Boundaries

- **Coarse 1° (~110 km) grid & daily output**: Suitable for synoptic-scale exploratory visualisation; does not resolve local weather stations, urban microclimates, or sub-daily flash-flood extremes.
- **Experimental ML rollout & exploratory shocks**: Counterfactual perturbations probe model sensitivity and are **not** validated climate projections or causal proof.
- **Descriptive thresholds only**: Impact Lens metrics reflect user-editable numerical thresholds applied to experimental model output and must **not** be interpreted as operational weather warnings, flood advisories, crop-yield forecasts, or economic damage estimates.
