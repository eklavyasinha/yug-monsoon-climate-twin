import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  getApiRuntimeConfig,
  loadStoredBaseUrlOverride,
  saveBaseUrlOverride,
  type ApiRuntimeConfig,
} from '../api/config';
import type {
  HealthCheckResult,
  SimulateResult,
} from '../api/client';
import type { RolloutDiagnostics } from '../api/contractSchemas';
import { ApiClientError } from '../api/errors';
import { GRID_SPEC } from '../config/projectFacts';
import {
  cloneShockConfig,
  SHOCK_PRESETS,
  type ShockConfig,
} from '../config/shockPresets';
import { PRESET_REGIONS, type GeoRegion } from '../utils/aggregation';
import {
  isSyntheticFixtureEnabled,
  loadDevSyntheticFixture,
} from '../utils/fixtureLoader';
import type { IcValidationSummary, MomIcV1 } from '../utils/icSchema';
import {
  computeBaselineCacheKey,
  packRollout,
  type DashboardVariable,
  type PackedRollout,
} from '../utils/rolloutStore';

export interface ScenarioShockSnapshot {
  readonly config: ShockConfig;
  readonly footprintMask: Uint8Array;
  readonly isAllZero: boolean;
}

export interface LoadedInitialConditions {
  data: MomIcV1;
  summary: IcValidationSummary;
  loadedAtIso: string;
  isSyntheticFixture?: boolean;
}

export type SimulationStatus =
  | 'idle'
  | 'connecting'
  | 'loading'
  | 'success'
  | 'cancelled'
  | 'error';

export interface SimulationRunRecord {
  readonly id: string;
  readonly kind: 'baseline' | 'scenario';
  readonly cacheKey: string;
  readonly steps: number;
  readonly packedRollout: PackedRollout;
  readonly diagnostics: RolloutDiagnostics;
  readonly inferenceMs: number;
  readonly roundTripMs: number;
  readonly modelName: string | null;
  readonly endpointUrl: string;
  readonly completedAtIso: string;
  readonly fromCache: boolean;
  readonly isSyntheticFixture: boolean;
  readonly scenarioLabel?: string;
}

interface RunBaselineOptions {
  steps?: number;
  forceRefresh?: boolean;
  fetchImpl?: typeof fetch;
}

interface RunScenarioOptions {
  perturbation: number[][][];
  label: string;
  steps?: number;
  shockSnapshot?: ScenarioShockSnapshot;
  fetchImpl?: typeof fetch;
}

interface AppDataContextValue {
  // Phase 1 API & IC state (preserved)
  apiConfig: ApiRuntimeConfig;
  setApiBaseUrlOverride: (url: string | null) => void;
  loadedIc: LoadedInitialConditions | null;
  setLoadedIc: (ic: LoadedInitialConditions | null) => void;
  lastHealth: HealthCheckResult | null;
  setLastHealth: (result: HealthCheckResult | null) => void;
  lastContractTest: SimulateResult | null;
  setLastContractTest: (result: SimulateResult | null) => void;

  // Phase 2A & 2B shared simulation, dashboard, lab, and impact state
  baselineRun: SimulationRunRecord | null;
  scenarioRun: SimulationRunRecord | null;
  scenarioShockSnapshot: ScenarioShockSnapshot | null;
  activeShockConfig: ShockConfig;
  setActiveShockConfig: (config: ShockConfig) => void;
  simulationStatus: SimulationStatus;
  simulationError: ApiClientError | null;
  selectedVariable: DashboardVariable;
  setSelectedVariable: (v: DashboardVariable) => void;
  selectedDay: number;
  setSelectedDay: (day: number) => void;
  selectedRegion: GeoRegion;
  setSelectedRegion: (region: GeoRegion) => void;
  runBaselineSimulation: (options?: RunBaselineOptions) => Promise<SimulationRunRecord | null>;
  runScenarioSimulation: (options: RunScenarioOptions) => Promise<SimulationRunRecord | null>;
  cancelSimulation: () => void;
  clearScenarioRun: () => void;
  clearSimulationError: () => void;

  // Development-only fixture controls (strictly disabled by default)
  fixtureModeAllowed: boolean;
  activateDevSyntheticFixture: () => Promise<void>;
  clearSyntheticFixture: () => void;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [overrideUrl, setOverrideUrl] = useState<string | null>(() =>
    loadStoredBaseUrlOverride(),
  );
  const [loadedIc, setLoadedIcState] = useState<LoadedInitialConditions | null>(() => {
    try {
      const saved = localStorage.getItem('mom-loaded-ic-v1');
      return saved ? JSON.parse(saved) as LoadedInitialConditions : null;
    } catch {
      return null;
    }
  });
  const [lastHealth, setLastHealth] = useState<HealthCheckResult | null>(null);
  const [lastContractTest, setLastContractTest] = useState<SimulateResult | null>(
    null,
  );

