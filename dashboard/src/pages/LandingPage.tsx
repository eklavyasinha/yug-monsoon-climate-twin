import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { CHANNELS, GRID_SPEC, PROJECT_FACTS } from '../config/projectFacts';
import { useAppData } from '../context/AppDataContext';
import { HeroAtmosphericSchematic } from '../components/HeroAtmosphericSchematic';
import { SyncFieldCanvas } from '../components/lab/SyncFieldCanvas';
import {
  computeVariableRange,
  createDashboardColorScale,
} from '../utils/colorScales';
import { getVariableGrid } from '../utils/rolloutStore';
import { toDisplayValue } from '../utils/units';

const OPERATIONAL_PIPELINE = [
  {
    step: '01',
    route: '/status',
    title: 'Verify backend readiness',
    detail:
      'Probe POST /health against your local FastAPI server and confirm model identity.',
  },
  {
    step: '02',
    route: '/status',
    title: 'Load initial conditions',
    detail:
      'Validate a local mom-ic-v1 JSON file ([3, 6, 32, 36]) strictly in browser memory.',
  },
  {
    step: '03',
    route: '/twin',
    title: 'Generate 10-day baseline forecast',
    detail:
      'Execute an unperturbed POST /simulate rollout across all six atmospheric variables.',
  },
  {
    step: '04',
    route: '/twin',
    title: 'Inspect spatial fields & lead days',
    detail:
      'Switch physical channels, scrub Days 1–10, overlay surface wind vectors, and compare Day A vs Day B.',
  },
  {
    step: '05',
    route: '/lab',
    title: 'Construct physical shock perturbations',
    detail:
      'Author Box or Gaussian [6, 32, 36] deltas over the Arabian Sea, Bay of Bengal, or land trough.',
  },
  {
    step: '06',
    route: '/lab',
    title: 'Compare Baseline, Scenario, and Difference',
    detail:
      'Inspect three synchronized maps on shared sequential and fixed symmetric diverging scales.',
  },
  {
    step: '07',
    route: '/impact',
    title: 'Quantify rainfall and heat thresholds',
    detail:
      'Compute cos(latitude)-weighted accumulations, heavy/dry day counts, and export PNG/CSV artifacts.',
  },
] as const;

const CHANNEL_SCALE_META: Record<
  string,
  { domainLabel: string; palette: string; gradient: string }
> = {
  t2m: {
    domainLabel: 'Thermal (°C)',
    palette: 'Cividis (sequential)',
    gradient: 'from-[#00204d] via-[#7c7b78] to-[#ffea46]',
  },
  tp: {
    domainLabel: 'Precipitation (log1p)',
    palette: 'Viridis (log1p)',
    gradient: 'from-[#440154] via-[#21918c] to-[#fde725]',
  },
  u10: {
    domainLabel: 'Zonal wind (m/s)',
    palette: 'Viridis (sequential)',
    gradient: 'from-[#440154] via-[#21918c] to-[#fde725]',
  },
  v10: {
    domainLabel: 'Meridional wind (m/s)',
    palette: 'Viridis (sequential)',
    gradient: 'from-[#440154] via-[#21918c] to-[#fde725]',
  },
  msl: {
    domainLabel: 'Pressure (hPa)',
    palette: 'Cividis (sequential)',
    gradient: 'from-[#00204d] via-[#7c7b78] to-[#ffea46]',
  },
  tcwv: {
    domainLabel: 'Column moisture (kg/m²)',
    palette: 'Viridis (sequential)',
    gradient: 'from-[#440154] via-[#21918c] to-[#fde725]',
  },
};

