import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { getApiErrorTitle } from '../api/errors';
import { ContractGridPreviewCanvas } from '../components/ContractGridPreviewCanvas';
import { IcFileDropzone } from '../components/IcFileDropzone';
import { WorkflowGuideStrip } from '../components/WorkflowGuideStrip';
const DailyRainfallChart = lazy(() =>
  import('../components/impact/DailyRainfallChart').then((m) => ({
    default: m.DailyRainfallChart,
  })),
);
import {
  clampSyncTransform,
  SyncFieldCanvas,
  type SyncFieldCanvasHandle,
  type SyncViewTransform,
} from '../components/lab/SyncFieldCanvas';
import { RegionSelector } from '../components/twin/RegionSelector';
import { useAppData } from '../context/AppDataContext';
import { PRESET_REGIONS } from '../utils/aggregation';
import {
  createDashboardColorScale,
  createDivergingDifferenceScale,
} from '../utils/colorScales';
import { triggerClientFileDownload } from '../utils/exportData';
import {
  formatCalendarDate,
  formatForecastWindow,
} from '../utils/forecastDates';
import {
  buildImpactMetricsCsv,
  computeHeatImpact,
  computeRainfallImpact,
  DEFAULT_IMPACT_THRESHOLDS,
} from '../utils/impactMetrics';

function gridMax(grid: Float32Array): number {
  let m = 0;
  for (let i = 0; i < grid.length; i += 1) {
    if (Number.isFinite(grid[i]) && grid[i] > m) m = grid[i];
  }
  return m;
}

function gridMaxAbs(grid: Float32Array): number {
  let m = 0;
  for (let i = 0; i < grid.length; i += 1) {
    const a = Math.abs(grid[i]);
    if (Number.isFinite(a) && a > m) m = a;
  }
  return m;
}

