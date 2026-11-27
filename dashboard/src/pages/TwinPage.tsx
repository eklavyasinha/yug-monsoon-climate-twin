import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  GitCompare,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Square,
  Trash2,
} from 'lucide-react';
import { getApiErrorTitle } from '../api/errors';
import { ContractGridPreviewCanvas } from '../components/ContractGridPreviewCanvas';
import { IcFileDropzone } from '../components/IcFileDropzone';
import { WorkflowGuideStrip } from '../components/WorkflowGuideStrip';
import { ColorScaleLegend } from '../components/twin/ColorScaleLegend';
import {
  GridMapCanvas,
  type GridMapCanvasHandle,
} from '../components/twin/GridMapCanvas';
import { RegionSelector } from '../components/twin/RegionSelector';
import { TwinSummaryPanel } from '../components/twin/TwinSummaryPanel';
const VariableTimeSeriesChart = lazy(() =>
  import('../components/twin/VariableTimeSeriesChart').then((m) => ({
    default: m.VariableTimeSeriesChart,
  })),
);
import { useAppData } from '../context/AppDataContext';
import {
  computeDailyVariableSeries,
  PRESET_REGIONS,
} from '../utils/aggregation';
import {
  computeSymmetricDeltaRange,
  computeVariableRange,
  createDashboardColorScale,
  createDivergingDifferenceScale,
  type ScaleRangeMode,
} from '../utils/colorScales';
import {
  buildTimeSeriesCsv,
  triggerClientFileDownload,
} from '../utils/exportData';
import {
  formatCalendarDate,
  formatForecastWindow,
  resolveForecastDayDate,
} from '../utils/forecastDates';
import {
  computeSameRunDifferenceGrid,
  forecastDayToStepIndex,
  getChannelGridSlice,
  getVariableGrid,
  type DashboardVariable,
} from '../utils/rolloutStore';
import { DASHBOARD_VARIABLES, getVariableMeta } from '../utils/units';

const SYNTHETIC_WATERMARK = 'SYNTHETIC FIXTURE — NOT MODEL OUTPUT';

const VARIABLE_SWATCH_GRADIENTS: Record<DashboardVariable, string> = {
  t2m: 'linear-gradient(90deg, #00204d, #424d6b, #7c7b78, #bcaf6f, #ffea46)',
  tp: 'linear-gradient(90deg, #440154, #3b528b, #21918c, #5ec962, #fde725)',
  wind_speed: 'linear-gradient(90deg, #440154, #3b528b, #21918c, #5ec962, #fde725)',
  u10: 'linear-gradient(90deg, #440154, #3b528b, #21918c, #5ec962, #fde725)',
  v10: 'linear-gradient(90deg, #440154, #3b528b, #21918c, #5ec962, #fde725)',
  msl: 'linear-gradient(90deg, #00204d, #424d6b, #7c7b78, #bcaf6f, #ffea46)',
  tcwv: 'linear-gradient(90deg, #440154, #3b528b, #21918c, #5ec962, #fde725)',
};