export function LandingPage() {
  const { loadedIc, baselineRun, lastHealth } = useAppData();

  // If the user has an actual real baseline rollout active in memory, show it live in the hero!
  const liveHeroPreview = useMemo(() => {
    if (
      !loadedIc ||
      !baselineRun ||
      loadedIc.isSyntheticFixture ||
      baselineRun.isSyntheticFixture
    ) {
      return null;
    }
    const rawGrid = getVariableGrid(baselineRun.packedRollout, 0, 't2m');
    const displayGrid = new Float32Array(rawGrid.length);
    for (let i = 0; i < rawGrid.length; i += 1) {
      displayGrid[i] = toDisplayValue('t2m', rawGrid[i]);
    }
    const domain = computeVariableRange(
      baselineRun.packedRollout,
      't2m',
      'fixed-run',
      0,
    );
    const colorScale = createDashboardColorScale('t2m', domain);
    return { displayGrid, colorScale };
  }, [loadedIc, baselineRun]);

  return (
    <div className="bg-[#060B14] text-[#E6EDF7]">
      {/* =================================================================== */}
      {/* HERO: Full-width Asymmetric Cartographic Split (No SaaS Cards/Blobs)*/}
      {/* =================================================================== */}
      <section className="hero-cartographic-field border-b border-[#1E2F4A]">
        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            {/* Left 5 cols: Editorial Authority + Action Architecture */}
            <div className="lg:col-span-5 flex flex-col justify-between gap-8">
              <div className="space-y-5">
                <p className="font-mono text-xs text-[#5CC8E0] tabular-nums">
                  India’s Climate Digital Twin · 1° Atmospheric Workstation
                </p>

                <h1 className="font-display text-3xl sm:text-[2.65rem] lg:text-[3.1rem] font-semibold tracking-[-0.025em] text-[#E6EDF7] leading-[1.06]">
                  Exploring India’s monsoon through a contract-checked digital
                  twin.
                </h1>

                <p className="text-[15px] leading-relaxed text-[#93A4BD] max-w-xl">
                  An offline-first atmospheric visualization and experimentation
                  workstation for 10-day Indian monsoon rollouts. Inspect
                  discrete 1° physical fields, inject Box or Gaussian shock
                  perturbations, and quantify regional rainfall and heat
                  shifts—driven directly by your connected climate backend.
                </p>
              </div>

              <div className="space-y-6">
                {/* Primary & Secondary CTAs */}
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    to="/twin"
                    className="inline-flex min-h-[46px] items-center gap-2.5 rounded-xs bg-[#5CC8E0] px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.06em] text-[#08101D] hover:bg-[#BFE6F2] transition-colors duration-150 whitespace-nowrap"
                  >
                    <span>Start Climate Forecast</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>

                  <Link
                    to="/lab"
                    className="inline-flex min-h-[46px] items-center gap-2 rounded-xs border border-[#2C4366] bg-[#08101D] px-5 py-2.5 font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#E6EDF7] hover:border-[#5CC8E0] hover:text-[#BFE6F2] transition-colors duration-150 whitespace-nowrap"
                  >
                    <span>Explore Experiments</span>
                  </Link>
                </div>

                {/* Secondary text navigation */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs text-[#93A4BD]">
                  <Link
                    to="/status"
                    className="text-[#BFE6F2] hover:text-[#5CC8E0] underline underline-offset-4 transition-colors"
                  >
                    Backend status &amp; IC loader
                  </Link>
                  <span aria-hidden="true" className="text-[#2C4366]">
                    /
                  </span>
                  <Link
                    to="/method"
                    className="hover:text-[#E6EDF7] underline underline-offset-4 transition-colors"
                  >
                    Wire contract &amp; methodology
                  </Link>
                  <span aria-hidden="true" className="text-[#2C4366]">
                    /
                  </span>
                  <Link
                    to="/model"
                    className="hover:text-[#E6EDF7] underline underline-offset-4 transition-colors"
                  >
                    Model record
                  </Link>
                </div>

                {/* Precision Hairline Spec Ledger */}
                <dl className="grid grid-cols-3 border-t border-[#1E2F4A] pt-5 font-mono tabular-nums">
                  <div className="pr-4">
                    <dt className="text-[11px] text-[#93A4BD]">Spatial grid</dt>
                    <dd className="mt-1 text-lg font-semibold text-[#E6EDF7]">
                      {GRID_SPEC.rows} × {GRID_SPEC.cols}
                      <span className="ml-1 text-xs font-normal text-[#5CC8E0]">
                        1°
                      </span>
                    </dd>
                  </div>
                  <div className="border-l border-[#1E2F4A] px-4">
                    <dt className="text-[11px] text-[#93A4BD]">State vector</dt>
                    <dd className="mt-1 text-lg font-semibold text-[#E6EDF7]">
                      {GRID_SPEC.channelCount}
                      <span className="ml-1 text-xs font-normal text-[#93A4BD]">
                        ch
                      </span>
                    </dd>
                  </div>
                  <div className="border-l border-[#1E2F4A] pl-4">
                    <dt className="text-[11px] text-[#93A4BD]">Lead horizon</dt>
                    <dd className="mt-1 text-lg font-semibold text-[#E6EDF7]">
                      1–{GRID_SPEC.maxForecastSteps}
                      <span className="ml-1 text-xs font-normal text-[#93A4BD]">
                        days
                      </span>
                    </dd>
                  </div>
                </dl>

                {/* Live session connection note */}
                <div className="border-t border-[#1E2F4A] pt-4 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-[#93A4BD] tabular-nums">
                  <span>
                    Model:{' '}
                    <span className="text-[#E6EDF7]">
                      {lastHealth?.modelName ??
                        PROJECT_FACTS.model.reportedModelName}
                    </span>
                  </span>
                  <span>
                    Session:{' '}
                    <span
                      className={
                        baselineRun && !baselineRun.isSyntheticFixture
                          ? 'text-[#5FC9A0]'
                          : 'text-[#BFE6F2]'
                      }
                    >
                      {baselineRun && !baselineRun.isSyntheticFixture
                        ? `Live ${baselineRun.steps}-day forecast active`
                        : 'Awaiting local mom-ic-v1'}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* Right 7 cols: Live Model Field (when active) OR Animated Conceptual India Monsoon Viewport */}
            <div className="lg:col-span-7">
              {liveHeroPreview && loadedIc && baselineRun ? (
                <div className="instrument-plane rounded-xs overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2F4A] bg-[#060B14] px-4 py-2.5 font-mono text-[11px]">
                    <span className="text-[#5FC9A0]">
                      ● Live Model Output · Day 1 2 m Temperature (°C)
                    </span>
                    <Link
                      to="/twin"
                      className="text-[#5CC8E0] hover:text-[#BFE6F2] underline underline-offset-4"
                    >
                      Open full Climate Twin workstation →
                    </Link>
                  </div>
                  <div className="p-3 bg-[#050A12]">
                    <SyncFieldCanvas
                      displayGrid={liveHeroPreview.displayGrid}
                      lat={loadedIc.data.grid.lat}
                      lon={loadedIc.data.grid.lon}
                      landSeaMask={loadedIc.data.static?.land_sea_mask}
                      colorScale={liveHeroPreview.colorScale}
                      unitLabel="°C"
                      decimals={1}
                      title={`Active baseline rollout · ${loadedIc.summary.label}`}
                      ariaLabel="Live Day 1 2-metre temperature forecast field from your connected backend"
                      testId="hero-live-forecast-canvas"
                    />
                  </div>
                </div>
              ) : (
                <HeroAtmosphericSchematic />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 01 · WORKSPACE ARCHITECTURE — Hairline Horizontal Dossier (No Cards)*/}
      {/* =================================================================== */}
      <section className="border-b border-[#1E2F4A]">
        <div className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 pb-8 border-b border-[#1E2F4A]">
            <div className="lg:col-span-5">
              <p className="font-mono text-xs text-[#5CC8E0]">
                01. Operational workspaces
              </p>
              <h2 className="mt-2 font-sans text-2xl sm:text-3xl font-semibold tracking-[-0.02em] text-[#E6EDF7]">
                Three purpose-built interfaces over one shared atmospheric state
              </h2>
            </div>
            <div className="lg:col-span-7 flex items-end">
              <p className="text-sm leading-relaxed text-[#93A4BD] max-w-2xl">
                Every workspace reads directly from the validated{' '}
                <code className="text-[#BFE6F2]">mom-ic-v1</code> state in
                browser memory and strict{' '}
                <code className="text-[#BFE6F2]">[steps, 6, 32, 36]</code>{' '}
                responses from your connected climate server—sharing region
                selections, forecast day, and variable state seamlessly.
              </p>
            </div>
          </div>

          <div className="divide-y divide-[#1E2F4A]">
            {/* Row 01: Climate Twin */}
            <article className="py-8 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-2 font-mono text-xs space-y-1">
                <p className="text-[#5CC8E0] font-semibold">01 / TWIN</p>
                <p className="text-[#93A4BD]">/twin</p>
              </div>
              <div className="lg:col-span-6 space-y-2">
                <h3 className="font-sans text-xl font-semibold tracking-tight text-[#E6EDF7]">
                  Climate Twin Forecast Workstation
                </h3>
                <p className="text-sm leading-relaxed text-[#93A4BD]">
                  Dominated by an interactive 32 × 36 India climate grid with
                  discrete 1° cell inspection, surface wind-vector overlays,
                  Days 1–10 playback scrubbing, Day A minus Day B spatial
                  differencing, cos(latitude)-weighted regional evolution
                  charts, and PNG/CSV export.
                </p>
              </div>
              <div className="lg:col-span-2 font-mono text-[11px] text-[#93A4BD] space-y-1 tabular-nums">
                <p className="text-[#E6EDF7]">7 derived &amp; raw fields</p>
                <p>Fixed-run &amp; per-day scales</p>
              </div>
              <div className="lg:col-span-2 flex lg:justify-end">
                <Link
                  to="/twin"
                  className="inline-flex min-h-[42px] items-center gap-1.5 border border-[#2C4366] bg-[#08101D] px-4 py-2 font-mono text-xs text-[#E6EDF7] hover:border-[#5CC8E0] hover:text-[#BFE6F2] transition-colors whitespace-nowrap"
                >
                  <span>Open Twin</span>
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </article>

            {/* Row 02: Experiment Lab */}
            <article className="py-8 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-2 font-mono text-xs space-y-1">
                <p className="text-[#F2A93B] font-semibold">02 / LAB</p>
                <p className="text-[#93A4BD]">/lab</p>
              </div>
              <div className="lg:col-span-6 space-y-2">
                <h3 className="font-sans text-xl font-semibold tracking-tight text-[#E6EDF7]">
                  Experiment Lab &amp; Live Shock Builder
                </h3>
                <p className="text-sm leading-relaxed text-[#93A4BD]">
                  Construct bounded physical perturbations across one or more
                  channels using Lat/Lon Box or smooth cosine-corrected Gaussian
                  footprints. Run sequential Baseline and Scenario rollouts and
                  inspect synchronized Baseline, Scenario, and fixed symmetric
                  RdBu Difference maps side by side.
                </p>
              </div>
              <div className="lg:col-span-2 font-mono text-[11px] text-[#93A4BD] space-y-1 tabular-nums">
                <p className="text-[#E6EDF7]">[6, 32, 36] tensor delta</p>
                <p>JSON import/export ≤ 1 MB</p>
              </div>
              <div className="lg:col-span-2 flex lg:justify-end">
                <Link
                  to="/lab"
                  className="inline-flex min-h-[42px] items-center gap-1.5 border border-[#2C4366] bg-[#08101D] px-4 py-2 font-mono text-xs text-[#E6EDF7] hover:border-[#5CC8E0] hover:text-[#BFE6F2] transition-colors whitespace-nowrap"
                >
                  <span>Open Lab</span>
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </article>

            {/* Row 03: Impact Lens */}
            <article className="py-8 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-2 font-mono text-xs space-y-1">
                <p className="text-[#5FC9A0] font-semibold">03 / IMPACT</p>
                <p className="text-[#93A4BD]">/impact</p>
              </div>
              <div className="lg:col-span-6 space-y-2">
                <h3 className="font-sans text-xl font-semibold tracking-tight text-[#E6EDF7]">
                  Impact Lens — Rainfall &amp; Heat Threshold Analytics
                </h3>
                <p className="text-sm leading-relaxed text-[#93A4BD]">
                  Aggregate actual multi-day rollouts into accumulated
                  precipitation maps, editable heavy-rain and dry-day counts,
                  optional heat threshold maps, daily regional rainfall charts,
                  and CSV/PNG impact reports with explicit 1° grid caveats.
                </p>
              </div>
              <div className="lg:col-span-2 font-mono text-[11px] text-[#93A4BD] space-y-1 tabular-nums">
                <p className="text-[#E6EDF7]">Editable mm/d &amp; °C rules</p>
                <p>Baseline vs Scenario Δ</p>
              </div>
              <div className="lg:col-span-2 flex lg:justify-end">
                <Link
                  to="/impact"
                  className="inline-flex min-h-[42px] items-center gap-1.5 border border-[#2C4366] bg-[#08101D] px-4 py-2 font-mono text-xs text-[#E6EDF7] hover:border-[#5CC8E0] hover:text-[#BFE6F2] transition-colors whitespace-nowrap"
                >
                  <span>Open Impact</span>
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 02 · SCIENTIFIC WORKFLOW LEDGER + 03 · STATE VECTOR SPECIFICATION   */}
      {/* =================================================================== */}
      <section className="border-b border-[#1E2F4A] bg-[#08101D]">
        <div className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
            {/* Left 5 cols: Guided Workflow Ledger */}
            <div className="lg:col-span-5 space-y-6">
              <div className="space-y-2">
                <p className="font-mono text-xs text-[#5CC8E0]">
                  02. Forecast &amp; experiment pipeline
                </p>
                <h2 className="font-sans text-2xl font-semibold tracking-[-0.02em] text-[#E6EDF7]">
                  From local initial conditions to regional impact export
                </h2>
                <p className="text-sm leading-relaxed text-[#93A4BD]">
                  Zero hidden fallbacks or synthetic demos. Every step runs
                  strictly against validated local initial conditions and live
                  backend responses.
                </p>
              </div>

              <ol className="divide-y divide-[#1E2F4A] border-y border-[#1E2F4A]">
                {OPERATIONAL_PIPELINE.map((item) => (
                  <li key={item.step}>
                    <Link
                      to={item.route}
                      className="group flex items-start gap-4 py-3.5 hover:bg-[#0E1829] px-2 -mx-2 transition-colors"
                    >
                      <span className="font-mono text-xs font-semibold text-[#5CC8E0] tabular-nums pt-0.5 shrink-0">
                        {item.step}
                      </span>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-[#E6EDF7] group-hover:text-[#BFE6F2]">
                            {item.title}
                          </span>
                          <span className="font-mono text-[11px] text-[#93A4BD] shrink-0">
                            {item.route}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-[#93A4BD]">
                          {item.detail}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>

            {/* Right 7 cols: Precision 6-Channel Physical State Vector Table */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="space-y-2">
                  <p className="font-mono text-xs text-[#5CC8E0]">
                    03. Wire contract state vector
                  </p>
                  <h2 className="font-sans text-2xl font-semibold tracking-[-0.02em] text-[#E6EDF7]">
                    Six physical atmospheric variables
                  </h2>
                </div>
                <Link
                  to="/method"
                  className="font-mono text-xs text-[#BFE6F2] hover:text-[#5CC8E0] underline underline-offset-4"
                >
                  Full wire contract →
                </Link>
              </div>

              <div className="overflow-x-auto border border-[#1E2F4A] bg-[#060B14]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E2F4A] bg-[#0E1829] font-mono text-[11px] text-[#93A4BD]">
                      <th className="px-3.5 py-2.5 font-medium">Idx</th>
                      <th className="px-3.5 py-2.5 font-medium">Channel</th>
                      <th className="px-3.5 py-2.5 font-medium">Variable</th>
                      <th className="px-3.5 py-2.5 font-medium">Wire unit</th>
                      <th className="px-3.5 py-2.5 font-medium">
                        Scientific colour scale
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2F4A]/80 text-xs">
                    {CHANNELS.map((ch) => {
                      const scaleMeta = CHANNEL_SCALE_META[ch.key];
                      return (
                        <tr key={ch.key} className="align-top">
                          <td className="px-3.5 py-3 font-mono text-[#93A4BD] tabular-nums">
                            [{ch.index}]
                          </td>
                          <td className="px-3.5 py-3 font-mono font-semibold text-[#5CC8E0]">
                            {ch.key}
                          </td>
                          <td className="px-3.5 py-3 space-y-1">
                            <p className="font-medium text-[#E6EDF7]">
                              {ch.name}
                            </p>
                            <p className="text-[11px] leading-relaxed text-[#93A4BD] max-w-sm">
                              {ch.description}
                            </p>
                          </td>
                          <td className="px-3.5 py-3 font-mono text-[#BFE6F2] whitespace-nowrap">
                            {ch.unit}
                          </td>
                          <td className="px-3.5 py-3 min-w-[148px]">
                            <div
                              aria-hidden="true"
                              className={`h-2 w-full bg-gradient-to-r ${scaleMeta?.gradient ?? 'from-[#0e2a47] to-[#5cc8e0]'}`}
                            />
                            <p className="mt-1.5 font-mono text-[10px] text-[#93A4BD]">
                              {scaleMeta?.palette} · {scaleMeta?.domainLabel}
                            </p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="font-mono text-[11px] text-[#93A4BD] leading-relaxed">
                Inputs (<code className="text-[#BFE6F2]">[3, 6, 32, 36]</code>)
                and returned rollouts (
                <code className="text-[#BFE6F2]">[steps, 6, 32, 36]</code>)
                stay in raw physical units over HTTP. Internal normalisation and
                static surface channels (
                <code className="text-[#BFE6F2]">land_sea_mask</code>,{' '}
                <code className="text-[#BFE6F2]">orography_m</code>) remain
                inside the FastAPI server. Spatial difference fields (Day B −
                Day A and Scenario − Baseline) render on a zero-centred{' '}
                <code className="text-[#BFE6F2]">RdBu</code> diverging palette.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 04 · SCIENTIFIC TRANSPARENCY, MODEL RECORD & BOUNDARIES             */}
      {/* =================================================================== */}
      <section>
        <div className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5 space-y-4">
              <p className="font-mono text-xs text-[#F2A93B]">
                04. Scientific boundaries &amp; provenance
              </p>
              <h2 className="font-sans text-2xl sm:text-3xl font-semibold tracking-[-0.02em] text-[#E6EDF7]">
                Built for physical inspection, never fabricated projections
              </h2>
              <p className="text-sm leading-relaxed text-[#93A4BD]">
                Controlled perturbation experiments probe whether a learned
                monsoon emulator responds coherently and locally when thermal or
                wind states change. Unprovided benchmark scores, training
                details, and attribution fields remain explicitly marked{' '}
                <code className="text-[#F2A93B]">TO BE PROVIDED BY TEAM</code>{' '}
                on{' '}
                <Link
                  to="/model"
                  className="text-[#5CC8E0] underline hover:text-[#BFE6F2]"
                >
                  Model
                </Link>{' '}
                and{' '}
                <Link
                  to="/about"
                  className="text-[#5CC8E0] underline hover:text-[#BFE6F2]"
                >
                  About
                </Link>
                .
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <Link
                  to="/status"
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-xs bg-[#5CC8E0] px-4 py-2 font-mono text-xs font-semibold text-[#08101D] hover:bg-[#BFE6F2] transition-colors whitespace-nowrap"
                >
                  <span>Verify Backend &amp; Load IC</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
                <Link
                  to="/about"
                  className="inline-flex min-h-[42px] items-center rounded-xs border border-[#2C4366] bg-[#08101D] px-4 py-2 font-mono text-xs text-[#E6EDF7] hover:border-[#5CC8E0] transition-colors whitespace-nowrap"
                >
                  Project Provenance
                </Link>
              </div>
            </div>

            <div className="lg:col-span-7">
              <ul className="divide-y divide-[#1E2F4A] border-y border-[#1E2F4A]">
                {PROJECT_FACTS.limitations.structuralLimitations.map(
                  (limitation, idx) => (
                    <li
                      key={limitation}
                      className="flex items-start gap-4 py-3.5 text-sm leading-relaxed text-[#E6EDF7]"
                    >
                      <span className="font-mono text-xs text-[#F2A93B] tabular-nums pt-0.5 shrink-0">
                        0{idx + 1}
                      </span>
                      <span>{limitation}</span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
