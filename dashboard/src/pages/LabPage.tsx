import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2,
} from 'lucide-react';
import { getApiErrorTitle } from '../api/errors';
import { IcFileDropzone } from '../components/IcFileDropzone';
import { WorkflowGuideStrip } from '../components/WorkflowGuideStrip';
import { LabIntegrityPanel } from '../components/lab/LabIntegrityPanel';
import { ShockBuilderPanel } from '../components/lab/ShockBuilderPanel';
import {
  clampSyncTransform,
  SyncFieldCanvas,
  type SyncFieldCanvasHandle,
  type SyncViewTransform,
} from '../components/lab/SyncFieldCanvas';
import { RegionSelector } from '../components/twin/RegionSelector';
import { useAppData } from '../context/AppDataContext';
import {
  computeVariableRange,
  createDashboardColorScale,
  createDivergingDifferenceScale,
} from '../utils/colorScales';
import {
  formatCalendarDate,
  resolveForecastDayDate,
} from '../utils/forecastDates';
import {
  computeExperimentFixedSymmetricRange,
  computeIntegrityDiagnostics,
  computeLabDayMetrics,
  computeScenarioMinusBaselineGrid,
} from '../utils/labDiagnostics';
import {
  forecastDayToStepIndex,
  getVariableGrid,
} from '../utils/rolloutStore';
import {
  CONTRACT_LAT,
  CONTRACT_LON,
  SCHEMATIC_LAND_SEA_MASK,
} from '../utils/schematicGeography';
import {
  buildPerturbationTensor,
  cloneShockConfig,
  SHOCK_PRESETS,
} from '../utils/shockBuilder';
import {
  DASHBOARD_VARIABLES,
  formatSignedDelta,
  getVariableMeta,
  toDisplayDelta,
  toDisplayValue,
} from '../utils/units';

