# 5-Minute Live Desk-Review Demo Script — Multiverse of Monsoon

This script guides a concise, reproducible 5-minute demonstration of the **Multiverse of Monsoon** frontend connected to a local FastAPI backend (`serve.py`) and a real `mom-ic-v1` initial-conditions file.

**Ground rules during the demo**:
- Every forecast field shown must come from a live `POST /simulate` call on your local backend.
- Never present the hero schematic or any synthetic fixture as model output.
- Always distinguish backend model inference time (`inference_ms`) from browser round-trip time (`roundTripMs`).

---

## Pre-Demo Checklist (2 Minutes Before Judges Arrive)

- [ ] Local FastAPI backend (`serve.py`) running on `http://localhost:8000` (check `curl -X POST http://localhost:8000/health`).
- [ ] Frontend running locally (`npm run dev` on `http://localhost:3000`, or `npm run preview` on `http://localhost:4173`) with `VITE_ENABLE_FIXTURE=false` (default).
- [ ] At least one validated real `mom-ic-v1` file (`*.ic.json`) ready in `local-data/` (outside git).
- [ ] Optional: one exported shock config JSON ready in `local-data/` to demonstrate JSON import.

---

## 13-Step Live Demonstration (~5 Minutes)

1. **Open Landing Page (`/`) — 25 s**
   - Introduce **Multiverse of Monsoon — India's Climate Digital Twin** on the 32 × 36 (1°) grid with 6 physical variables.
   - Point out the conceptual hero schematic label (*"Conceptual schematic. Not model output."*) and the transparent scientific scope section.

2. **Open Backend Status & Contract Verification (`/status`) — 30 s**
   - Click **Run health check** (`POST /health`). Show live `ready` status, `model_name`, and latency.
   - Point out that `/api` proxies cleanly to `http://localhost:8000` with zero external API keys or LLM calls.

3. **Load Real `mom-ic-v1` File (`/status`) — 25 s**
   - Drag and drop your real `*.ic.json` file into the dropzone.
   - Highlight client-side Zod validation: exact shape `[3, 6, 32, 36]`, finite floats, detected latitude/longitude orientation, and optional land/sea mask.

4. **Run 1-Step Contract Check (`/status`) — 20 s**
   - Click **Run contract test** (`steps: 1`, `perturbation: null`).
   - Show exact verified response shape `[1, 6, 32, 36]`, zero `NaN`/`Inf`, and separate backend `inference_ms` vs frontend `roundTripMs`.

5. **Open Climate Twin Dashboard (`/twin`) & Run 10-Day Baseline — 35 s**
   - Navigate to `/twin` and click **Run 10-day baseline simulation**.
   - Emphasize that baseline runs with `perturbation: null` and caches in memory per IC file and step count.

6. **Inspect Discrete Atmospheric Fields & Hover Readout (`/twin`) — 30 s**
   - Hover across grid cells to show exact cell coordinates, raw physical units preserved in `Float32Array`, and display conversions (°C, hPa) with zero lag.
   - Toggle **Wind Vectors** (`u10`, `v10`) and note the documented *"direction toward which wind blows"* convention.

7. **Explore Lead Days, Region Box & Daily Time Series (`/twin`) — 25 s**
   - Step through Days 1–10 (confirming `rollout[0]` = Day 1), switch variables (`tp`, `t2m`, `tcwv`, `msl`, wind speed), and select a region preset (e.g., *Bay of Bengal* or *Monsoon Core Zone*) to show `cos(latitude)`-weighted daily summaries.
   - Mention direct browser PNG and CSV export buttons.

8. **Open Counterfactual Experiment Lab (`/lab`) — 25 s**
   - Navigate to `/lab`. Point out the pre-loaded cached baseline and the 3 built-in physical shock presets (e.g., *Bay of Bengal Warm & Moist*, *Arabian Sea Weakened Winds*, *Indo-Gangetic Pre-Heat*).

9. **Build a Live Perturbation with the Shock Builder (`/lab`) — 35 s**
   - Switch to **Gaussian** footprint (or adjust **Box** coordinates), pick a channel (`t2m` or `tcwv`), set centre lat/lon, radius in degrees, and peak delta in physical units.
   - Show the live `[6, 32, 36]` perturbation preview map updating in real time and note JSON import/export support.

10. **Run Sequential Baseline vs Scenario Comparison (`/lab`) — 35 s**
    - Click **Run Baseline + Scenario** (or **Run Scenario** if baseline is already cached).
    - Point out sequential execution so backend `inference_ms` is measured accurately without CPU contention.

11. **Inspect Synchronized 3-Map Comparison & Descriptive Diagnostics (`/lab`) — 30 s**
    - Zoom/pan one map and show all three maps (**Baseline**, **Scenario**, **Difference = Scenario − Baseline**) moving in sync with shared Baseline/Scenario scale and symmetric RdBu diverging delta scale.
    - Highlight the **Descriptive diagnostics — not scientific validation** panel (no NaN/Inf, plausible ranges, nonzero response, Day 1 localization, blow-up check).

12. **Open Impact Lens (`/impact`) — 35 s**
    - Navigate to `/impact`. Show the 10-day accumulated rainfall maps (Baseline, Scenario, Rainfall Change), regional summary table, and daily rainfall chart.
    - Edit a user-defined threshold (e.g., heavy-rain `mm/day` or optional heat `°C`) live to show instant deterministic recomputation strictly from the actual rollout.
    - Point out the explicit **Scientific Limitations & Interpretation Boundaries** card.

13. **Close on Model & Methodology Transparency (`/model`, `/method`) — 15 s**
    - Briefly note `/model` and `/method`, where unmeasured facts remain transparently marked `TO BE PROVIDED BY TEAM` and all limitations are documented.

---

## Honest Non-Synthetic Fallbacks (If Issues Occur During Demo)

Never fall back to fabricated or synthetic numbers during a judge demo. Use these honest operational fallbacks instead:

1. **Backend unreachable (`ERR_CONNECTION_REFUSED` or timeout)**:
   - Open `/status`, show the explicit classified connection error banner (proving no silent fake data is rendered), verify `serve.py` is running in your terminal, or switch the URL override between `/api` and `http://localhost:8000`.
2. **10-step CPU inference slower than expected (> 15–30 s)**:
   - Cancel the in-flight request cleanly with **Cancel simulation** (demonstrating `AbortController` support), run a **1-step** check on `/status` or `/twin` to prove live model connectivity, or reduce steps to `3–5` days in `/lab` if needed while stating the exact step count shown.
3. **CORS error when pointing directly to `http://localhost:8000`**:
   - Switch the `/status` API base URL override back to `/api` so requests route through the Vite same-origin proxy (`VITE_API_PROXY_TARGET=http://localhost:8000`).
4. **Invalid or corrupted `mom-ic-v1` file selected by mistake**:
   - Point out the structured Zod validation error list (shape, monotonicity, finite numbers, 5 MB limit) as a feature demonstrating data integrity, then load your verified backup `*.ic.json` from `local-data/`.
5. **Projector / small screen or reduced-motion laptop settings**:
   - Use the step buttons (`<` / `>`) and day slider instead of timed playback (which automatically respects `prefers-reduced-motion: reduce`), and use the accessible data tables beneath charts for crisp numeric readouts.