export function TwinPage() {
  const {
    apiConfig,
    loadedIc,
    setLoadedIc,
    lastHealth,
    baselineRun,
    simulationStatus,
    simulationError,
    selectedVariable,
    setSelectedVariable,
    selectedDay,
    setSelectedDay,
    selectedRegion,
    setSelectedRegion,
    runBaselineSimulation,
    cancelSimulation,
    fixtureModeAllowed,
    activateDevSyntheticFixture,
    clearSyntheticFixture,
  } = useAppData();

  const mapRef = useRef<GridMapCanvasHandle | null>(null);

  const [scaleRangeMode, setScaleRangeMode] =
    useState<ScaleRangeMode>('fixed-run');
  const [showWindVectors, setShowWindVectors] = useState(false);
  const [windStride, setWindStride] = useState(3);
  const [isPlaying, setIsPlaying] = useState(false);
  const [reducedMotionWarning, setReducedMotionWarning] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [dayA, setDayA] = useState(1);
  const [dayB, setDayB] = useState(5);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const totalSteps = baselineRun?.steps ?? 10;

  useEffect(() => {
    if (!baselineRun) {
      setIsPlaying(false);
      setCompareMode(false);
      return;
    }
    if (dayA > baselineRun.steps) setDayA(1);
    if (dayB > baselineRun.steps) setDayB(baselineRun.steps);
    if (baselineRun.steps < 2 && compareMode) {
      setCompareMode(false);
    }
  }, [baselineRun, dayA, dayB, compareMode]);

  useEffect(() => {
    if (!isPlaying || !baselineRun || baselineRun.steps < 2) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      setIsPlaying(false);
      setReducedMotionWarning(true);
      return;
    }

    const timer = window.setInterval(() => {
      setSelectedDay(selectedDay >= baselineRun.steps ? 1 : selectedDay + 1);
    }, 950);

    return () => window.clearInterval(timer);
  }, [isPlaying, baselineRun, selectedDay, setSelectedDay]);

  const clampedDay = Math.min(Math.max(1, selectedDay), totalSteps);
  const activeStepIndex = baselineRun
    ? forecastDayToStepIndex(clampedDay, baselineRun.steps)
    : 0;
  const initDateIso = loadedIc?.summary.initDateIso ?? null;
  const dayDate = resolveForecastDayDate(initDateIso, clampedDay);
  const dayADate = resolveForecastDayDate(initDateIso, dayA);
  const dayBDate = resolveForecastDayDate(initDateIso, dayB);
  const forecastWindowLabel = formatForecastWindow(initDateIso, totalSteps);

  const isDifferenceMode = Boolean(
    compareMode && baselineRun && baselineRun.steps >= 2,
  );

  const activeRawGrid = useMemo(() => {
    if (!baselineRun) return null;
    if (isDifferenceMode) {
      const stepA = forecastDayToStepIndex(dayA, baselineRun.steps);
      const stepB = forecastDayToStepIndex(dayB, baselineRun.steps);
      return computeSameRunDifferenceGrid(
        baselineRun.packedRollout,
        stepA,
        stepB,
        selectedVariable,
      );
    }
    return getVariableGrid(
      baselineRun.packedRollout,
      activeStepIndex,
      selectedVariable,
    );
  }, [
    baselineRun,
    isDifferenceMode,
    dayA,
    dayB,
    activeStepIndex,
    selectedVariable,
  ]);

  const u10Grid = useMemo(() => {
    if (!baselineRun) return null;
    return getChannelGridSlice(baselineRun.packedRollout, activeStepIndex, 2);
  }, [baselineRun, activeStepIndex]);

  const v10Grid = useMemo(() => {
    if (!baselineRun) return null;
    return getChannelGridSlice(baselineRun.packedRollout, activeStepIndex, 3);
  }, [baselineRun, activeStepIndex]);

  const colorScale = useMemo(() => {
    if (!baselineRun || !activeRawGrid) return null;
    if (isDifferenceMode) {
      const domain = computeSymmetricDeltaRange(
        activeRawGrid,
        selectedVariable,
      );
      return createDivergingDifferenceScale(domain);
    }
    const domain = computeVariableRange(
      baselineRun.packedRollout,
      selectedVariable,
      scaleRangeMode,
      activeStepIndex,
    );
    return createDashboardColorScale(selectedVariable, domain);
  }, [
    baselineRun,
    activeRawGrid,
    isDifferenceMode,
    selectedVariable,
    scaleRangeMode,
    activeStepIndex,
  ]);

  const dailySeries = useMemo(() => {
    if (!baselineRun || !loadedIc) return [];
    return computeDailyVariableSeries(
      baselineRun.packedRollout,
      selectedVariable,
      loadedIc.data.grid.lat,
      loadedIc.data.grid.lon,
      selectedRegion,
    );
  }, [baselineRun, loadedIc, selectedVariable, selectedRegion]);

  const activeDayPoint =
    dailySeries.find((pt) => pt.day === clampedDay) ?? dailySeries[0] ?? null;

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

  const vMeta = getVariableMeta(selectedVariable);
  const isRunning =
    simulationStatus === 'connecting' || simulationStatus === 'loading';

  const handleTogglePlay = () => {
    setReducedMotionWarning(false);
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      setReducedMotionWarning(true);
      setIsPlaying(false);
      return;
    }
    setIsPlaying(true);
  };

  const handleExportPng = () => {
    if (!baselineRun || !loadedIc || !mapRef.current) return;
    const title = isDifferenceMode
      ? `${vMeta.label} Difference (Day ${dayB}${dayBDate.longDate ? ` · ${dayBDate.longDate}` : ''} − Day ${dayA}${dayADate.longDate ? ` · ${dayADate.longDate}` : ''})`
      : `${vMeta.label} — Forecast Day ${clampedDay} of ${baselineRun.steps}${dayDate.longDate ? ` (${dayDate.longDate})` : ''}`;
    const initPart = initDateIso
      ? `Init: ${formatCalendarDate(initDateIso, 'long')} (${initDateIso})`
      : 'Init date: Not in IC metadata';
    const subtitle = `IC: ${loadedIc.summary.label} · ${initPart} · Model: ${baselineRun.modelName ?? 'Not reported'} · Inference: ${baselineRun.inferenceMs.toFixed(1)} ms`;
    const dataUrl = mapRef.current.exportPngDataUrl({
      title,
      subtitle,
      watermarkText: baselineRun.isSyntheticFixture
        ? SYNTHETIC_WATERMARK
        : undefined,
    });
    if (!dataUrl) return;

    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    const suffix = isDifferenceMode
      ? `day${dayB}-minus-day${dayA}`
      : `day${clampedDay}`;
    anchor.download = `monsoon-twin-${selectedVariable}-${suffix}${baselineRun.isSyntheticFixture ? '-SYNTHETIC-FIXTURE' : ''}.png`;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setExportNotice('Exported map PNG directly in browser.');
  };

  const handleExportCsv = () => {
    if (!baselineRun || !loadedIc || dailySeries.length === 0) return;
    const csv = buildTimeSeriesCsv(dailySeries, {
      variable: selectedVariable,
      region: selectedRegion,
      modelName: baselineRun.modelName,
      icLabel: loadedIc.summary.label,
      initDateIso,
      inferenceMs: baselineRun.inferenceMs,
      roundTripMs: baselineRun.roundTripMs,
      isSyntheticFixture: baselineRun.isSyntheticFixture,
    });
    const fileName = `monsoon-twin-${selectedVariable}-series${baselineRun.isSyntheticFixture ? '-SYNTHETIC-FIXTURE' : ''}.csv`;
    triggerClientFileDownload(csv, fileName, 'text/csv;charset=utf-8');
    setExportNotice('Exported daily time-series CSV directly in browser.');
  };

  // STATE 1: No initial-conditions file loaded — full-width 2-pane initialization workstation
  if (!loadedIc) {
    return (
      <div className="workstation-canvas">
        <WorkflowGuideStrip currentRoute="/twin" />

        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 space-y-6">
          <header className="flex flex-col gap-2 border-b border-[#1E2F4A] pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#5CC8E0]">
                Climate Twin Console · /twin · 32 × 36 Discrete 1° Grid
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-[#E6EDF7]">
                Climate Twin Dashboard
              </h1>
            </div>
            <p className="max-w-xl text-sm text-[#93A4BD]">
              Inspect 1–10 day physical rollouts across India with cos(latitude) regional averages, wind vectors, Day A vs Day B comparisons, and browser-local exports.
            </p>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-12 border border-[#1E2F4A] bg-[#08101D] divide-y lg:divide-y-0 lg:divide-x divide-[#1E2F4A]">
            {/* Left 5 cols: Honest prerequisites + direct IC dropzone */}
            <div className="lg:col-span-5 divide-y divide-[#1E2F4A]">
              <section
                aria-labelledby="twin-empty-state-heading"
                className="p-5 sm:p-6 space-y-4"
              >
                <div className="space-y-2">
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#F2A93B]">
                    Live model input required
                  </p>
                  <h2
                    id="twin-empty-state-heading"
                    className="text-lg font-semibold text-[#E6EDF7]"
                  >
                    Connected backend and validated initial conditions required
                  </h2>
                  <p className="text-sm leading-relaxed text-[#93A4BD]">
                    No forecast fields are displayed until a validated{' '}
                    <code className="font-mono text-[#BFE6F2]">mom-ic-v1</code>{' '}
                    initial-conditions file is loaded and an actual{' '}
                    <code className="font-mono text-[#BFE6F2]">POST /simulate</code>{' '}
                    rollout completes against your configured backend (
                    <code className="font-mono text-[#BFE6F2]">
                      {apiConfig.activeBaseUrl}
                    </code>
                    ). Synthetic fallback outputs are never substituted silently.
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
                    <dd
                      className={
                        lastHealth
                          ? lastHealth.ready
                            ? 'text-[#5FC9A0]'
                            : 'text-[#F2A93B]'
                          : 'text-[#93A4BD]'
                      }
                    >
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

                <div className="flex flex-wrap items-center gap-2.5">
                  <Link
                    to="/status"
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-xs bg-[#5CC8E0] px-4 py-2 text-sm font-semibold text-[#08101D] hover:bg-[#BFE6F2] transition-colors duration-150 whitespace-nowrap"
                  >
                    <span>Open Backend Status &amp; IC Loader</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>

                  {fixtureModeAllowed && (
                    <button
                      type="button"
                      onClick={() => void activateDevSyntheticFixture()}
                      className="inline-flex min-h-[42px] items-center gap-2 rounded-xs border border-[#F2A93B] bg-[#060B14] px-3.5 py-2 font-mono text-xs font-medium text-[#F2A93B] hover:bg-[#142238] transition-colors duration-150 whitespace-nowrap"
                    >
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                      <span>Load synthetic dev fixture (not model output)</span>
                    </button>
                  )}
                </div>
              </section>

              <section
                aria-labelledby="twin-direct-ic-heading"
                className="p-5 sm:p-6 space-y-3"
              >
                <div className="space-y-1">
                  <h2
                    id="twin-direct-ic-heading"
                    className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]"
                  >
                    Load initial conditions directly
                  </h2>
                  <p className="text-xs text-[#93A4BD] leading-relaxed">
                    Validated locally in browser memory against the{' '}
                    <code className="font-mono text-[#BFE6F2]">mom-ic-v1</code>{' '}
                    schema — never uploaded to third-party servers.
                  </p>
                </div>
                <IcFileDropzone />
              </section>
            </div>

            {/* Right 7 cols: Dominant 32x36 Contract Grid Preview Stage */}
            <div className="lg:col-span-7 bg-[#050A12] p-4 sm:p-5 space-y-4">
              <ContractGridPreviewCanvas
                selectedRegion={selectedRegion}
                title="Round 1 Contract Spatial Grid · 32 × 36 (1° Resolution)"
                subtitle="6.5–37.5°N × 65.5–100.5°E · Coarse physical land/sea silhouette (no political borders)"
                testId="twin-contract-grid-preview"
              />

              <section
                aria-label="Inspect preset analysis regions on empty grid"
                className="border border-[#1E2F4A] bg-[#08101D] p-3.5 space-y-2.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-mono text-xs font-semibold text-[#E6EDF7]">
                    Inspect analysis region boxes before running
                  </p>
                  <span className="font-mono text-[11px] text-[#93A4BD] tabular-nums">
                    {selectedRegion.latMin.toFixed(1)}–{selectedRegion.latMax.toFixed(1)}°N,{' '}
                    {selectedRegion.lonMin.toFixed(1)}–{selectedRegion.lonMax.toFixed(1)}°E
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
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
              </section>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // STATE 2 & 3: IC loaded — full-width 1600px Atmospheric Workstation
  return (
    <div className="workstation-canvas" data-testid="twin-dashboard-workspace">
      <WorkflowGuideStrip currentRoute="/twin" />

      {/* Compact Workstation Command Strip (keeps India map above the fold at 1440x900) */}
      <header className="border-b border-[#1E2F4A] bg-[#08101D]">
        <div className="mx-auto max-w-[1600px] px-4 py-3 sm:px-6 lg:px-8 flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 space-y-0.5">
            <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-[#E6EDF7] truncate">
              {baselineRun
                ? isDifferenceMode
                  ? `${vMeta.label} — Day ${dayB}${dayBDate.shortDate ? ` (${dayBDate.shortDate})` : ''} minus Day ${dayA}${dayADate.shortDate ? ` (${dayADate.shortDate})` : ''}`
                  : `${vMeta.label} — Forecast Day ${clampedDay} of ${baselineRun.steps}${dayDate.longDate ? ` (${dayDate.longDate})` : ''}`
                : 'Climate Twin Dashboard'}
            </h1>
            <p className="font-mono text-[11px] text-[#93A4BD] tabular-nums truncate">
              IC: <span className="text-[#E6EDF7]">{loadedIc.summary.label}</span>
              {' · '}
              {initDateIso ? (
                <>
                  Init:{' '}
                  <span className="text-[#BFE6F2]">
                    {formatCalendarDate(initDateIso, 'long')}
                  </span>
                </>
              ) : (
                <span>Init date: Not specified in IC</span>
              )}
              {' · '}Grid: 32×36 ({loadedIc.summary.latOrientation} /{' '}
              {loadedIc.summary.lonOrientation})
              {' · '}Backend: {apiConfig.activeBaseUrl}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!loadedIc.isSyntheticFixture && (
              <button
                type="button"
                disabled={isRunning}
                onClick={() =>
                  void runBaselineSimulation({
                    steps: 10,
                    forceRefresh: Boolean(baselineRun),
                  })
                }
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xs bg-[#5CC8E0] px-3.5 py-1.5 text-xs font-semibold text-[#08101D] hover:bg-[#BFE6F2] disabled:opacity-50 transition-colors duration-150 whitespace-nowrap"
              >
                {isRunning ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>
                  {baselineRun
                    ? 'Re-run 10-day baseline'
                    : 'Run 10-day baseline simulation'}
                </span>
              </button>
            )}

            {isRunning && (
              <button
                type="button"
                onClick={cancelSimulation}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xs border border-[#E5646B] bg-[#060B14] px-3 py-1.5 text-xs font-mono text-[#E5646B] hover:bg-[#142238] transition-colors duration-150 whitespace-nowrap"
              >
                <Square className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Cancel simulation</span>
              </button>
            )}

            {baselineRun && (
              <>
                <button
                  type="button"
                  onClick={handleExportPng}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xs border border-[#1E2F4A] bg-[#0E1829] px-3 py-1.5 text-xs font-mono text-[#E6EDF7] hover:border-[#5CC8E0] hover:text-[#BFE6F2] transition-colors duration-150 whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Export Map PNG</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xs border border-[#1E2F4A] bg-[#0E1829] px-3 py-1.5 text-xs font-mono text-[#E6EDF7] hover:border-[#5CC8E0] hover:text-[#BFE6F2] transition-colors duration-150 whitespace-nowrap"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Export Chart CSV</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() =>
                loadedIc.isSyntheticFixture
                  ? clearSyntheticFixture()
                  : setLoadedIc(null)
              }
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xs border border-[#1E2F4A] bg-[#060B14] px-3 py-1.5 text-xs font-mono text-[#93A4BD] hover:border-[#E5646B] hover:text-[#E5646B] transition-colors duration-150 whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {loadedIc.isSyntheticFixture ? 'Unload fixture' : 'Unload IC'}
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        {/* Status / Error / Export notices */}
        {(isRunning ||
          (simulationStatus === 'cancelled' && !isRunning) ||
          (simulationStatus === 'error' && simulationError) ||
          exportNotice) && (
          <div className="pt-3 space-y-2.5">
            {isRunning && (
              <div
                role="status"
                data-testid="simulation-loading-banner"
                className="overflow-hidden border border-[#5CC8E0]/60 bg-[#0E1829]"
              >
                <div className="atlas-loading-bar" aria-hidden="true" />
                <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs font-mono text-[#E6EDF7]">
                    <Loader2
                      className="h-4 w-4 animate-spin text-[#5CC8E0] shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      {simulationStatus === 'connecting'
                        ? `Verifying backend readiness at ${apiConfig.activeBaseUrl}/health…`
                        : `Running 10-step baseline simulation (perturbation: null) against ${apiConfig.activeBaseUrl}/simulate…`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={cancelSimulation}
                    className="min-h-[34px] rounded-xs border border-[#E5646B] px-3 py-1 font-mono text-xs text-[#E5646B] hover:bg-[#142238] whitespace-nowrap"
                  >
                    Cancel request
                  </button>
                </div>
              </div>
            )}

            {simulationStatus === 'cancelled' && !isRunning && (
              <div
                role="status"
                data-testid="simulation-cancelled-banner"
                className="border border-[#F2A93B]/60 bg-[#0E1829] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-[#F2A93B]"
              >
                <span>
                  In-flight simulation request was cancelled. No partial or synthetic
                  data was rendered.
                </span>
                {!loadedIc.isSyntheticFixture && (
                  <button
                    type="button"
                    onClick={() => void runBaselineSimulation({ steps: 10 })}
                    className="min-h-[34px] rounded-xs border border-[#F2A93B] bg-[#060B14] px-3 py-1 font-mono text-xs text-[#F2A93B] hover:bg-[#142238] whitespace-nowrap"
                  >
                    Retry baseline run
                  </button>
                )}
              </div>
            )}

            {simulationStatus === 'error' && simulationError && (
              <div
                role="alert"
                data-testid="simulation-error-banner"
                className="border border-[#E5646B]/70 bg-[#142238] p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="font-mono text-xs font-semibold text-[#E5646B]">
                    {getApiErrorTitle(simulationError.kind)}
                    {simulationError.statusCode
                      ? ` (HTTP ${simulationError.statusCode})`
                      : ''}
                  </p>
                  <Link
                    to="/status"
                    className="font-mono text-xs text-[#5CC8E0] underline hover:text-[#BFE6F2]"
                  >
                    Inspect backend diagnostics on /status
                  </Link>
                </div>
                <p className="text-sm text-[#E6EDF7]">{simulationError.message}</p>
                {simulationError.details && simulationError.details.length > 0 && (
                  <p className="font-mono text-xs text-[#93A4BD]">
                    {simulationError.details.join(' · ')}
                  </p>
                )}
              </div>
            )}

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
          </div>
        )}

        {/* STATE 2: IC loaded, awaiting baseline simulation */}
        {!baselineRun && (
          <div className="py-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 border border-[#1E2F4A] bg-[#08101D] divide-y lg:divide-y-0 lg:divide-x divide-[#1E2F4A]">
              <section
                aria-labelledby="ready-to-simulate-heading"
                className="lg:col-span-5 p-6 space-y-5 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#5FC9A0]">
                      Initial state validated · Ready to forecast
                    </p>
                    <h2
                      id="ready-to-simulate-heading"
                      className="text-xl font-semibold text-[#E6EDF7]"
                    >
                      Initial conditions validated — ready to run baseline forecast
                    </h2>
                    <p className="text-sm leading-relaxed text-[#93A4BD]">
                      Baseline simulations send{' '}
                      <code className="font-mono text-[#BFE6F2]">
                        perturbation: null
                      </code>{' '}
                      and <code className="font-mono text-[#BFE6F2]">steps: 10</code>{' '}
                      to{' '}
                      <code className="font-mono text-[#BFE6F2]">POST /simulate</code>.
                      Results are cached in browser memory per IC file, endpoint, and
                      step count.
                    </p>
                  </div>

                  <dl className="divide-y divide-[#1E2F4A] border-y border-[#1E2F4A] font-mono text-xs">
                    <div className="flex items-baseline justify-between gap-2 py-2.5">
                      <dt className="text-[#93A4BD]">IC file</dt>
                      <dd className="text-[#E6EDF7]">{loadedIc.summary.label}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 py-2.5">
                      <dt className="text-[#93A4BD]">Initialization date</dt>
                      <dd className={initDateIso ? 'text-[#5CC8E0]' : 'text-[#93A4BD]'}>
                        {initDateIso
                          ? `${formatCalendarDate(initDateIso, 'long')} (${initDateIso})`
                          : 'Not specified in IC metadata'}
                      </dd>
                    </div>
                    {forecastWindowLabel && (
                      <div className="flex items-baseline justify-between gap-2 py-2.5">
                        <dt className="text-[#93A4BD]">10-day forecast window</dt>
                        <dd className="text-[#E6EDF7]">{forecastWindowLabel}</dd>
                      </div>
                    )}
                    <div className="flex items-baseline justify-between gap-2 py-2.5">
                      <dt className="text-[#93A4BD]">Grid orientation</dt>
                      <dd className="text-[#E6EDF7]">
                        {loadedIc.summary.latOrientation} ·{' '}
                        {loadedIc.summary.lonOrientation}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 py-2.5">
                      <dt className="text-[#93A4BD]">Land/sea mask</dt>
                      <dd className="text-[#E6EDF7]">
                        {loadedIc.summary.hasLandSeaMask
                          ? 'Included in IC file'
                          : 'Not present (optional)'}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-2">
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => void runBaselineSimulation({ steps: 10 })}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xs bg-[#5CC8E0] px-5 py-2.5 text-sm font-semibold text-[#08101D] hover:bg-[#BFE6F2] disabled:opacity-50 transition-colors duration-150 whitespace-nowrap"
                  >
                    <span>Run 10-day baseline simulation</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => void runBaselineSimulation({ steps: 1 })}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xs border border-[#2B4264] bg-[#060B14] px-4 py-2.5 font-mono text-xs text-[#E6EDF7] hover:border-[#5CC8E0] disabled:opacity-50 transition-colors duration-150 whitespace-nowrap"
                  >
                    Run 1-step quick check
                  </button>
                  <Link
                    to="/status"
                    className="inline-flex min-h-[40px] items-center px-2 font-mono text-xs text-[#93A4BD] hover:text-[#BFE6F2] underline"
                  >
                    Configure backend on /status
                  </Link>
                </div>
              </section>

              <div className="lg:col-span-7 bg-[#050A12] p-4 sm:p-5">
                <ContractGridPreviewCanvas
                  selectedRegion={selectedRegion}
                  title="Validated Initial-Condition Grid · 32 × 36 (1° Resolution)"
                  subtitle={`${gridExtents.latMin.toFixed(1)}–${gridExtents.latMax.toFixed(1)}°N × ${gridExtents.lonMin.toFixed(1)}–${gridExtents.lonMax.toFixed(1)}°E · Awaiting POST /simulate`}
                  testId="twin-ready-grid-preview"
                />
              </div>
            </div>
          </div>
        )}

        {/* STATE 3: Active 3-Zone Asymmetric Geospatial Split Console */}
        {baselineRun &&
          activeRawGrid &&
          u10Grid &&
          v10Grid &&
          colorScale &&
          activeDayPoint && (
            <div className="py-4 space-y-5">
              {/* PRIMARY WORKSTATION: Left Variable Rail (2 cols) | Center Dominant India Map + Timeline Dock (7 cols) | Right Live Telemetry & Region Rail (3 cols) */}
              <div className="grid grid-cols-1 xl:grid-cols-12 border border-[#1E2F4A] bg-[#08101D] divide-y xl:divide-y-0 xl:divide-x divide-[#1E2F4A]">
                {/* LEFT RAIL: Atmospheric Variable Selector + Day A vs Day B */}
                <aside
                  aria-label="Simulation controls"
                  className="xl:col-span-2 flex flex-col divide-y divide-[#1E2F4A]"
                >
                  <div className="p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#93A4BD]">
                        Atmospheric variable
                      </span>
                    </div>

                    <div
                      role="group"
                      aria-label="Select atmospheric variable"
                      className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-1 gap-1"
                    >
                      {DASHBOARD_VARIABLES.map((item) => {
                        const active = item.key === selectedVariable;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => setSelectedVariable(item.key)}
                            aria-pressed={active}
                            className={`relative flex flex-col items-start gap-1 rounded-xs border px-2.5 py-2 text-left font-mono text-xs transition-colors duration-150 ${
                              active
                                ? 'border-[#5CC8E0] bg-[#142238] text-[#E6EDF7] font-semibold'
                                : 'border-[#1E2F4A] bg-[#060B14] text-[#93A4BD] hover:border-[#5CC8E0]/50 hover:text-[#E6EDF7]'
                            }`}
                          >
                            {active && (
                              <span
                                className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#5CC8E0]"
                                aria-hidden="true"
                              />
                            )}
                            <span className="leading-tight">
                              {item.shortLabel}{' '}
                              <span className="text-[10px] opacity-80">
                                ({item.displayUnit})
                              </span>
                            </span>
                            <span
                              className="h-1 w-full rounded-xs opacity-90"
                              style={{
                                background: VARIABLE_SWATCH_GRADIENTS[item.key],
                              }}
                              aria-hidden="true"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Same-run Day A vs Day B comparison */}
                  <div className="p-3.5 space-y-2.5">
                    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#93A4BD]">
                      Temporal delta
                    </p>
                    <button
                      type="button"
                      disabled={baselineRun.steps < 2}
                      onClick={() => {
                        setIsPlaying(false);
                        setCompareMode((prev) => !prev);
                      }}
                      aria-pressed={isDifferenceMode}
                      className={`w-full inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xs border px-2.5 text-xs font-mono transition-colors duration-150 disabled:opacity-40 ${
                        isDifferenceMode
                          ? 'border-[#5CC8E0] bg-[#142238] text-[#BFE6F2]'
                          : 'border-[#1E2F4A] bg-[#060B14] text-[#93A4BD] hover:border-[#5CC8E0] hover:text-[#E6EDF7]'
                      }`}
                    >
                      <GitCompare className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Compare Day A vs Day B</span>
                    </button>

                    {isDifferenceMode && (
                      <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-xs">
                        <label className="space-y-1">
                          <span className="text-[11px] text-[#93A4BD]">Day A</span>
                          <select
                            aria-label="Comparison Day A"
                            value={dayA}
                            onChange={(e) => setDayA(Number(e.target.value))}
                            className="w-full min-h-[36px] rounded-xs border border-[#1E2F4A] bg-[#060B14] px-2 text-[#E6EDF7]"
                          >
                            {Array.from(
                              { length: baselineRun.steps },
                              (_, i) => i + 1,
                            ).map((d) => {
                              const optDate = resolveForecastDayDate(initDateIso, d);
                              return (
                                <option key={d} value={d}>
                                  {optDate.shortDate
                                    ? `Day ${d} · ${optDate.shortDate}`
                                    : `Day ${d}`}
                                </option>
                              );
                            })}
                          </select>
                        </label>

                        <label className="space-y-1">
                          <span className="text-[11px] text-[#93A4BD]">Day B</span>
                          <select
                            aria-label="Comparison Day B"
                            value={dayB}
                            onChange={(e) => setDayB(Number(e.target.value))}
                            className="w-full min-h-[36px] rounded-xs border border-[#1E2F4A] bg-[#060B14] px-2 text-[#E6EDF7]"
                          >
                            {Array.from(
                              { length: baselineRun.steps },
                              (_, i) => i + 1,
                            ).map((d) => {
                              const optDate = resolveForecastDayDate(initDateIso, d);
                              return (
                                <option key={d} value={d}>
                                  {optDate.shortDate
                                    ? `Day ${d} · ${optDate.shortDate}`
                                    : `Day ${d}`}
                                </option>
                              );
                            })}
                          </select>
                        </label>
                      </div>
                    )}
                  </div>
                </aside>

                {/* CENTER DOMINANT STAGE (~58% width): India Grid Map + Integrated Day 1-10 Timeline Dock + Scientific Legend */}
                <section
                  aria-label="Discrete atmospheric grid map"
                  className="xl:col-span-7 bg-[#050A12] flex flex-col justify-between"
                >
                  <div className="p-3.5 sm:p-4 space-y-3">
                    <GridMapCanvas
                      ref={mapRef}
                      rawGrid={activeRawGrid}
                      u10Grid={u10Grid}
                      v10Grid={v10Grid}
                      lat={loadedIc.data.grid.lat}
                      lon={loadedIc.data.grid.lon}
                      landSeaMask={loadedIc.data.static?.land_sea_mask}
                      variable={selectedVariable}
                      isDifferenceMode={isDifferenceMode}
                      colorScale={colorScale}
                      selectedRegion={selectedRegion}
                      showWindVectors={showWindVectors}
                      onToggleWindVectors={setShowWindVectors}
                      windStride={windStride}
                      onWindStrideChange={setWindStride}
                    />
                  </div>

                  {/* Integrated Forecast Day 1-10 Timeline & Playback Dock */}
                  <div className="border-t border-[#1E2F4A] bg-[#0A1323] px-3.5 py-3 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs tabular-nums">
                      <label
                        htmlFor="forecast-day-slider"
                        className="text-[#93A4BD]"
                      >
                        Forecast lead day (rollout[0] = Day 1)
                      </label>
                      <span className="text-[#BFE6F2] font-semibold">
                        Day {clampedDay} of {baselineRun.steps}
                        {dayDate.longDate ? ` · Valid ${dayDate.longDate}` : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Previous forecast day"
                        disabled={clampedDay <= 1}
                        onClick={() => {
                          setIsPlaying(false);
                          setSelectedDay(Math.max(1, clampedDay - 1));
                        }}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xs border border-[#1E2F4A] bg-[#060B14] text-[#E6EDF7] hover:border-[#5CC8E0] disabled:opacity-40 transition-colors duration-150"
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        disabled={baselineRun.steps < 2}
                        onClick={handleTogglePlay}
                        aria-pressed={isPlaying}
                        className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xs border px-3 text-xs font-mono transition-colors duration-150 whitespace-nowrap disabled:opacity-40 ${
                          isPlaying
                            ? 'border-[#F2A93B] bg-[#142238] text-[#F2A93B]'
                            : 'border-[#1E2F4A] bg-[#060B14] text-[#E6EDF7] hover:border-[#5CC8E0]'
                        }`}
                      >
                        {isPlaying ? (
                          <>
                            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Pause</span>
                          </>
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Play</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        aria-label="Next forecast day"
                        disabled={clampedDay >= baselineRun.steps}
                        onClick={() => {
                          setIsPlaying(false);
                          setSelectedDay(Math.min(baselineRun.steps, clampedDay + 1));
                        }}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xs border border-[#1E2F4A] bg-[#060B14] text-[#E6EDF7] hover:border-[#5CC8E0] disabled:opacity-40 transition-colors duration-150"
                      >
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </button>

                      <input
                        id="forecast-day-slider"
                        type="range"
                        min={1}
                        max={baselineRun.steps}
                        step={1}
                        value={clampedDay}
                        onChange={(e) => {
                          setIsPlaying(false);
                          setSelectedDay(Number(e.target.value));
                        }}
                        className="atlas-slider w-full"
                      />
                    </div>

                    {baselineRun.steps > 1 && (
                      <div
                        className="grid gap-1"
                        style={{
                          gridTemplateColumns: `repeat(${baselineRun.steps}, minmax(0, 1fr))`,
                        }}
                        aria-label="Quick day selector"
                      >
                        {Array.from(
                          { length: baselineRun.steps },
                          (_, i) => i + 1,
                        ).map((d) => {
                          const dInfo = resolveForecastDayDate(initDateIso, d);
                          return (
                            <button
                              key={d}
                              type="button"
                              onClick={() => {
                                setIsPlaying(false);
                                setSelectedDay(d);
                              }}
                              title={
                                dInfo.longDate
                                  ? `Day ${d} · ${dInfo.longDate}`
                                  : `Day ${d}`
                              }
                              aria-current={d === clampedDay ? 'step' : undefined}
                              className={`py-1 rounded-xs font-mono text-[11px] tabular-nums transition-colors ${
                                d === clampedDay
                                  ? 'bg-[#5CC8E0] text-[#08101D] font-semibold'
                                  : 'bg-[#060B14] text-[#93A4BD] border border-[#1E2F4A]/70 hover:border-[#5CC8E0]/60 hover:text-[#E6EDF7]'
                              }`}
                            >
                              <span className="block leading-tight">D{d}</span>
                              {dInfo.shortDate && (
                                <span
                                  className={`block text-[9px] leading-tight ${
                                    d === clampedDay
                                      ? 'text-[#060B14] font-medium'
                                      : 'text-[#93A4BD]'
                                  }`}
                                >
                                  {dInfo.shortDate}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {reducedMotionWarning && (
                      <p className="font-mono text-xs text-[#F2A93B]">
                        Playback disabled because your system has
                        prefers-reduced-motion enabled. Use the day slider or step
                        buttons to inspect each day.
                      </p>
                    )}
                  </div>

                  {/* Flush Scientific Color Scale Legend */}
                  <ColorScaleLegend
                    scale={colorScale}
                    unit={vMeta.displayUnit}
                    decimals={vMeta.decimals}
                    isDifferenceMode={isDifferenceMode}
                    scaleRangeMode={scaleRangeMode}
                    onScaleRangeModeChange={setScaleRangeMode}
                  />
                </section>

                {/* RIGHT INSPECTOR RAIL: Live Day Telemetry + Geographic Region Box + Conventions */}
                <aside className="xl:col-span-3 divide-y divide-[#1E2F4A] flex flex-col">
                  {/* Live Day Quantitative Readout */}
                  <section
                    aria-label="Active day quick telemetry"
                    className="p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#5CC8E0]">
                        Day {activeDayPoint.day}
                        {dayDate.shortDate ? ` · ${dayDate.shortDate}` : ''} Field
                        Readout
                      </span>
                      <span className="font-mono text-[11px] text-[#93A4BD]">
                        {vMeta.displayUnit}
                      </span>
                    </div>
                    {dayDate.longDate && (
                      <p className="font-mono text-[11px] text-[#93A4BD] tabular-nums">
                        Valid {dayDate.longDate} ({dayDate.isoDate})
                      </p>
                    )}

                    <dl className="grid grid-cols-2 border border-[#1E2F4A] bg-[#060B14] divide-x divide-y divide-[#1E2F4A] font-mono tabular-nums">
                      <div className="p-2.5">
                        <dt className="text-[10px] uppercase text-[#93A4BD]">
                          Domain mean
                        </dt>
                        <dd className="text-lg font-semibold text-[#5CC8E0] mt-0.5">
                          {activeDayPoint.domain.weightedMean.toFixed(
                            vMeta.decimals,
                          )}
                        </dd>
                      </div>
                      <div className="p-2.5">
                        <dt className="text-[10px] uppercase text-[#93A4BD]">
                          Region mean
                        </dt>
                        <dd className="text-lg font-semibold text-[#BFE6F2] mt-0.5">
                          {Number.isFinite(activeDayPoint.region.weightedMean)
                            ? activeDayPoint.region.weightedMean.toFixed(
                                vMeta.decimals,
                              )
                            : '—'}
                        </dd>
                      </div>
                      <div className="p-2.5">
                        <dt className="text-[10px] uppercase text-[#93A4BD]">
                          Domain min
                        </dt>
                        <dd className="text-base font-medium text-[#E6EDF7] mt-0.5">
                          {activeDayPoint.domain.min.toFixed(vMeta.decimals)}
                        </dd>
                      </div>
                      <div className="p-2.5">
                        <dt className="text-[10px] uppercase text-[#93A4BD]">
                          Domain max
                        </dt>
                        <dd className="text-base font-medium text-[#F2A93B] mt-0.5">
                          {activeDayPoint.domain.max.toFixed(vMeta.decimals)}
                        </dd>
                      </div>
                    </dl>

                    <div className="font-mono text-[11px] text-[#93A4BD] space-y-1 tabular-nums">
                      <p>
                        Max loc:{' '}
                        <span className="text-[#E6EDF7]">
                          {activeDayPoint.domain.maxLocation
                            ? `${activeDayPoint.domain.maxLocation.lat.toFixed(1)}°N, ${activeDayPoint.domain.maxLocation.lon.toFixed(1)}°E`
                            : '—'}
                        </span>
                      </p>
                      <p>
                        Inference:{' '}
                        <span className="text-[#E6EDF7]">
                          {baselineRun.inferenceMs.toFixed(1)} ms
                        </span>{' '}
                        · {baselineRun.fromCache ? 'Cached' : 'Fresh'}
                      </p>
                    </div>
                  </section>

                  {/* Region selector */}
                  <section
                    aria-labelledby="region-selector-heading"
                    className="p-4 space-y-2.5"
                  >
                    <h2
                      id="region-selector-heading"
                      className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]"
                    >
                      Geographic Region Box
                    </h2>
                    <p className="text-xs text-[#93A4BD] leading-relaxed">
                      Area-weighted averages use{' '}
                      <code className="font-mono text-[#BFE6F2]">cos(latitude)</code>{' '}
                      weighting inside the orange dashed box.
                    </p>
                    <RegionSelector
                      selectedRegion={selectedRegion}
                      onSelectRegion={setSelectedRegion}
                      latMinLimit={gridExtents.latMin}
                      latMaxLimit={gridExtents.latMax}
                      lonMinLimit={gridExtents.lonMin}
                      lonMaxLimit={gridExtents.lonMax}
                    />
                  </section>

                  {/* Compact Collapsible Conventions & IC Swapper */}
                  <div className="p-4 space-y-3 text-xs text-[#93A4BD]">
                    <details>
                      <summary className="cursor-pointer font-mono text-xs text-[#BFE6F2] hover:text-[#5CC8E0]">
                        Physical &amp; Grid Conventions
                      </summary>
                      <dl className="mt-3 space-y-2 leading-relaxed">
                        <div>
                          <dt className="font-mono text-[#BFE6F2]">
                            Wind direction convention
                          </dt>
                          <dd className="mt-0.5">
                            Direction <strong>toward</strong> which wind blows:{' '}
                            <code className="font-mono text-[#E6EDF7]">
                              (atan2(u10, v10) × 180/π + 360) mod 360
                            </code>
                            . 0° = toward N, 90° = toward E. Speed ={' '}
                            <code className="font-mono text-[#E6EDF7]">
                              hypot(u10, v10)
                            </code>
                            .
                          </dd>
                        </div>
                        <div>
                          <dt className="font-mono text-[#BFE6F2]">
                            Raw state preservation
                          </dt>
                          <dd className="mt-0.5">
                            Backend responses remain untouched in{' '}
                            <code className="font-mono text-[#E6EDF7]">
                              Float32Array
                            </code>{' '}
                            state (K, mm/day, m/s, Pa, kg/m²). Display conversions occur only at render time.
                          </dd>
                        </div>
                        <div>
                          <dt className="font-mono text-[#BFE6F2]">
                            Day indexing &amp; orientation
                          </dt>
                          <dd className="mt-0.5">
                            Confirmed against{' '}
                            <code className="font-mono text-[#E6EDF7]">
                              docs/API_CONTRACT.md
                            </code>
                            : <code className="font-mono text-[#E6EDF7]">rollout[0]</code>{' '}
                            = Forecast Day 1. Orientation derived directly from IC{' '}
                            <code className="font-mono text-[#E6EDF7]">grid.lat</code>{' '}
                            and <code className="font-mono text-[#E6EDF7]">grid.lon</code>.
                          </dd>
                        </div>
                      </dl>
                    </details>

                    <details className="border-t border-[#1E2F4A] pt-3">
                      <summary className="cursor-pointer font-mono text-xs text-[#BFE6F2] hover:text-[#5CC8E0]">
                        Load a different mom-ic-v1 file
                      </summary>
                      <div className="pt-3">
                        <IcFileDropzone />
                      </div>
                    </details>
                  </div>
                </aside>
              </div>

              {/* SECONDARY BAND: Full-width Summary Telemetry Ledger + Daily Time-Series Chart */}
              <TwinSummaryPanel
                run={baselineRun}
                dayPoint={activeDayPoint}
                variable={selectedVariable}
                region={selectedRegion}
                comparisonDays={isDifferenceMode ? { dayA, dayB } : null}
                initDateIso={initDateIso}
              />

              <Suspense
                fallback={
                  <div
                    role="status"
                    className="instrument-plane rounded-xs p-5 font-mono text-xs text-[#93A4BD]"
                  >
                    Loading daily time-series chart…
                  </div>
                }
              >
                <VariableTimeSeriesChart
                  series={dailySeries}
                  variable={selectedVariable}
                  region={selectedRegion}
                  selectedDay={clampedDay}
                  onSelectDay={(day) => {
                    setIsPlaying(false);
                    setSelectedDay(day);
                  }}
                  initDateIso={initDateIso}
                />
              </Suspense>
            </div>
          )}
      </div>
    </div>
  );
}