export function LabPage() {
  const {
    apiConfig,
    loadedIc,
    lastHealth,
    baselineRun,
    scenarioRun,
    scenarioShockSnapshot,
    activeShockConfig,
    setActiveShockConfig,
    simulationStatus,
    simulationError,
    selectedVariable,
    setSelectedVariable,
    selectedDay,
    setSelectedDay,
    selectedRegion,
    setSelectedRegion,
    runScenarioSimulation,
    cancelSimulation,
    clearScenarioRun,
    clearSyntheticFixture,
  } = useAppData();

  const diffMapRef = useRef<SyncFieldCanvasHandle | null>(null);

  const [syncTransform, setSyncTransform] = useState<SyncViewTransform>({
    zoom: 1,
    panX: 0,
    panY: 0,
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [reducedMotionWarning, setReducedMotionWarning] = useState(false);
  const [diffThresholdStr, setDiffThresholdStr] = useState('0.5');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const isRunning =
    simulationStatus === 'connecting' || simulationStatus === 'loading';
  const isSyntheticFixture = Boolean(
    loadedIc?.isSyntheticFixture || baselineRun?.isSyntheticFixture,
  );

  const builtShock = useMemo(() => {
    if (!loadedIc) return null;
    return buildPerturbationTensor(
      activeShockConfig,
      loadedIc.data.grid.lat,
      loadedIc.data.grid.lon,
    );
  }, [loadedIc, activeShockConfig]);

  const emptyPreviewShock = useMemo(() => {
    if (loadedIc) return null;
    return buildPerturbationTensor(
      activeShockConfig,
      CONTRACT_LAT,
      CONTRACT_LON,
    );
  }, [loadedIc, activeShockConfig]);

  const emptyPreviewChannel = useMemo(() => {
    const firstActive = activeShockConfig.channels.find(
      (c) => c.enabled && c.peakDelta !== 0,
    );
    return firstActive?.channel ?? 't2m';
  }, [activeShockConfig]);

  const emptyPreviewScale = useMemo(() => {
    if (!emptyPreviewShock) return createDivergingDifferenceScale([-1, 1]);
    const maxAbs = Math.max(
      emptyPreviewShock.maxAbsByChannel[emptyPreviewChannel] ?? 0,
      0.5,
    );
    return createDivergingDifferenceScale([-maxAbs, maxAbs]);
  }, [emptyPreviewShock, emptyPreviewChannel]);

  const hasValidExperiment = Boolean(
    baselineRun &&
      scenarioRun &&
      !baselineRun.isSyntheticFixture &&
      !scenarioRun.isSyntheticFixture,
  );

  const totalSteps = hasValidExperiment
    ? Math.min(baselineRun!.steps, scenarioRun!.steps)
    : 10;
  const clampedDay = Math.min(Math.max(1, selectedDay), totalSteps);
  const stepIndex = hasValidExperiment
    ? forecastDayToStepIndex(clampedDay, totalSteps)
    : 0;
  const initDateIso = loadedIc?.summary.initDateIso ?? null;
  const dayInfo = resolveForecastDayDate(initDateIso, clampedDay);

  useEffect(() => {
    if (!isPlaying || !hasValidExperiment || totalSteps < 2) return;
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
      setSelectedDay(selectedDay >= totalSteps ? 1 : selectedDay + 1);
    }, 950);
    return () => window.clearInterval(timer);
  }, [isPlaying, hasValidExperiment, totalSteps, selectedDay, setSelectedDay]);

  const vMeta = getVariableMeta(selectedVariable);

  const comparisonFields = useMemo(() => {
    if (!hasValidExperiment || !baselineRun || !scenarioRun) return null;

    const baseRaw = getVariableGrid(
      baselineRun.packedRollout,
      stepIndex,
      selectedVariable,
    );
    const scenRaw = getVariableGrid(
      scenarioRun.packedRollout,
      stepIndex,
      selectedVariable,
    );
    const diffRaw = computeScenarioMinusBaselineGrid(
      baselineRun.packedRollout,
      scenarioRun.packedRollout,
      stepIndex,
      selectedVariable,
    );

    const baseDisp = new Float32Array(baseRaw.length);
    const scenDisp = new Float32Array(scenRaw.length);
    const diffDisp = new Float32Array(diffRaw.length);
    for (let i = 0; i < baseRaw.length; i += 1) {
      baseDisp[i] = toDisplayValue(selectedVariable, baseRaw[i]);
      scenDisp[i] = toDisplayValue(selectedVariable, scenRaw[i]);
      diffDisp[i] = toDisplayDelta(selectedVariable, diffRaw[i]);
    }

    const bRange = computeVariableRange(
      baselineRun.packedRollout,
      selectedVariable,
      'fixed-run',
      stepIndex,
    );
    const sRange = computeVariableRange(
      scenarioRun.packedRollout,
      selectedVariable,
      'fixed-run',
      stepIndex,
    );
    const sharedStateDomain: [number, number] = [
      Math.min(bRange[0], sRange[0]),
      Math.max(bRange[1], sRange[1]),
    ];

    const stateScale = createDashboardColorScale(
      selectedVariable,
      sharedStateDomain,
    );

    const fixedDiffDomain = computeExperimentFixedSymmetricRange(
      baselineRun.packedRollout,
      scenarioRun.packedRollout,
      selectedVariable,
    );
    const diffScale = createDivergingDifferenceScale(fixedDiffDomain);

    return {
      baseDisp,
      scenDisp,
      diffDisp,
      stateScale,
      diffScale,
      diffLimit: fixedDiffDomain[1],
    };
  }, [hasValidExperiment, baselineRun, scenarioRun, stepIndex, selectedVariable]);

  const parsedThreshold = useMemo(() => {
    const n = Number(diffThresholdStr);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [diffThresholdStr]);

  const dayMetrics = useMemo(() => {
    if (!hasValidExperiment || !baselineRun || !scenarioRun || !loadedIc) {
      return null;
    }
    return computeLabDayMetrics(
      baselineRun.packedRollout,
      scenarioRun.packedRollout,
      stepIndex,
      selectedVariable,
      loadedIc.data.grid.lat,
      loadedIc.data.grid.lon,
      parsedThreshold,
    );
  }, [
    hasValidExperiment,
    baselineRun,
    scenarioRun,
    loadedIc,
    stepIndex,
    selectedVariable,
    parsedThreshold,
  ]);

  const activeFootprintMask =
    scenarioShockSnapshot?.footprintMask ?? builtShock?.footprintMask ?? null;

  const integrityReport = useMemo(() => {
    if (
      !hasValidExperiment ||
      !baselineRun ||
      !scenarioRun ||
      !activeFootprintMask
    ) {
      return null;
    }
    return computeIntegrityDiagnostics(
      baselineRun.packedRollout,
      scenarioRun.packedRollout,
      selectedVariable,
      activeFootprintMask,
    );
  }, [
    hasValidExperiment,
    baselineRun,
    scenarioRun,
    selectedVariable,
    activeFootprintMask,
  ]);

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

  const handleRunExperiment = async () => {
    if (!loadedIc || !builtShock || !builtShock.ok || isSyntheticFixture) {
      return;
    }
    setIsPlaying(false);
    await runScenarioSimulation({
      perturbation: builtShock.perturbation,
      label: activeShockConfig.name,
      steps: 10,
      shockSnapshot: {
        config: cloneShockConfig(activeShockConfig),
        footprintMask: new Uint8Array(builtShock.footprintMask),
        isAllZero: builtShock.isAllZero,
      },
    });
  };

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

  const handleExportDiffPng = () => {
    if (!diffMapRef.current || !baselineRun || !scenarioRun || !loadedIc) return;
    const initPart = initDateIso
      ? `Init: ${formatCalendarDate(initDateIso, 'long')} (${initDateIso})`
      : 'Init date: Not in IC metadata';
    const dataUrl = diffMapRef.current.exportPngDataUrl({
      title: `Scenario − Baseline · ${vMeta.label} · ${dayInfo.displayLabel}`,
      subtitle: `Shock: ${scenarioRun.scenarioLabel ?? activeShockConfig.name} · IC: ${loadedIc.summary.label} · ${initPart} · Fixed symmetric ±${comparisonFields?.diffLimit.toFixed(2)} ${vMeta.displayUnit}`,
    });
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `monsoon-lab-diff-${selectedVariable}-day${clampedDay}.png`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setExportNotice(
      'Exported synchronized difference map PNG directly in browser.',
    );
  };

  // STATE 1: No initial-conditions file loaded — full-width 2-pane live geometry preview
  if (!loadedIc) {
    const previewMeta = getVariableMeta(emptyPreviewChannel);
    const previewGrid =
      emptyPreviewShock?.previewGrids[emptyPreviewChannel] ??
      new Float32Array(32 * 36);

    return (
      <div className="workstation-canvas">
        <WorkflowGuideStrip currentRoute="/lab" />

        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 space-y-6">
          <header className="flex flex-col gap-2 border-b border-[#1E2F4A] pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#5CC8E0]">
                Experiment Workbench · /lab · Live Shock Builder
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-[#E6EDF7]">
                Experiment Laboratory &amp; Live Shock Builder
              </h1>
            </div>
            <p className="max-w-xl text-sm text-[#93A4BD]">
              Construct box or Gaussian physical perturbations ([6, 32, 36]),
              run sequential baseline and scenario rollouts, and compare
              Scenario minus Baseline fields across Days 1–10.
            </p>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-12 border border-[#1E2F4A] bg-[#08101D] divide-y lg:divide-y-0 lg:divide-x divide-[#1E2F4A]">
            {/* Left 5 cols: Prerequisites + IC Dropzone */}
            <div className="lg:col-span-5 divide-y divide-[#1E2F4A]">
              <section
                aria-labelledby="lab-empty-heading"
                className="p-5 sm:p-6 space-y-4"
              >
                <div className="space-y-2">
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#F2A93B]">
                    Live model input required
                  </p>
                  <h2
                    id="lab-empty-heading"
                    className="text-lg font-semibold text-[#E6EDF7]"
                  >
                    Connected backend and validated initial conditions required
                  </h2>
                  <p className="text-sm leading-relaxed text-[#93A4BD]">
                    Load a validated{' '}
                    <code className="font-mono text-[#BFE6F2]">mom-ic-v1</code>{' '}
                    initial-conditions file to activate the Live Shock Builder and
                    run real counterfactual experiments against{' '}
                    <code className="font-mono text-[#BFE6F2]">
                      {apiConfig.activeBaseUrl}
                    </code>
                    . Experimental perturbations are exploratory model sensitivity
                    tests, not validated climate projections.
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
                aria-labelledby="lab-direct-ic-heading"
                className="p-5 sm:p-6 space-y-3"
              >
                <h2
                  id="lab-direct-ic-heading"
                  className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]"
                >
                  Load initial conditions directly
                </h2>
                <IcFileDropzone />
              </section>
            </div>

            {/* Right 7 cols: Interactive Real Perturbation Geometry Preview */}
            <section
              aria-labelledby="lab-preview-heading"
              className="lg:col-span-7 bg-[#050A12] p-4 sm:p-5 space-y-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#1E2F4A] pb-3">
                <div>
                  <h2
                    id="lab-preview-heading"
                    className="font-mono text-xs font-semibold text-[#E6EDF7]"
                  >
                    Live Perturbation Geometry Preview · [6, 32, 36]
                  </h2>
                  <p className="font-mono text-[11px] text-[#93A4BD]">
                    Geometry preview only · Load mom-ic-v1 to run live baseline + scenario
                  </p>
                </div>
                <span className="font-mono text-[11px] text-[#F2A93B] tabular-nums">
                  {emptyPreviewShock?.selectedCellCount ?? 0} cells in footprint
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  className="flex flex-wrap gap-1.5"
                  role="group"
                  aria-label="Preview perturbation preset"
                >
                  {SHOCK_PRESETS.map((preset) => {
                    const active = activeShockConfig.presetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setActiveShockConfig(cloneShockConfig(preset.config))
                        }
                        className={`min-h-[34px] rounded-xs border px-2.5 py-1 font-mono text-[11px] transition-colors whitespace-nowrap ${
                          active
                            ? 'border-[#5CC8E0] bg-[#142238] text-[#BFE6F2] font-semibold'
                            : 'border-[#1E2F4A] bg-[#08101D] text-[#93A4BD] hover:border-[#5CC8E0]/60 hover:text-[#E6EDF7]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                <div className="inline-flex rounded-xs border border-[#1E2F4A] bg-[#08101D] p-0.5 font-mono text-[11px]">
                  {(['box', 'gaussian'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={activeShockConfig.footprintType === mode}
                      onClick={() =>
                        setActiveShockConfig({
                          ...activeShockConfig,
                          footprintType: mode,
                        })
                      }
                      className={`rounded-xs px-2.5 py-1 transition-colors ${
                        activeShockConfig.footprintType === mode
                          ? 'bg-[#5CC8E0] text-[#08101D] font-semibold'
                          : 'text-[#93A4BD] hover:text-[#E6EDF7]'
                      }`}
                    >
                      {mode === 'box' ? 'Box' : 'Gaussian'}
                    </button>
                  ))}
                </div>
              </div>

              <SyncFieldCanvas
                displayGrid={previewGrid}
                lat={CONTRACT_LAT}
                lon={CONTRACT_LON}
                landSeaMask={SCHEMATIC_LAND_SEA_MASK}
                colorScale={emptyPreviewScale}
                unitLabel={previewMeta.rawUnit}
                decimals={2}
                signed
                compact
                footprintMask={emptyPreviewShock?.footprintMask}
                title={`Channel Δ preview: ${previewMeta.shortLabel} (${activeShockConfig.name})`}
                ariaLabel={`Interactive perturbation geometry preview for ${previewMeta.label}. No model forecast loaded.`}
                testId="lab-empty-shock-preview-canvas"
              />
            </section>
          </div>
        </div>
      </div>
    );
  }

  // STATE 2: Synthetic fixture blocked
  if (isSyntheticFixture) {
    return (
      <div className="workstation-canvas">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
          <div
            role="alert"
            className="border border-[#F2A93B] bg-[#142238] p-6 space-y-4"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="h-5 w-5 text-[#F2A93B] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="space-y-1.5">
                <h1 className="font-display text-xl font-semibold text-[#E6EDF7]">
                  Synthetic dev fixture cannot be used in Experiment Lab
                </h1>
                <p className="text-sm text-[#93A4BD] leading-relaxed">
                  Perturbation experiments and difference diagnostics require
                  actual backend rollouts from a validated local{' '}
                  <code className="font-mono text-[#BFE6F2]">mom-ic-v1</code>{' '}
                  file. Unload the synthetic fixture first.
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

  // STATE 3: Active Experiment Workbench
  return (
    <div className="workstation-canvas" data-testid="lab-workspace">
      <WorkflowGuideStrip currentRoute="/lab" />

      {/* Compact Workstation Header Bar */}
      <header className="border-b border-[#1E2F4A] bg-[#08101D]">
        <div className="mx-auto max-w-[1600px] px-4 py-3 sm:px-6 lg:px-8 flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 space-y-0.5">
            <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-[#E6EDF7]">
              Counterfactual Shock Experiments
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
              {' · '}Backend: {apiConfig.activeBaseUrl}
              {' · '}Experimental perturbations are sensitivity tests, not validated climate projections.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isRunning || !builtShock?.ok}
              onClick={() => void handleRunExperiment()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xs bg-[#5CC8E0] px-4 py-1.5 text-xs font-semibold text-[#08101D] hover:bg-[#BFE6F2] disabled:opacity-50 transition-colors duration-150 whitespace-nowrap"
            >
              {isRunning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>Run baseline + scenario (10 days)</span>
            </button>

            {isRunning && (
              <button
                type="button"
                onClick={cancelSimulation}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xs border border-[#E5646B] bg-[#060B14] px-3 py-1.5 text-xs font-mono text-[#E5646B] hover:bg-[#142238] whitespace-nowrap"
              >
                <Square className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Cancel run</span>
              </button>
            )}

            {scenarioRun && (
              <button
                type="button"
                onClick={clearScenarioRun}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xs border border-[#1E2F4A] bg-[#060B14] px-3 py-1.5 font-mono text-xs text-[#93A4BD] hover:border-[#E5646B] hover:text-[#E5646B] whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Clear scenario</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 space-y-5">
        {/* Running / Cancelled / Error banners */}
        {isRunning && (
          <div
            role="status"
            data-testid="lab-loading-banner"
            className="overflow-hidden border border-[#5CC8E0]/60 bg-[#0E1829]"
          >
            <div className="atlas-loading-bar" aria-hidden="true" />
            <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-[#E6EDF7]">
              <div className="flex items-center gap-2.5">
                <Loader2
                  className="h-4 w-4 animate-spin text-[#5CC8E0]"
                  aria-hidden="true"
                />
                <span>
                  {simulationStatus === 'connecting'
                    ? `Checking backend readiness at ${apiConfig.activeBaseUrl}/health…`
                    : 'Executing sequential baseline (cached or fresh) and perturbed scenario rollout…'}
                </span>
              </div>
              <button
                type="button"
                onClick={cancelSimulation}
                className="min-h-[34px] rounded-xs border border-[#E5646B] px-3 py-1 font-mono text-xs text-[#E5646B] hover:bg-[#142238]"
              >
                Cancel request
              </button>
            </div>
          </div>
        )}

        {simulationStatus === 'cancelled' && !isRunning && (
          <div
            role="status"
            data-testid="lab-cancelled-banner"
            className="border border-[#F2A93B]/60 bg-[#0E1829] px-4 py-3 text-xs font-mono text-[#F2A93B]"
          >
            In-flight experiment request was cancelled. No partial or synthetic
            results were rendered.
          </div>
        )}

        {simulationStatus === 'error' && simulationError && (
          <div
            role="alert"
            data-testid="lab-error-banner"
            className="border border-[#E5646B]/70 bg-[#142238] p-4 space-y-1.5"
          >
            <p className="font-mono text-xs font-semibold text-[#E5646B]">
              {getApiErrorTitle(simulationError.kind)}
              {simulationError.statusCode
                ? ` (HTTP ${simulationError.statusCode})`
                : ''}
            </p>
            <p className="text-sm text-[#E6EDF7]">{simulationError.message}</p>
          </div>
        )}

        {/* 1. Synchronized 3-Map Comparison Stage — placed prominently when experiment is active */}
        {hasValidExperiment &&
          baselineRun &&
          scenarioRun &&
          comparisonFields &&
          dayMetrics &&
          integrityReport && (
            <div className="space-y-5" data-testid="lab-comparison-stage">
              {/* Synchronized Experiment Controls Console */}
              <section
                aria-label="Synchronized experiment controls"
                className="instrument-plane rounded-xs divide-y divide-[#1E2F4A]"
              >
                <div className="px-5 py-3.5 bg-[#08101D] flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]">
                      Synchronized Comparison — {vMeta.label} · Day {clampedDay}{' '}
                      of {totalSteps}
                      {dayInfo.longDate ? ` (${dayInfo.longDate})` : ''}
                    </h2>
                    <p className="font-mono text-[11px] text-[#93A4BD] tabular-nums">
                      Active scenario:{' '}
                      <span className="text-[#F2A93B]">
                        {scenarioRun.scenarioLabel}
                      </span>
                      {' · '}Baseline inference:{' '}
                      {baselineRun.inferenceMs.toFixed(1)} ms
                      {baselineRun.fromCache ? ' (cached)' : ''}
                      {' · '}Scenario inference:{' '}
                      {scenarioRun.inferenceMs.toFixed(1)} ms
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="Zoom in all comparison maps"
                      onClick={() =>
                        setSyncTransform((t) =>
                          clampSyncTransform({ ...t, zoom: t.zoom * 1.25 }),
                        )
                      }
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xs border border-[#1E2F4A] bg-[#060B14] text-[#E6EDF7] hover:border-[#5CC8E0]"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Zoom out all comparison maps"
                      onClick={() =>
                        setSyncTransform((t) =>
                          clampSyncTransform({ ...t, zoom: t.zoom / 1.25 }),
                        )
                      }
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xs border border-[#1E2F4A] bg-[#060B14] text-[#E6EDF7] hover:border-[#5CC8E0]"
                    >
                      <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSyncTransform({ zoom: 1, panX: 0, panY: 0 })
                      }
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xs border border-[#1E2F4A] bg-[#060B14] px-2.5 font-mono text-xs text-[#93A4BD] hover:border-[#5CC8E0] hover:text-[#E6EDF7] tabular-nums"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Sync zoom ({syncTransform.zoom.toFixed(1)}×)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportDiffPng}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xs border border-[#1E2F4A] bg-[#0E1829] px-3 font-mono text-xs text-[#E6EDF7] hover:border-[#5CC8E0] hover:text-[#BFE6F2]"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Export Diff PNG</span>
                    </button>
                  </div>
                </div>

                {exportNotice && (
                  <p
                    role="status"
                    className="px-5 py-2 bg-[#060B14] font-mono text-xs text-[#5FC9A0]"
                  >
                    {exportNotice}
                  </p>
                )}

                {/* Variable Selector + Day Scrubber */}
                <div className="px-5 py-3.5 grid grid-cols-1 xl:grid-cols-12 gap-4 items-center">
                  <div
                    role="group"
                    aria-label="Comparison variable"
                    className="xl:col-span-6 flex flex-wrap gap-1.5"
                  >
                    {DASHBOARD_VARIABLES.map((item) => {
                      const active = item.key === selectedVariable;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setSelectedVariable(item.key)}
                          className={`min-h-[34px] rounded-xs border px-2.5 py-1 font-mono text-xs transition-colors whitespace-nowrap ${
                            active
                              ? 'border-[#5CC8E0] bg-[#142238] text-[#BFE6F2] font-semibold'
                              : 'border-[#1E2F4A] bg-[#060B14] text-[#93A4BD] hover:border-[#5CC8E0]/60 hover:text-[#E6EDF7]'
                          }`}
                        >
                          {item.shortLabel} ({item.displayUnit})
                        </button>
                      );
                    })}
                  </div>

                  <div className="xl:col-span-6 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      aria-label="Previous comparison day"
                      disabled={clampedDay <= 1}
                      onClick={() => {
                        setIsPlaying(false);
                        setSelectedDay(Math.max(1, clampedDay - 1));
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xs border border-[#1E2F4A] bg-[#060B14] text-[#E6EDF7] hover:border-[#5CC8E0] disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={totalSteps < 2}
                      aria-pressed={isPlaying}
                      onClick={handleTogglePlay}
                      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xs border px-3 font-mono text-xs whitespace-nowrap ${
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
                      aria-label="Next comparison day"
                      disabled={clampedDay >= totalSteps}
                      onClick={() => {
                        setIsPlaying(false);
                        setSelectedDay(Math.min(totalSteps, clampedDay + 1));
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xs border border-[#1E2F4A] bg-[#060B14] text-[#E6EDF7] hover:border-[#5CC8E0] disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <div className="flex-1 min-w-[160px] space-y-1">
                      <div className="flex justify-between font-mono text-[11px] text-[#93A4BD] tabular-nums">
                        <label htmlFor="lab-day-slider">
                          Synchronized lead day
                        </label>
                        <span className="text-[#BFE6F2] font-semibold">
                          Day {clampedDay} / {totalSteps}
                          {dayInfo.shortDate ? ` · ${dayInfo.shortDate}` : ''}
                        </span>
                      </div>
                      <input
                        id="lab-day-slider"
                        type="range"
                        min={1}
                        max={totalSteps}
                        step={1}
                        value={clampedDay}
                        onChange={(e) => {
                          setIsPlaying(false);
                          setSelectedDay(Number(e.target.value));
                        }}
                        className="atlas-slider w-full"
                      />
                    </div>
                  </div>
                </div>

                {reducedMotionWarning && (
                  <p className="px-5 py-2 font-mono text-xs text-[#F2A93B]">
                    Playback paused because prefers-reduced-motion is enabled. Use
                    step buttons or the slider.
                  </p>
                )}
              </section>

              {/* Unified Full-Width 3-Map Synchronized Comparison Stage: BASELINE | SCENARIO | DIFFERENCE */}
              <section
                aria-label="Baseline, Scenario, and Difference maps"
                className="grid grid-cols-1 lg:grid-cols-3 border border-[#1E2F4A] bg-[#050A12] divide-y lg:divide-y-0 lg:divide-x divide-[#1E2F4A]"
              >
                <div className="p-4 space-y-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#93A4BD]">
                    01 · Baseline Reference
                  </p>
                  <SyncFieldCanvas
                    displayGrid={comparisonFields.baseDisp}
                    lat={loadedIc.data.grid.lat}
                    lon={loadedIc.data.grid.lon}
                    landSeaMask={loadedIc.data.static?.land_sea_mask}
                    colorScale={comparisonFields.stateScale}
                    unitLabel={vMeta.displayUnit}
                    decimals={vMeta.decimals}
                    title={`Baseline (Null Shock) · ${dayInfo.displayLabel}`}
                    ariaLabel={`Baseline map for ${vMeta.label} on ${dayInfo.displayLabel}`}
                    testId="lab-baseline-canvas"
                    selectedRegion={selectedRegion}
                    footprintMask={activeFootprintMask ?? undefined}
                    viewTransform={syncTransform}
                    onViewTransformChange={setSyncTransform}
                  />
                </div>

                <div className="p-4 space-y-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#F2A93B]">
                    02 · Perturbed Scenario
                  </p>
                  <SyncFieldCanvas
                    displayGrid={comparisonFields.scenDisp}
                    lat={loadedIc.data.grid.lat}
                    lon={loadedIc.data.grid.lon}
                    landSeaMask={loadedIc.data.static?.land_sea_mask}
                    colorScale={comparisonFields.stateScale}
                    unitLabel={vMeta.displayUnit}
                    decimals={vMeta.decimals}
                    title={`Scenario · ${dayInfo.displayLabel}`}
                    ariaLabel={`Scenario map for ${vMeta.label} on ${dayInfo.displayLabel}`}
                    testId="lab-scenario-canvas"
                    selectedRegion={selectedRegion}
                    footprintMask={activeFootprintMask ?? undefined}
                    viewTransform={syncTransform}
                    onViewTransformChange={setSyncTransform}
                  />
                </div>

                <div className="p-4 space-y-2 bg-[#07101E] relative">
                  <span
                    className="absolute inset-x-0 top-0 h-0.5 bg-[#5CC8E0]"
                    aria-hidden="true"
                  />
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#5CC8E0]">
                    03 · Scenario − Baseline Delta
                  </p>
                  <SyncFieldCanvas
                    ref={diffMapRef}
                    displayGrid={comparisonFields.diffDisp}
                    lat={loadedIc.data.grid.lat}
                    lon={loadedIc.data.grid.lon}
                    landSeaMask={loadedIc.data.static?.land_sea_mask}
                    colorScale={comparisonFields.diffScale}
                    unitLabel={vMeta.displayUnit}
                    decimals={vMeta.decimals}
                    signed
                    title={`Difference (Scenario − Baseline) · ${dayInfo.displayLabel}`}
                    ariaLabel={`Scenario minus Baseline difference map for ${vMeta.label} on ${dayInfo.displayLabel}`}
                    testId="lab-diff-canvas"
                    selectedRegion={selectedRegion}
                    footprintMask={activeFootprintMask ?? undefined}
                    viewTransform={syncTransform}
                    onViewTransformChange={setSyncTransform}
                  />
                  <p className="font-mono text-[11px] text-[#BFE6F2] tabular-nums">
                    RdBu diverging · Fixed symmetric scale across Days 1–
                    {totalSteps}:{' '}
                    <strong>
                      ±{comparisonFields.diffLimit.toFixed(vMeta.decimals)}{' '}
                      {vMeta.displayUnit}
                    </strong>
                  </p>
                </div>
              </section>

              {/* Per-Day Difference Metrics + Synchronized Region Box */}
              <div className="grid grid-cols-1 lg:grid-cols-12 border border-[#1E2F4A] bg-[#08101D] divide-y lg:divide-y-0 lg:divide-x divide-[#1E2F4A]">
                <section
                  aria-labelledby="lab-metrics-heading"
                  className="lg:col-span-8 divide-y divide-[#1E2F4A]"
                >
                  <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2
                        id="lab-metrics-heading"
                        className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]"
                      >
                        Day {clampedDay}
                        {dayInfo.longDate ? ` (${dayInfo.longDate})` : ''}{' '}
                        Difference Metrics (Scenario − Baseline)
                      </h2>
                      <p className="text-xs text-[#93A4BD] mt-0.5">
                        Derived directly from actual baseline and scenario outputs
                        across the full 32 × 36 grid.
                      </p>
                    </div>

                    <label className="inline-flex items-center gap-2 font-mono text-xs text-[#93A4BD]">
                      <span>|Δ| threshold:</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        aria-label={`Difference threshold in ${vMeta.displayUnit}`}
                        value={diffThresholdStr}
                        onChange={(e) => setDiffThresholdStr(e.target.value)}
                        className="w-20 min-h-[34px] rounded-xs border border-[#1E2F4A] bg-[#060B14] px-2 text-right text-[#E6EDF7] tabular-nums"
                      />
                      <span className="text-[#BFE6F2]">{vMeta.displayUnit}</span>
                    </label>
                  </div>

                  <dl className="grid grid-cols-2 sm:grid-cols-3 bg-[#1E2F4A] gap-px font-mono tabular-nums">
                    <div className="bg-[#08101D] p-4 space-y-1">
                      <dt className="text-[11px] text-[#93A4BD]">Max |Δ|</dt>
                      <dd className="text-xl font-semibold text-[#F2A93B] tracking-tight">
                        {dayMetrics.maxAbsDiff.toFixed(vMeta.decimals)}{' '}
                        <span className="text-xs font-normal text-[#93A4BD]">
                          {vMeta.displayUnit}
                        </span>
                      </dd>
                      <p className="text-[11px] text-[#93A4BD]">
                        Signed:{' '}
                        {formatSignedDelta(
                          dayMetrics.maxAbsSignedDiff,
                          vMeta.displayUnit,
                          vMeta.decimals,
                        )}
                      </p>
                    </div>

                    <div className="bg-[#08101D] p-4 space-y-1">
                      <dt className="text-[11px] text-[#93A4BD]">
                        Location of max |Δ|
                      </dt>
                      <dd className="text-sm font-semibold text-[#E6EDF7] pt-1">
                        {dayMetrics.maxAbsLocation
                          ? `${dayMetrics.maxAbsLocation.lat.toFixed(1)}°N, ${dayMetrics.maxAbsLocation.lon.toFixed(1)}°E`
                          : '—'}
                      </dd>
                      {dayMetrics.maxAbsLocation && (
                        <p className="text-[11px] text-[#93A4BD]">
                          Cell [r={dayMetrics.maxAbsLocation.row}, c=
                          {dayMetrics.maxAbsLocation.col}]
                        </p>
                      )}
                    </div>

                    <div className="bg-[#08101D] p-4 space-y-1">
                      <dt className="text-[11px] text-[#93A4BD]">
                        Mean difference (cos-lat)
                      </dt>
                      <dd className="text-xl font-semibold text-[#5CC8E0] tracking-tight">
                        {formatSignedDelta(
                          dayMetrics.meanDiff,
                          vMeta.displayUnit,
                          vMeta.decimals,
                        )}
                      </dd>
                    </div>

                    <div className="bg-[#08101D] p-4 space-y-1">
                      <dt className="text-[11px] text-[#93A4BD]">
                        cos(lat)-weighted RMS diff
                      </dt>
                      <dd className="text-xl font-semibold text-[#BFE6F2] tracking-tight">
                        {dayMetrics.cosLatRmsDiff.toFixed(vMeta.decimals)}{' '}
                        <span className="text-xs font-normal text-[#93A4BD]">
                          {vMeta.displayUnit}
                        </span>
                      </dd>
                    </div>

                    <div className="bg-[#08101D] p-4 space-y-1 sm:col-span-2">
                      <dt className="text-[11px] text-[#93A4BD]">
                        Fraction of cells with |Δ| &gt; {parsedThreshold}{' '}
                        {vMeta.displayUnit}
                      </dt>
                      <dd className="text-xl font-semibold text-[#E6EDF7] tracking-tight">
                        {(dayMetrics.fractionAboveThreshold * 100).toFixed(1)}%
                        <span className="text-xs font-normal text-[#93A4BD] ml-2">
                          ({dayMetrics.cellsAboveThreshold} /{' '}
                          {dayMetrics.totalCells} cells)
                        </span>
                      </dd>
                    </div>
                  </dl>
                </section>

                <aside className="lg:col-span-4 p-5 space-y-3">
                  <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]">
                    Synchronized Region Box
                  </h2>
                  <p className="text-xs text-[#93A4BD]">
                    Highlighted in amber on all three comparison maps and shared
                    with{' '}
                    <Link to="/impact" className="text-[#5CC8E0] underline">
                      /impact
                    </Link>
                    .
                  </p>
                  <RegionSelector
                    selectedRegion={selectedRegion}
                    onSelectRegion={setSelectedRegion}
                    latMinLimit={gridExtents.latMin}
                    latMaxLimit={gridExtents.latMax}
                    lonMinLimit={gridExtents.lonMin}
                    lonMaxLimit={gridExtents.lonMax}
                  />
                </aside>
              </div>

              {/* Integrity Panel */}
              <LabIntegrityPanel
                report={integrityReport}
                variable={selectedVariable}
                isZeroControl={Boolean(scenarioShockSnapshot?.isAllZero)}
              />
            </div>
          )}

        {/* 2. Live Shock Builder Rack */}
        {builtShock && (
          <ShockBuilderPanel
            config={activeShockConfig}
            onChange={setActiveShockConfig}
            built={builtShock}
            lat={loadedIc.data.grid.lat}
            lon={loadedIc.data.grid.lon}
            landSeaMask={loadedIc.data.static?.land_sea_mask}
          />
        )}
      </div>
    </div>
  );
}