  const [baselineRun, setBaselineRun] = useState<SimulationRunRecord | null>(null);
  const [scenarioRun, setScenarioRun] = useState<SimulationRunRecord | null>(null);
  const [scenarioShockSnapshot, setScenarioShockSnapshot] =
    useState<ScenarioShockSnapshot | null>(null);
  const [activeShockConfig, setActiveShockConfig] = useState<ShockConfig>(() =>
    cloneShockConfig(SHOCK_PRESETS[1].config),
  );
  const [simulationStatus, setSimulationStatus] = useState<SimulationStatus>('idle');
  const [simulationError, setSimulationError] = useState<ApiClientError | null>(null);
  const [selectedVariable, setSelectedVariable] = useState<DashboardVariable>('t2m');
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [selectedRegion, setSelectedRegion] = useState<GeoRegion>(PRESET_REGIONS[0]);

  const activeAbortRef = useRef<AbortController | null>(null);
  const runSequenceRef = useRef<number>(0);
  const baselineCacheRef = useRef<Map<string, SimulationRunRecord>>(new Map());

  const apiConfig = useMemo(
    () => getApiRuntimeConfig(overrideUrl),
    [overrideUrl],
  );

  const fixtureModeAllowed = isSyntheticFixtureEnabled();

  const cancelSimulation = useCallback(() => {
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
      activeAbortRef.current = null;
      setSimulationStatus('cancelled');
      setSimulationError(null);
    }
  }, []);

  useEffect(() => {
    return () => {
      activeAbortRef.current?.abort();
    };
  }, []);

  const setApiBaseUrlOverride = useCallback(
    (url: string | null) => {
      activeAbortRef.current?.abort();
      activeAbortRef.current = null;
      saveBaseUrlOverride(url);
      setOverrideUrl(url);
      setSimulationStatus('idle');
      setSimulationError(null);
    },
    [],
  );

  const setLoadedIc = useCallback((ic: LoadedInitialConditions | null) => {
    activeAbortRef.current?.abort();
    activeAbortRef.current = null;
    setLoadedIcState(ic);
    try {
      if (ic) {
        localStorage.setItem('mom-loaded-ic-v1', JSON.stringify(ic));
      } else {
        localStorage.removeItem('mom-loaded-ic-v1');
      }
    } catch (error) {
      console.error('Failed to persist initial conditions:', error);
    }
    setBaselineRun(null);
    setScenarioRun(null);
    setScenarioShockSnapshot(null);
    setSimulationStatus('idle');
    setSimulationError(null);
    setSelectedDay(1);
  }, []);

  const clearScenarioRun = useCallback(() => {
    setScenarioRun(null);
    setScenarioShockSnapshot(null);
  }, []);

  const clearSimulationError = useCallback(() => {
    setSimulationError(null);
    setSimulationStatus((prev) => (prev === 'error' ? 'idle' : prev));
  }, []);

  const runBaselineSimulation = useCallback(
    async (options: RunBaselineOptions = {}): Promise<SimulationRunRecord | null> => {
      if (!loadedIc) {
        setSimulationError(
          new ApiClientError({
            kind: 'schema_mismatch',
            message: 'Load a validated mom-ic-v1 initial-conditions file before running a simulation.',
          }),
        );
        setSimulationStatus('error');
        return null;
      }

      if (loadedIc.isSyntheticFixture) {
        setSimulationError(
          new ApiClientError({
            kind: 'schema_mismatch',
            message:
              'Unload the synthetic dev fixture and load a real local mom-ic-v1 file to run an actual backend simulation.',
          }),
        );
        setSimulationStatus('error');
        return null;
      }

      const steps = options.steps ?? GRID_SPEC.maxForecastSteps;
      const cacheKey = computeBaselineCacheKey(
        loadedIc.data,
        apiConfig.activeBaseUrl,
        steps,
      );

      if (!options.forceRefresh) {
        const cached = baselineCacheRef.current.get(cacheKey);
        if (cached) {
          const cachedRecord: SimulationRunRecord = {
            ...cached,
            fromCache: true,
          };
          setBaselineRun(cachedRecord);
          setSimulationError(null);
          setSimulationStatus('success');
          setSelectedDay((prev) => Math.min(Math.max(1, prev), cachedRecord.steps));
          return cachedRecord;
        }
      }

      // Cancel any in-flight request before starting the next sequential run.
      activeAbortRef.current?.abort();
      const controller = new AbortController();
      activeAbortRef.current = controller;
      const seqId = ++runSequenceRef.current;

      setSimulationError(null);
      setSimulationStatus('connecting');

      let resolvedModelName = lastHealth?.modelName ?? null;

      try {
        const { checkHealth, simulate } = await import('../api/client');

        // Verify backend readiness if health has not been verified for this URL yet.
        if (!lastHealth || !lastHealth.ready) {
          const health = await checkHealth({
            baseUrl: apiConfig.activeBaseUrl,
            method: apiConfig.healthMethod,
            timeoutMs: apiConfig.timeoutMs,
            signal: controller.signal,
            fetchImpl: options.fetchImpl,
          });
          if (seqId !== runSequenceRef.current) return null;
          setLastHealth(health);
          resolvedModelName = health.modelName;

          if (!health.ready) {
            throw new ApiClientError({
              kind: 'http_error',
              message: `Backend /health responded with status "${health.status}" instead of "ready".`,
            });
          }
        }

        if (seqId !== runSequenceRef.current) return null;
        setSimulationStatus('loading');

        const result = await simulate(
          {
            init_states: loadedIc.data.init_states,
            doy_sincos: loadedIc.data.doy_sincos,
            steps,
            perturbation: null,
          },
          {
            baseUrl: apiConfig.activeBaseUrl,
            timeoutMs: apiConfig.timeoutMs,
            signal: controller.signal,
            fetchImpl: options.fetchImpl,
          },
        );

        if (seqId !== runSequenceRef.current) return null;

        const record: SimulationRunRecord = {
          id: `baseline-${Date.now()}-${seqId}`,
          kind: 'baseline',
          cacheKey,
          steps,
          packedRollout: packRollout(result.rollout),
          diagnostics: result.diagnostics,
          inferenceMs: result.inferenceMs,
          roundTripMs: result.roundTripMs,
          modelName: resolvedModelName,
          endpointUrl: result.endpointUrl,
          completedAtIso: new Date().toISOString(),
          fromCache: false,
          isSyntheticFixture: false,
        };

        baselineCacheRef.current.set(cacheKey, record);
        setBaselineRun(record);
        setScenarioRun(null);
        setSelectedDay((prev) => Math.min(Math.max(1, prev), record.steps));
        setSimulationStatus('success');
        setSimulationError(null);
        return record;
      } catch (err) {
        if (seqId !== runSequenceRef.current) return null;

        const apiErr =
          err instanceof ApiClientError
            ? err
            : new ApiClientError({
                kind: 'backend_unreachable',
                message: err instanceof Error ? err.message : 'Unexpected simulation error.',
              });

        if (apiErr.kind === 'aborted') {
          setSimulationStatus('cancelled');
          setSimulationError(null);
          return null;
        }

        setSimulationError(apiErr);
        setSimulationStatus('error');
        return null;
      } finally {
        if (activeAbortRef.current === controller) {
          activeAbortRef.current = null;
        }
      }
    },
    [loadedIc, apiConfig, lastHealth],
  );

  /**
   * Shared sequential scenario runner for Phase 2B.
   * Ensures baseline runs first (or is retrieved from cache) before running a perturbed scenario
   * so inference timing measurements never overlap.
   */
  const runScenarioSimulation = useCallback(
    async (options: RunScenarioOptions): Promise<SimulationRunRecord | null> => {
      const steps = options.steps ?? GRID_SPEC.maxForecastSteps;
      let activeBaseline = baselineRun;
      if (!activeBaseline || activeBaseline.steps !== steps || activeBaseline.isSyntheticFixture) {
        activeBaseline = await runBaselineSimulation({
          steps,
          fetchImpl: options.fetchImpl,
        });
        if (!activeBaseline || !loadedIc) {
          return null;
        }
      }
      if (!loadedIc) return null;

      activeAbortRef.current?.abort();
      const controller = new AbortController();
      activeAbortRef.current = controller;
      const seqId = ++runSequenceRef.current;

      setSimulationError(null);
      setSimulationStatus('loading');

      try {
        const { simulate } = await import('../api/client');
        const result = await simulate(
          {
            init_states: loadedIc.data.init_states,
            doy_sincos: loadedIc.data.doy_sincos,
            steps,
            perturbation: options.perturbation,
          },
          {
            baseUrl: apiConfig.activeBaseUrl,
            timeoutMs: apiConfig.timeoutMs,
            signal: controller.signal,
            fetchImpl: options.fetchImpl,
          },
        );

        if (seqId !== runSequenceRef.current) return null;

        const record: SimulationRunRecord = {
          id: `scenario-${Date.now()}-${seqId}`,
          kind: 'scenario',
          cacheKey: `${activeBaseline.cacheKey}|scenario:${options.label}`,
          steps,
          packedRollout: packRollout(result.rollout),
          diagnostics: result.diagnostics,
          inferenceMs: result.inferenceMs,
          roundTripMs: result.roundTripMs,
          modelName: activeBaseline.modelName,
          endpointUrl: result.endpointUrl,
          completedAtIso: new Date().toISOString(),
          fromCache: false,
          isSyntheticFixture: false,
          scenarioLabel: options.label,
        };

        setScenarioRun(record);
        setScenarioShockSnapshot(options.shockSnapshot ?? null);
        setSimulationStatus('success');
        setSimulationError(null);
        return record;
      } catch (err) {
        if (seqId !== runSequenceRef.current) return null;
        const apiErr =
          err instanceof ApiClientError
            ? err
            : new ApiClientError({
                kind: 'backend_unreachable',
                message: err instanceof Error ? err.message : 'Unexpected scenario simulation error.',
              });

        if (apiErr.kind === 'aborted') {
          setSimulationStatus('cancelled');
          setSimulationError(null);
          return null;
        }
        setSimulationError(apiErr);
        setSimulationStatus('error');
        return null;
      } finally {
        if (activeAbortRef.current === controller) {
          activeAbortRef.current = null;
        }
      }
    },
    [baselineRun, loadedIc, apiConfig, runBaselineSimulation],
  );

  const activateDevSyntheticFixture = useCallback(async () => {
    if (!isSyntheticFixtureEnabled()) {
      return;
    }
    activeAbortRef.current?.abort();
    activeAbortRef.current = null;

    const fixture = await loadDevSyntheticFixture();
    const now = new Date().toISOString();
    setLoadedIcState({
      data: fixture.icData,
      summary: fixture.icSummary,
      loadedAtIso: now,
      isSyntheticFixture: true,
    });
    setBaselineRun({
      id: `synthetic-fixture-${Date.now()}`,
      kind: 'baseline',
      cacheKey: 'synthetic-dev-fixture',
      steps: fixture.packedRollout.steps,
      packedRollout: fixture.packedRollout,
      diagnostics: fixture.diagnostics,
      inferenceMs: fixture.inferenceMs,
      roundTripMs: fixture.roundTripMs,
      modelName: fixture.modelName,
      endpointUrl: 'DEV_SYNTHETIC_FIXTURE_LOCAL',
      completedAtIso: now,
      fromCache: false,
      isSyntheticFixture: true,
    });
    setScenarioRun(null);
    setScenarioShockSnapshot(null);
    setSelectedDay(1);
    setSimulationError(null);
    setSimulationStatus('success');
  }, []);

  const clearSyntheticFixture = useCallback(() => {
    setLoadedIcState(null);
    setBaselineRun(null);
    setScenarioRun(null);
    setScenarioShockSnapshot(null);
    setSimulationStatus('idle');
    setSimulationError(null);
    setSelectedDay(1);
  }, []);

  const value = useMemo<AppDataContextValue>(
    () => ({
      apiConfig,
      setApiBaseUrlOverride,
      loadedIc,
      setLoadedIc,
      lastHealth,
      setLastHealth,
      lastContractTest,
      setLastContractTest,
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
      runBaselineSimulation,
      runScenarioSimulation,
      cancelSimulation,
      clearScenarioRun,
      clearSimulationError,
      fixtureModeAllowed,
      activateDevSyntheticFixture,
      clearSyntheticFixture,
    }),
    [
      apiConfig,
      setApiBaseUrlOverride,
      loadedIc,
      setLoadedIc,
      lastHealth,
      lastContractTest,
      baselineRun,
      scenarioRun,
      scenarioShockSnapshot,
      activeShockConfig,
      simulationStatus,
      simulationError,
      selectedVariable,
      selectedDay,
      selectedRegion,
      runBaselineSimulation,
      runScenarioSimulation,
      cancelSimulation,
      clearScenarioRun,
      clearSimulationError,
      fixtureModeAllowed,
      activateDevSyntheticFixture,
      clearSyntheticFixture,
    ],
  );

  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) {
    throw new Error('useAppData must be used inside AppDataProvider');
  }
  return ctx;
}