export function ImpactPage() {
  const {
    apiConfig,
    loadedIc,
    lastHealth,
    baselineRun,
    scenarioRun,
    simulationStatus,
    simulationError,
    selectedRegion,
    setSelectedRegion,
    runBaselineSimulation,
    clearSyntheticFixture,
  } = useAppData();

  const baselineRainMapRef = useRef<SyncFieldCanvasHandle | null>(null);
  const diffRainMapRef = useRef<SyncFieldCanvasHandle | null>(null);
  const heatMapRef = useRef<SyncFieldCanvasHandle | null>(null);

  const [heavyRainStr, setHeavyRainStr] = useState(
    String(DEFAULT_IMPACT_THRESHOLDS.heavyRainMmDay),
  );
  const [dryDayStr, setDryDayStr] = useState(
    String(DEFAULT_IMPACT_THRESHOLDS.dryDayMmDay),
  );
  const [heatTempStr, setHeatTempStr] = useState(
    String(DEFAULT_IMPACT_THRESHOLDS.heatTempC),
  );
  const [showHeatSection, setShowHeatSection] = useState(true);
  const [syncTransform, setSyncTransform] = useState<SyncViewTransform>({
    zoom: 1,
    panX: 0,
    panY: 0,
  });
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const isRunning =
    simulationStatus === 'connecting' || simulationStatus === 'loading';
  const isSyntheticFixture = Boolean(
    loadedIc?.isSyntheticFixture ||
      baselineRun?.isSyntheticFixture ||
      scenarioRun?.isSyntheticFixture,
  );

  const thresholds = useMemo(() => {
    const heavy = Number(heavyRainStr);
    const dry = Number(dryDayStr);
    const heat = Number(heatTempStr);
    return {
      heavyRainMmDay: Number.isFinite(heavy) && heavy >= 0 ? heavy : 10,
      dryDayMmDay: Number.isFinite(dry) && dry >= 0 ? dry : 1,
      heatTempC: Number.isFinite(heat) ? heat : 35,
    };
  }, [heavyRainStr, dryDayStr, heatTempStr]);

  const actualBaseline =
    baselineRun && !baselineRun.isSyntheticFixture ? baselineRun : null;
  const actualScenario =
    scenarioRun && !scenarioRun.isSyntheticFixture ? scenarioRun : null;
  const initDateIso = loadedIc?.summary.initDateIso ?? null;
  const forecastWindowLabel = formatForecastWindow(
    initDateIso,
    actualBaseline?.steps ?? 10,
  );

  const rainfall = useMemo(() => {
    if (!actualBaseline || !loadedIc || isSyntheticFixture) return null;
    return computeRainfallImpact(
      actualBaseline.packedRollout,
      actualScenario?.packedRollout ?? null,
      loadedIc.data.grid.lat,
      loadedIc.data.grid.lon,
      selectedRegion,
      thresholds.heavyRainMmDay,
      thresholds.dryDayMmDay,
    );
  }, [
    actualBaseline,
    actualScenario,
    loadedIc,
    isSyntheticFixture,
    selectedRegion,
    thresholds.heavyRainMmDay,
    thresholds.dryDayMmDay,
  ]);

  const heat = useMemo(() => {
    if (!actualBaseline || !loadedIc || isSyntheticFixture) return null;
    return computeHeatImpact(
      actualBaseline.packedRollout,
      actualScenario?.packedRollout ?? null,
      loadedIc.data.grid.lat,
      loadedIc.data.grid.lon,
      selectedRegion,
      thresholds.heatTempC,
    );
  }, [
    actualBaseline,
    actualScenario,
    loadedIc,
    isSyntheticFixture,
    selectedRegion,
    thresholds.heatTempC,
  ]);

  const rainScales = useMemo(() => {
    if (!rainfall) return null;
    const maxAccum = Math.max(
      gridMax(rainfall.baselineAccumulatedGrid),
      rainfall.scenarioAccumulatedGrid
        ? gridMax(rainfall.scenarioAccumulatedGrid)
        : 0,
      1,
    );
    const accumScale = createDashboardColorScale('tp', [0, maxAccum]);
    const diffLimit = rainfall.diffAccumulatedGrid
      ? Math.max(gridMaxAbs(rainfall.diffAccumulatedGrid), 1)
      : 1;
    const diffScale = createDivergingDifferenceScale([-diffLimit, diffLimit]);
    return { accumScale, diffScale, diffLimit };
  }, [rainfall]);

  const heatScales = useMemo(() => {
    if (!heat) return null;
    const daysScale = createDashboardColorScale('t2m', [
      0,
      Math.max(heat.steps, 1),
    ]);
    const diffLimit = heat.diffHotDaysGrid
      ? Math.max(gridMaxAbs(heat.diffHotDaysGrid), 1)
      : 1;
    const diffScale = createDivergingDifferenceScale([-diffLimit, diffLimit]);
    return { daysScale, diffScale, diffLimit };
  }, [heat]);

  const gridExtents = useMemo(() => {
    if (!loadedIc) {
      return { latMin: 6.5, latMax: 37.5, lonMin: 65.5, lonMax: 100.5 };
    }
    const { lat, lon } = loadedIc.data.grid;
    return {
      latMin: Math.min(...lat),
      latMax: Math.max(...lat),
      lonMin: Math.min(...lon),
      lonMax: Math.max(...lon),
    };
  }, [loadedIc]);

  const handleExportCsv = () => {
    if (
      !rainfall ||
      !heat ||
      !actualBaseline ||
      !loadedIc ||
      isSyntheticFixture
    ) {
      return;
    }
    const csv = buildImpactMetricsCsv(rainfall, heat, {
      region: selectedRegion,
      thresholds,
      icLabel: loadedIc.summary.label,
      initDateIso,
      modelName: actualBaseline.modelName,
      scenarioLabel: actualScenario?.scenarioLabel ?? null,
      baselineInferenceMs: actualBaseline.inferenceMs,
      scenarioInferenceMs: actualScenario?.inferenceMs ?? null,
    });
    triggerClientFileDownload(
      csv,
      `monsoon-impact-region-metrics.csv`,
      'text/csv;charset=utf-8',
    );
    setExportNotice(
      'Exported regional impact metrics CSV directly in browser.',
    );
  };

  const handleExportCurrentMapPng = () => {
    if (!actualBaseline || !loadedIc || isSyntheticFixture) return;
    const handle = actualScenario
      ? diffRainMapRef.current ?? baselineRainMapRef.current
      : baselineRainMapRef.current;
    if (!handle) return;
    const windowPart = forecastWindowLabel ? ` (${forecastWindowLabel})` : '';
    const title = actualScenario
      ? `Accumulated Rainfall Change (Scenario − Baseline) · ${rainfall?.steps ?? 10} Days${windowPart}`
      : `Accumulated Rainfall (Baseline) · ${rainfall?.steps ?? 10} Days${windowPart}`;
    const initPart = initDateIso
      ? `Init: ${formatCalendarDate(initDateIso, 'long')} (${initDateIso})`
      : 'Init date: Not in IC metadata';
    const dataUrl = handle.exportPngDataUrl({
      title,
      subtitle: `Region: ${selectedRegion.label} · IC: ${loadedIc.summary.label} · ${initPart} · Descriptive calculation (not validated impact forecast)`,
    });
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = actualScenario
      ? 'monsoon-impact-rainfall-change.png'
      : 'monsoon-impact-accumulated-rainfall.png';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setExportNotice('Exported current impact map PNG directly in browser.');
  };

  // STATE 1: No initial-conditions file loaded — full-width 2-pane analytics initialization
  if (!loadedIc) {
    return (
      <div className="workstation-canvas">
        <WorkflowGuideStrip currentRoute="/impact" />

        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 space-y-6">
          <header className="flex flex-col gap-2 border-b border-[#1E2F4A] pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#5CC8E0]">
                Impact Analytics Console · /impact · Rainfall &amp; Heat Thresholds
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-[#E6EDF7]">
                Impact Lens — Monsoon Rainfall &amp; Heat Thresholds
              </h1>
            </div>
            <p className="max-w-xl text-sm text-[#93A4BD]">
              Compute accumulated precipitation, editable heavy-rain and dry-day
              counts, and optional temperature threshold counts strictly from
              actual backend rollouts.
            </p>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-12 border border-[#1E2F4A] bg-[#08101D] divide-y lg:divide-y-0 lg:divide-x divide-[#1E2F4A]">
            <div className="lg:col-span-5 divide-y divide-[#1E2F4A]">
              <section
                aria-labelledby="impact-empty-heading"
                className="p-5 sm:p-6 space-y-4"
              >
                <div className="space-y-2">
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#F2A93B]">
                    Live model input required
                  </p>
                  <h2
                    id="impact-empty-heading"
                    className="text-lg font-semibold text-[#E6EDF7]"
                  >
                    Connected backend and validated initial conditions required
                  </h2>
                  <p className="text-sm leading-relaxed text-[#93A4BD]">
                    No rainfall accumulations or threshold counts are fabricated.
                    Load a validated{' '}
                    <code className="font-mono text-[#BFE6F2]">mom-ic-v1</code>{' '}
                    file and run an actual simulation against{' '}
                    <code className="font-mono text-[#BFE6F2]">
                      {apiConfig.activeBaseUrl}
                    </code>
                    .
                  </p>
                </div>

                <dl className="divide-y divide-[#1E2F4A] border-y border-[#1E2F4A] font-mono text-xs">
                  <div className="flex items-baseline justify-between gap-2 py-2.5">
                    <dt className="text-[#93A4BD]">Configured backend</dt>
                    <dd className="text-[#E6EDF7] truncate">
                      {apiConfig.activeBaseUrl}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 py-2.5">
                    <dt className="text-[#93A4BD]">Health check</dt>
                    <dd className="text-[#93A4BD]">
                      {lastHealth
                        ? `${lastHealth.status} (${lastHealth.modelName})`
                        : 'Not verified yet'}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 py-2.5">
                    <dt className="text-[#93A4BD]">Initial conditions</dt>
                    <dd className="text-[#F2A93B]">No validated file loaded</dd>
                  </div>
                </dl>

                <Link
                  to="/status"
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-xs bg-[#5CC8E0] px-4 py-2 text-sm font-semibold text-[#08101D] hover:bg-[#BFE6F2] transition-colors duration-150 whitespace-nowrap"
                >
                  <span>Open Backend Status &amp; IC Loader</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </section>

              <section
                aria-labelledby="impact-direct-ic-heading"
                className="p-5 sm:p-6 space-y-3"
              >
                <h2
                  id="impact-direct-ic-heading"
                  className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]"
                >
                  Load initial conditions directly
                </h2>
                <IcFileDropzone />
              </section>
            </div>

            <div className="lg:col-span-7 bg-[#050A12] p-4 sm:p-5 space-y-4">
              <ContractGridPreviewCanvas
                selectedRegion={selectedRegion}
                title="Impact Analysis Target Region · 32 × 36 Grid"
                subtitle="cos(latitude)-weighted regional accumulations and threshold day counts"
                testId="impact-contract-grid-preview"
              />

              <section
                aria-label="Impact region selector and awaiting metric slots"
                className="border border-[#1E2F4A] bg-[#08101D] divide-y divide-[#1E2F4A]"
              >
                <div className="p-3.5 flex flex-wrap gap-1.5">
                  {PRESET_REGIONS.map((region) => {
                    const active = region.id === selectedRegion.id;
                    return (
                      <button
                        key={region.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelectedRegion(region)}
                        className={`min-h-[34px] rounded-xs border px-2.5 py-1 font-mono text-xs transition-colors whitespace-nowrap ${
                          active
                            ? 'border-[#F2A93B] bg-[#142238] text-[#F2A93B] font-semibold'
                            : 'border-[#1E2F4A] bg-[#060B14] text-[#93A4BD] hover:border-[#5CC8E0]/60 hover:text-[#E6EDF7]'
                        }`}
                      >
                        {region.label}
                      </button>
                    );
                  })}
                </div>

                <dl className="grid grid-cols-2 sm:grid-cols-4 bg-[#1E2F4A] gap-px font-mono tabular-nums">
                  <div className="bg-[#08101D] p-3 space-y-0.5">
                    <dt className="text-[11px] text-[#93A4BD]">
                      Accumulated rain
                    </dt>
                    <dd className="text-base font-semibold text-[#5CC8E0]">
                      — mm
                    </dd>
                  </div>
                  <div className="bg-[#08101D] p-3 space-y-0.5">
                    <dt className="text-[11px] text-[#93A4BD]">
                      Heavy (≥ {thresholds.heavyRainMmDay} mm/d)
                    </dt>
                    <dd className="text-base font-semibold text-[#E6EDF7]">
                      — days
                    </dd>
                  </div>
                  <div className="bg-[#08101D] p-3 space-y-0.5">
                    <dt className="text-[11px] text-[#93A4BD]">
                      Dry (&lt; {thresholds.dryDayMmDay} mm/d)
                    </dt>
                    <dd className="text-base font-semibold text-[#BFE6F2]">
                      — days
                    </dd>
                  </div>
                  <div className="bg-[#08101D] p-3 space-y-0.5">
                    <dt className="text-[11px] text-[#93A4BD]">
                      Heat (≥ {thresholds.heatTempC} °C)
                    </dt>
                    <dd className="text-base font-semibold text-[#F2A93B]">
                      — days
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // STATE 2: Synthetic fixture strictly blocked
  if (isSyntheticFixture) {
    return (
      <div className="workstation-canvas">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
          <div
            role="alert"
            data-testid="impact-fixture-blocked"
            className="border border-[#F2A93B] bg-[#142238] p-6 space-y-4"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="h-5 w-5 text-[#F2A93B] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="space-y-1.5">
                <p className="font-mono text-xs font-semibold text-[#F2A93B]">
                  SYNTHETIC FIXTURE — IMPACT CALCULATIONS BLOCKED
                </p>
                <h1 className="font-display text-xl font-semibold text-[#E6EDF7]">
                  Synthetic dev fixture cannot be used as real impact evidence
                </h1>
                <p className="text-sm text-[#E6EDF7] leading-relaxed">
                  Impact Lens computes descriptive rainfall and heat threshold
                  metrics strictly from actual backend model rollouts. Unload the
                  synthetic fixture and run an actual simulation on{' '}
                  <Link to="/twin" className="text-[#5CC8E0] underline">
                    /twin
                  </Link>{' '}
                  or{' '}
                  <Link to="/lab" className="text-[#5CC8E0] underline">
                    /lab
                  </Link>
                  .
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={clearSyntheticFixture}
              className="inline-flex min-h-[42px] items-center rounded-xs border border-[#F2A93B] bg-[#060B14] px-4 py-2 font-mono text-xs text-[#F2A93B] hover:bg-[#F2A93B] hover:text-[#08101D]"
            >
              Unload synthetic fixture
            </button>
          </div>
        </div>
      </div>
    );
  }

  // STATE 3: Valid IC loaded, awaiting actual baseline simulation
  if (!actualBaseline) {
    return (
      <div className="workstation-canvas">
        <WorkflowGuideStrip currentRoute="/impact" />

        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 space-y-5">
          <header className="border-b border-[#1E2F4A] pb-4 space-y-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#5CC8E0]">
              Impact Analytics Console · /impact
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#E6EDF7]">
              Impact Lens — Monsoon Rainfall &amp; Heat Thresholds
            </h1>
            <p className="font-mono text-xs text-[#93A4BD]">
              Loaded IC: {loadedIc.summary.label}
              {' · '}
              {initDateIso
                ? `Init: ${formatCalendarDate(initDateIso, 'long')} (${forecastWindowLabel})`
                : 'Init date: Not specified in IC'}
              {' · '}Backend: {apiConfig.activeBaseUrl}
            </p>
          </header>

          {simulationStatus === 'error' && simulationError && (
            <div
              role="alert"
              className="border border-[#E5646B] bg-[#142238] p-4 space-y-1"
            >
              <p className="font-mono text-xs font-semibold text-[#E5646B]">
                {getApiErrorTitle(simulationError.kind)}
              </p>
              <p className="text-sm text-[#E6EDF7]">{simulationError.message}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 border border-[#1E2F4A] bg-[#08101D] divide-y lg:divide-y-0 lg:divide-x divide-[#1E2F4A]">
            <section className="lg:col-span-5 p-6 space-y-5 flex flex-col justify-between">
              <div className="space-y-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#5FC9A0]">
                  Initial state loaded · Ready to calculate impact metrics
                </p>
                <h2 className="text-xl font-semibold text-[#E6EDF7]">
                  Run an actual baseline rollout to populate Impact Lens
                </h2>
                <p className="text-sm text-[#93A4BD] leading-relaxed">
                  Run a 10-day baseline forecast below (or run a Baseline +
                  Scenario experiment in the Experiment Lab) to inspect
                  accumulated rainfall, heavy-rain days, dry days, and optional
                  heat threshold counts.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={isRunning}
                  onClick={() => void runBaselineSimulation({ steps: 10 })}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xs bg-[#5CC8E0] px-5 py-2.5 text-sm font-semibold text-[#08101D] hover:bg-[#BFE6F2] disabled:opacity-50"
                >
                  {isRunning ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>Run 10-day baseline simulation</span>
                </button>
                <Link
                  to="/lab"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xs border border-[#2B4264] bg-[#060B14] px-4 py-2.5 font-mono text-xs text-[#E6EDF7] hover:border-[#5CC8E0]"
                >
                  <span>Run Baseline + Scenario in /lab</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </section>

            <div className="lg:col-span-7 bg-[#050A12] p-4 sm:p-5">
              <ContractGridPreviewCanvas
                selectedRegion={selectedRegion}
                title="Target Regional Integration Box · 32 × 36 Grid"
                subtitle="Awaiting actual POST /simulate rollout"
                testId="impact-ready-grid-preview"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // STATE 4: Active Climate Impact Analytics Console
  return (
    <div className="workstation-canvas" data-testid="impact-workspace">
      <WorkflowGuideStrip currentRoute="/impact" />

      {/* Compact Command Header */}
      <header className="border-b border-[#1E2F4A] bg-[#08101D]">
        <div className="mx-auto max-w-[1600px] px-4 py-3 sm:px-6 lg:px-8 flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 space-y-0.5">
            <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-[#E6EDF7]">
              Monsoon Rainfall &amp; Heat Threshold Analysis
            </h1>
            <p className="font-mono text-[11px] text-[#93A4BD] tabular-nums truncate">
              IC: <span className="text-[#E6EDF7]">{loadedIc.summary.label}</span>
              {' · '}
              {initDateIso ? (
                <>
                  Window:{' '}
                  <span className="text-[#BFE6F2]">{forecastWindowLabel}</span>
                </>
              ) : (
                <span>Init date: Not specified in IC</span>
              )}
              {' · '}Model: {actualBaseline.modelName ?? 'Not reported'}
              {' · '}
              {actualScenario ? (
                <span className="text-[#F2A93B]">
                  Scenario active: {actualScenario.scenarioLabel}
                </span>
              ) : (
                <span>
                  Baseline only —{' '}
                  <Link to="/lab" className="text-[#5CC8E0] underline">
                    run a scenario in /lab
                  </Link>{' '}
                  to compare deltas
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportCurrentMapPng}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xs border border-[#1E2F4A] bg-[#0E1829] px-3 py-1.5 font-mono text-xs text-[#E6EDF7] hover:border-[#5CC8E0] hover:text-[#BFE6F2] whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Export Map PNG</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xs border border-[#1E2F4A] bg-[#0E1829] px-3 py-1.5 font-mono text-xs text-[#E6EDF7] hover:border-[#5CC8E0] hover:text-[#BFE6F2] whitespace-nowrap"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Export Region CSV</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 space-y-5">
        {exportNotice && (
          <div
            role="status"
            className="border border-[#5FC9A0]/50 bg-[#0E1829] px-4 py-2 font-mono text-xs text-[#5FC9A0] flex items-center justify-between gap-2"
          >
            <span>{exportNotice}</span>
            <button
              type="button"
              onClick={() => setExportNotice(null)}
              className="text-[#93A4BD] hover:text-[#E6EDF7]"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Unified Analytical Command Strip: 4 KPIs + Editable Thresholds + Region Selector */}
        {rainfall && heat && (
          <div className="instrument-plane rounded-xs divide-y divide-[#1E2F4A]">
            <section aria-label="Regional impact headline summary">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-2.5 bg-[#060B14] border-b border-[#1E2F4A]">
                <p className="font-mono text-xs text-[#BFE6F2]">
                  Region snapshot · {selectedRegion.label} (
                  {rainfall.regionBaselineAccum.cellCount} cells)
                </p>
                <p className="font-mono text-[11px] text-[#93A4BD]">
                  cos(latitude)-weighted cell means across Days 1–{rainfall.steps}
                  {forecastWindowLabel ? ` (${forecastWindowLabel})` : ''}
                </p>
              </div>
              <dl className="grid grid-cols-2 lg:grid-cols-4 bg-[#1E2F4A] gap-px font-mono tabular-nums">
                <div className="bg-[#08101D] px-5 py-4 space-y-1">
                  <dt className="text-[11px] text-[#93A4BD]">
                    Accumulated rainfall
                  </dt>
                  <dd className="text-2xl font-semibold text-[#5CC8E0] tracking-tight">
                    {rainfall.regionBaselineAccum.weightedMean.toFixed(1)}
                    <span className="text-xs font-normal text-[#93A4BD] ml-1">
                      mm
                    </span>
                  </dd>
                  {rainfall.regionDiffAccum && (
                    <p className="text-[11px] text-[#F2A93B]">
                      Scenario Δ:{' '}
                      {rainfall.regionDiffAccum.weightedMean >= 0 ? '+' : ''}
                      {rainfall.regionDiffAccum.weightedMean.toFixed(1)} mm
                    </p>
                  )}
                </div>

                <div className="bg-[#08101D] px-5 py-4 space-y-1">
                  <dt className="text-[11px] text-[#93A4BD]">
                    Heavy-rain days (≥ {thresholds.heavyRainMmDay} mm/d)
                  </dt>
                  <dd className="text-2xl font-semibold text-[#E6EDF7] tracking-tight">
                    {rainfall.regionBaselineHeavyDays.weightedMean.toFixed(2)}
                    <span className="text-xs font-normal text-[#93A4BD] ml-1">
                      days
                    </span>
                  </dd>
                  {rainfall.regionScenarioHeavyDays && (
                    <p className="text-[11px] text-[#F2A93B]">
                      Scenario:{' '}
                      {rainfall.regionScenarioHeavyDays.weightedMean.toFixed(2)} d
                    </p>
                  )}
                </div>

                <div className="bg-[#08101D] px-5 py-4 space-y-1">
                  <dt className="text-[11px] text-[#93A4BD]">
                    Dry days (&lt; {thresholds.dryDayMmDay} mm/d)
                  </dt>
                  <dd className="text-2xl font-semibold text-[#BFE6F2] tracking-tight">
                    {rainfall.regionBaselineDryDays.weightedMean.toFixed(2)}
                    <span className="text-xs font-normal text-[#93A4BD] ml-1">
                      days
                    </span>
                  </dd>
                  {rainfall.regionScenarioDryDays && (
                    <p className="text-[11px] text-[#F2A93B]">
                      Scenario:{' '}
                      {rainfall.regionScenarioDryDays.weightedMean.toFixed(2)} d
                    </p>
                  )}
                </div>

                <div className="bg-[#08101D] px-5 py-4 space-y-1">
                  <dt className="text-[11px] text-[#93A4BD]">
                    Heat days (≥ {thresholds.heatTempC} °C)
                  </dt>
                  <dd className="text-2xl font-semibold text-[#F2A93B] tracking-tight">
                    {showHeatSection
                      ? heat.regionBaselineHotDays.weightedMean.toFixed(2)
                      : '—'}
                    {showHeatSection && (
                      <span className="text-xs font-normal text-[#93A4BD] ml-1">
                        days
                      </span>
                    )}
                  </dd>
                  {showHeatSection && heat.regionDiffHotDays && (
                    <p className="text-[11px] text-[#BFE6F2]">
                      Scenario Δ:{' '}
                      {heat.regionDiffHotDays.weightedMean >= 0 ? '+' : ''}
                      {heat.regionDiffHotDays.weightedMean.toFixed(2)} d
                    </p>
                  )}
                </div>
              </dl>
            </section>

            {/* Controls Split: Editable Thresholds (7 cols) | Region Selector (5 cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#1E2F4A]">
              <section
                aria-labelledby="impact-thresholds-heading"
                className="lg:col-span-7 p-5 space-y-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2
                    id="impact-thresholds-heading"
                    className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]"
                  >
                    User-Defined Thresholds (Editable)
                  </h2>
                  <span className="text-[11px] text-[#93A4BD]">
                    Descriptive parameters, not official advisories
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                  <label className="border border-[#1E2F4A] bg-[#060B14] p-3 space-y-1.5">
                    <span className="block text-[11px] text-[#93A4BD]">
                      Heavy-rain threshold (≥)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        aria-label="Heavy-rain threshold in mm/day"
                        value={heavyRainStr}
                        onChange={(e) => setHeavyRainStr(e.target.value)}
                        className="w-full min-h-[34px] rounded-xs border border-[#1E2F4A] bg-[#0E1829] px-2 text-[#E6EDF7] tabular-nums focus:border-[#5CC8E0]"
                      />
                      <span className="text-[#BFE6F2] shrink-0">mm/day</span>
                    </div>
                  </label>

                  <label className="border border-[#1E2F4A] bg-[#060B14] p-3 space-y-1.5">
                    <span className="block text-[11px] text-[#93A4BD]">
                      Dry-day threshold (&lt;)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        aria-label="Dry-day threshold in mm/day"
                        value={dryDayStr}
                        onChange={(e) => setDryDayStr(e.target.value)}
                        className="w-full min-h-[34px] rounded-xs border border-[#1E2F4A] bg-[#0E1829] px-2 text-[#E6EDF7] tabular-nums focus:border-[#5CC8E0]"
                      />
                      <span className="text-[#BFE6F2] shrink-0">mm/day</span>
                    </div>
                  </label>

                  <label className="border border-[#1E2F4A] bg-[#060B14] p-3 space-y-1.5">
                    <span className="block text-[11px] text-[#93A4BD]">
                      Optional heat threshold (≥)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.5"
                        aria-label="Heat temperature threshold in degrees Celsius"
                        value={heatTempStr}
                        onChange={(e) => setHeatTempStr(e.target.value)}
                        className="w-full min-h-[34px] rounded-xs border border-[#1E2F4A] bg-[#0E1829] px-2 text-[#E6EDF7] tabular-nums focus:border-[#5CC8E0]"
                      />
                      <span className="text-[#BFE6F2] shrink-0">°C</span>
                    </div>
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <label className="inline-flex items-center gap-2 text-xs text-[#E6EDF7] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showHeatSection}
                      onChange={(e) => setShowHeatSection(e.target.checked)}
                      className="h-4 w-4 accent-[#5CC8E0]"
                    />
                    <span>Show optional heat threshold section</span>
                  </label>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="Zoom in impact maps"
                      onClick={() =>
                        setSyncTransform((t) =>
                          clampSyncTransform({ ...t, zoom: t.zoom * 1.25 }),
                        )
                      }
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xs border border-[#1E2F4A] bg-[#060B14] text-[#E6EDF7] hover:border-[#5CC8E0]"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Zoom out impact maps"
                      onClick={() =>
                        setSyncTransform((t) =>
                          clampSyncTransform({ ...t, zoom: t.zoom / 1.25 }),
                        )
                      }
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xs border border-[#1E2F4A] bg-[#060B14] text-[#E6EDF7] hover:border-[#5CC8E0]"
                    >
                      <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSyncTransform({ zoom: 1, panX: 0, panY: 0 })
                      }
                      className="inline-flex min-h-[32px] items-center gap-1 rounded-xs border border-[#1E2F4A] bg-[#060B14] px-2.5 font-mono text-[11px] text-[#93A4BD] hover:border-[#5CC8E0] hover:text-[#E6EDF7] tabular-nums"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      <span>{syncTransform.zoom.toFixed(1)}×</span>
                    </button>
                  </div>
                </div>
              </section>

              <section
                aria-labelledby="impact-region-heading"
                className="lg:col-span-5 p-5 space-y-2.5"
              >
                <h2
                  id="impact-region-heading"
                  className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]"
                >
                  Selected Geographic Region
                </h2>
                <RegionSelector
                  selectedRegion={selectedRegion}
                  onSelectRegion={setSelectedRegion}
                  latMinLimit={gridExtents.latMin}
                  latMaxLimit={gridExtents.latMax}
                  lonMinLimit={gridExtents.lonMin}
                  lonMaxLimit={gridExtents.lonMax}
                />
              </section>
            </div>
          </div>
        )}

        {/* Primary Metric: Full-Width 3-Up Monsoon Rainfall Accumulation Stage */}
        {rainfall && rainScales && heat && heatScales && (
          <>
            <section
              aria-labelledby="accum-rain-maps-heading"
              className="instrument-plane rounded-xs divide-y divide-[#1E2F4A]"
            >
              <div className="px-5 py-3.5 bg-[#08101D] flex flex-wrap items-baseline justify-between gap-2">
                <h2
                  id="accum-rain-maps-heading"
                  className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]"
                >
                  Monsoon Rainfall Impact — {rainfall.steps}-Day Accumulated
                  Precipitation (mm)
                </h2>
                <span className="font-mono text-[11px] text-[#93A4BD]">
                  Sum of daily precipitation across Days 1–{rainfall.steps}
                  {forecastWindowLabel ? ` · ${forecastWindowLabel}` : ''}
                </span>
              </div>

              <div
                className={`grid grid-cols-1 ${
                  actualScenario ? 'lg:grid-cols-3' : 'lg:grid-cols-2'
                } bg-[#050A12] divide-y lg:divide-y-0 lg:divide-x divide-[#1E2F4A]`}
              >
                <div className="p-4">
                  <SyncFieldCanvas
                    ref={baselineRainMapRef}
                    displayGrid={rainfall.baselineAccumulatedGrid}
                    lat={loadedIc.data.grid.lat}
                    lon={loadedIc.data.grid.lon}
                    landSeaMask={loadedIc.data.static?.land_sea_mask}
                    colorScale={rainScales.accumScale}
                    unitLabel="mm"
                    decimals={1}
                    title="Baseline Accumulated Rainfall"
                    ariaLabel="Baseline accumulated rainfall map in millimetres"
                    testId="impact-baseline-rain-canvas"
                    selectedRegion={selectedRegion}
                    viewTransform={syncTransform}
                    onViewTransformChange={setSyncTransform}
                  />
                </div>

                {actualScenario &&
                rainfall.scenarioAccumulatedGrid &&
                rainfall.diffAccumulatedGrid ? (
                  <>
                    <div className="p-4">
                      <SyncFieldCanvas
                        displayGrid={rainfall.scenarioAccumulatedGrid}
                        lat={loadedIc.data.grid.lat}
                        lon={loadedIc.data.grid.lon}
                        landSeaMask={loadedIc.data.static?.land_sea_mask}
                        colorScale={rainScales.accumScale}
                        unitLabel="mm"
                        decimals={1}
                        title="Scenario Accumulated Rainfall"
                        ariaLabel="Scenario accumulated rainfall map in millimetres"
                        testId="impact-scenario-rain-canvas"
                        selectedRegion={selectedRegion}
                        viewTransform={syncTransform}
                        onViewTransformChange={setSyncTransform}
                      />
                    </div>
                    <div className="p-4 bg-[#07101E] space-y-2 relative">
                      <span
                        className="absolute inset-x-0 top-0 h-0.5 bg-[#5CC8E0]"
                        aria-hidden="true"
                      />
                      <SyncFieldCanvas
                        ref={diffRainMapRef}
                        displayGrid={rainfall.diffAccumulatedGrid}
                        lat={loadedIc.data.grid.lat}
                        lon={loadedIc.data.grid.lon}
                        landSeaMask={loadedIc.data.static?.land_sea_mask}
                        colorScale={rainScales.diffScale}
                        unitLabel="mm"
                        decimals={1}
                        signed
                        title="Rainfall Change (Scenario − Baseline)"
                        ariaLabel="Scenario minus Baseline accumulated rainfall change map in millimetres"
                        testId="impact-diff-rain-canvas"
                        selectedRegion={selectedRegion}
                        viewTransform={syncTransform}
                        onViewTransformChange={setSyncTransform}
                      />
                      <p className="font-mono text-[11px] text-[#BFE6F2] tabular-nums">
                        Symmetric RdBu diverging: ±
                        {rainScales.diffLimit.toFixed(1)} mm
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="p-8 bg-[#08101D] flex flex-col justify-center space-y-3">
                    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#93A4BD]">
                      Counterfactual delta inactive
                    </p>
                    <h3 className="text-lg font-semibold text-[#E6EDF7]">
                      No perturbed scenario run yet
                    </h3>
                    <p className="text-xs text-[#93A4BD] leading-relaxed max-w-md">
                      Baseline accumulated rainfall and threshold counts are
                      shown using your actual baseline rollout. To view Scenario
                      and Rainfall Change (Scenario − Baseline) maps, run a shock
                      experiment in the Experiment Lab.
                    </p>
                    <div className="pt-1">
                      <Link
                        to="/lab"
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xs border border-[#5CC8E0] bg-[#142238] px-3.5 py-1.5 font-mono text-xs text-[#BFE6F2] hover:bg-[#5CC8E0] hover:text-[#08101D] transition-colors"
                      >
                        <span>Open Experiment Lab (/lab)</span>
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Asymmetric 7/5 Spread: Daily Rainfall Chart + Regional Summary Table */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
              <div className="xl:col-span-6">
                <Suspense
                  fallback={
                    <div
                      role="status"
                      className="instrument-plane rounded-xs p-5 font-mono text-xs text-[#93A4BD]"
                    >
                      Loading daily rainfall sequence chart…
                    </div>
                  }
                >
                  <DailyRainfallChart
                    sequence={rainfall.dailyRegionalSequence}
                    region={selectedRegion}
                    heavyRainThresholdMmDay={thresholds.heavyRainMmDay}
                    dryDayThresholdMmDay={thresholds.dryDayMmDay}
                    hasScenario={Boolean(actualScenario)}
                    initDateIso={initDateIso}
                  />
                </Suspense>
              </div>

              <section
                aria-labelledby="impact-summary-table-heading"
                className="xl:col-span-6 instrument-plane rounded-xs flex flex-col"
              >
                <div className="px-5 py-3.5 border-b border-[#1E2F4A] space-y-0.5">
                  <h2
                    id="impact-summary-table-heading"
                    className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]"
                  >
                    Regional Summary Table — {selectedRegion.label}
                  </h2>
                  <p className="font-mono text-[11px] text-[#93A4BD] tabular-nums">
                    Bounds: {selectedRegion.latMin.toFixed(1)}–
                    {selectedRegion.latMax.toFixed(1)}°N,{' '}
                    {selectedRegion.lonMin.toFixed(1)}–
                    {selectedRegion.lonMax.toFixed(1)}°E ·{' '}
                    {rainfall.regionBaselineAccum.cellCount} grid cells ·
                    cos(latitude)-weighted regional means
                  </p>
                </div>

                <div className="overflow-x-auto flex-1 bg-[#08101D]">
                  <table
                    className="w-full text-left font-mono text-xs tabular-nums border-collapse"
                    data-testid="impact-regional-summary-table"
                  >
                    <thead>
                      <tr className="border-b border-[#1E2F4A] bg-[#060B14] text-[#93A4BD]">
                        <th className="px-4 py-3 font-medium">Metric</th>
                        <th className="px-4 py-3 font-medium">Baseline</th>
                        <th className="px-4 py-3 font-medium">Scenario</th>
                        <th className="px-4 py-3 font-medium">
                          Change (Scen − Base)
                        </th>
                        <th className="px-4 py-3 font-medium">
                          Baseline Cell Min / Max
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E2F4A] text-[#E6EDF7]">
                      <tr>
                        <td className="px-4 py-3 text-[#BFE6F2]">
                          Accumulated rainfall (mm)
                        </td>
                        <td className="px-4 py-3">
                          {rainfall.regionBaselineAccum.weightedMean.toFixed(2)}{' '}
                          mm
                        </td>
                        <td className="px-4 py-3 text-[#F2A93B]">
                          {rainfall.regionScenarioAccum
                            ? `${rainfall.regionScenarioAccum.weightedMean.toFixed(2)} mm`
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {rainfall.regionDiffAccum
                            ? `${rainfall.regionDiffAccum.weightedMean >= 0 ? '+' : ''}${rainfall.regionDiffAccum.weightedMean.toFixed(2)} mm`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-[#93A4BD]">
                          {rainfall.regionBaselineAccum.min.toFixed(1)} /{' '}
                          {rainfall.regionBaselineAccum.max.toFixed(1)} mm
                        </td>
                      </tr>

                      <tr>
                        <td className="px-4 py-3 text-[#BFE6F2]">
                          Heavy-rain days (cell mean, ≥{' '}
                          {thresholds.heavyRainMmDay} mm/day)
                        </td>
                        <td className="px-4 py-3">
                          {rainfall.regionBaselineHeavyDays.weightedMean.toFixed(
                            2,
                          )}{' '}
                          days
                        </td>
                        <td className="px-4 py-3 text-[#F2A93B]">
                          {rainfall.regionScenarioHeavyDays
                            ? `${rainfall.regionScenarioHeavyDays.weightedMean.toFixed(2)} days`
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {rainfall.regionScenarioHeavyDays
                            ? `${rainfall.regionScenarioHeavyDays.weightedMean - rainfall.regionBaselineHeavyDays.weightedMean >= 0 ? '+' : ''}${(rainfall.regionScenarioHeavyDays.weightedMean - rainfall.regionBaselineHeavyDays.weightedMean).toFixed(2)} days`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-[#93A4BD]">
                          {rainfall.regionBaselineHeavyDays.min.toFixed(0)} /{' '}
                          {rainfall.regionBaselineHeavyDays.max.toFixed(0)} days
                        </td>
                      </tr>

                      <tr>
                        <td className="px-4 py-3 text-[#BFE6F2]">
                          Dry days (cell mean, &lt; {thresholds.dryDayMmDay}{' '}
                          mm/day)
                        </td>
                        <td className="px-4 py-3">
                          {rainfall.regionBaselineDryDays.weightedMean.toFixed(
                            2,
                          )}{' '}
                          days
                        </td>
                        <td className="px-4 py-3 text-[#F2A93B]">
                          {rainfall.regionScenarioDryDays
                            ? `${rainfall.regionScenarioDryDays.weightedMean.toFixed(2)} days`
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {rainfall.regionScenarioDryDays
                            ? `${rainfall.regionScenarioDryDays.weightedMean - rainfall.regionBaselineDryDays.weightedMean >= 0 ? '+' : ''}${(rainfall.regionScenarioDryDays.weightedMean - rainfall.regionBaselineDryDays.weightedMean).toFixed(2)} days`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-[#93A4BD]">
                          {rainfall.regionBaselineDryDays.min.toFixed(0)} /{' '}
                          {rainfall.regionBaselineDryDays.max.toFixed(0)} days
                        </td>
                      </tr>

                      {showHeatSection && (
                        <tr>
                          <td className="px-4 py-3 text-[#BFE6F2]">
                            Heat days (cell mean, t2m ≥ {thresholds.heatTempC}{' '}
                            °C)
                          </td>
                          <td className="px-4 py-3">
                            {heat.regionBaselineHotDays.weightedMean.toFixed(2)}{' '}
                            days
                          </td>
                          <td className="px-4 py-3 text-[#F2A93B]">
                            {heat.regionScenarioHotDays
                              ? `${heat.regionScenarioHotDays.weightedMean.toFixed(2)} days`
                              : '—'}
                          </td>
                          <td className="px-4 py-3">
                            {heat.regionDiffHotDays
                              ? `${heat.regionDiffHotDays.weightedMean >= 0 ? '+' : ''}${heat.regionDiffHotDays.weightedMean.toFixed(2)} days`
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-[#93A4BD]">
                            {heat.regionBaselineHotDays.min.toFixed(0)} /{' '}
                            {heat.regionBaselineHotDays.max.toFixed(0)} days
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            {/* Optional Heat Metric Section */}
            {showHeatSection && (
              <section
                aria-labelledby="heat-metric-heading"
                className="instrument-plane rounded-xs divide-y divide-[#1E2F4A]"
              >
                <div className="px-5 py-3.5 bg-[#08101D] flex flex-wrap items-baseline justify-between gap-2">
                  <h2
                    id="heat-metric-heading"
                    className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]"
                  >
                    Optional Heat Threshold — Days with 2 m Temperature ≥{' '}
                    {thresholds.heatTempC} °C
                  </h2>
                  <span className="font-mono text-[11px] text-[#93A4BD] tabular-nums">
                    Region mean:{' '}
                    {heat.regionBaselineHotDays.weightedMean.toFixed(2)} days
                    {heat.regionScenarioHotDays
                      ? ` → ${heat.regionScenarioHotDays.weightedMean.toFixed(2)} days`
                      : ''}
                  </span>
                </div>

                <div
                  className={`grid grid-cols-1 ${
                    actualScenario ? 'lg:grid-cols-3' : 'lg:grid-cols-1 max-w-2xl'
                  } bg-[#050A12] divide-y lg:divide-y-0 lg:divide-x divide-[#1E2F4A]`}
                >
                  <div className="p-4">
                    <SyncFieldCanvas
                      ref={heatMapRef}
                      displayGrid={heat.baselineHotDaysGrid}
                      lat={loadedIc.data.grid.lat}
                      lon={loadedIc.data.grid.lon}
                      landSeaMask={loadedIc.data.static?.land_sea_mask}
                      colorScale={heatScales.daysScale}
                      unitLabel="days"
                      decimals={0}
                      title={`Baseline Days ≥ ${thresholds.heatTempC} °C`}
                      ariaLabel={`Baseline map of days above ${thresholds.heatTempC} degrees Celsius`}
                      testId="impact-heat-baseline-canvas"
                      selectedRegion={selectedRegion}
                      viewTransform={syncTransform}
                      onViewTransformChange={setSyncTransform}
                    />
                  </div>

                  {actualScenario &&
                    heat.scenarioHotDaysGrid &&
                    heat.diffHotDaysGrid && (
                      <>
                        <div className="p-4">
                          <SyncFieldCanvas
                            displayGrid={heat.scenarioHotDaysGrid}
                            lat={loadedIc.data.grid.lat}
                            lon={loadedIc.data.grid.lon}
                            landSeaMask={loadedIc.data.static?.land_sea_mask}
                            colorScale={heatScales.daysScale}
                            unitLabel="days"
                            decimals={0}
                            title={`Scenario Days ≥ ${thresholds.heatTempC} °C`}
                            ariaLabel={`Scenario map of days above ${thresholds.heatTempC} degrees Celsius`}
                            selectedRegion={selectedRegion}
                            viewTransform={syncTransform}
                            onViewTransformChange={setSyncTransform}
                          />
                        </div>

                        <div className="p-4 bg-[#07101E] relative">
                          <span
                            className="absolute inset-x-0 top-0 h-0.5 bg-[#5CC8E0]"
                            aria-hidden="true"
                          />
                          <SyncFieldCanvas
                            displayGrid={heat.diffHotDaysGrid}
                            lat={loadedIc.data.grid.lat}
                            lon={loadedIc.data.grid.lon}
                            landSeaMask={loadedIc.data.static?.land_sea_mask}
                            colorScale={heatScales.diffScale}
                            unitLabel="days"
                            decimals={0}
                            signed
                            title="Heat-Day Difference (Scenario − Baseline)"
                            ariaLabel="Difference in heat days between scenario and baseline"
                            selectedRegion={selectedRegion}
                            viewTransform={syncTransform}
                            onViewTransformChange={setSyncTransform}
                          />
                        </div>
                      </>
                    )}
                </div>
              </section>
            )}

            {/* Structured 2-Column 7-Point Scientific Limitations Ledger */}
            <section
              aria-labelledby="scientific-limitations-heading"
              data-testid="impact-scientific-limitations"
              className="border border-[#F2A93B]/45 bg-[#08101D] p-5 sm:p-6 space-y-4"
            >
              <div className="flex items-center gap-2 border-b border-[#1E2F4A] pb-3 text-[#F2A93B]">
                <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
                <h2
                  id="scientific-limitations-heading"
                  className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]"
                >
                  Scientific Limitations &amp; Interpretation Boundaries
                </h2>
              </div>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5 list-disc pl-5 text-xs text-[#93A4BD] leading-relaxed">
                <li>
                  <strong className="text-[#E6EDF7]">
                    Coarse spatial resolution:
                  </strong>{' '}
                  The atmospheric grid is approximately 1 degree (~110 km per
                  cell), not local station or watershed resolution.
                </li>
                <li>
                  <strong className="text-[#E6EDF7]">
                    Daily temporal output:
                  </strong>{' '}
                  Output is daily-averaged / 24-hour accumulated and does not
                  resolve sub-daily storm intensity or flash-flood peaks.
                </li>
                <li>
                  <strong className="text-[#E6EDF7]">
                    Experimental model:
                  </strong>{' '}
                  All fields originate from an experimental machine-learning
                  rollout model and exploratory perturbations.
                </li>
                <li>
                  <strong className="text-[#E6EDF7]">
                    Descriptive calculations only:
                  </strong>{' '}
                  These metrics are descriptive grid calculations, not validated
                  impact forecasts.
                </li>
                <li>
                  <strong className="text-[#E6EDF7]">
                    No downstream socio-economic claims:
                  </strong>{' '}
                  No crop-loss, economic, health, infrastructure, or causal
                  claims are made.
                </li>
                <li>
                  <strong className="text-[#E6EDF7]">
                    No ground-truth observation implied:
                  </strong>{' '}
                  No actual ground-level impact observation is implied by these
                  model-derived counts.
                </li>
                <li className="md:col-span-2">
                  <strong className="text-[#E6EDF7]">
                    Regional averaging caveat:
                  </strong>{' '}
                  Regional averaging hides spatial variability across individual
                  grid cells inside the selected box.
                </li>
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
