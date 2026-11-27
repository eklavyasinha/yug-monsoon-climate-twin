import {
  computeAreaWeightedStats,
  type GeoRegion,
  type SpatialStats,
} from './aggregation';
import {
  addCalendarDays,
  formatForecastWindow,
} from './forecastDates';
import {
  getChannelGridSlice,
  ROLLOUT_COLS,
  ROLLOUT_ROWS,
  type PackedRollout,
} from './rolloutStore';
import { kelvinToCelsius } from './units';

export interface ImpactThresholds {
  /** User-defined heavy-rain threshold in mm/day (counts days with tp >= threshold). */
  heavyRainMmDay: number;
  /** User-defined dry-day threshold in mm/day (counts days with tp < threshold; default 1.0). */
  dryDayMmDay: number;
  /** User-defined heat threshold in °C (counts days with t2m_C >= threshold). */
  heatTempC: number;
}

export const DEFAULT_IMPACT_THRESHOLDS: ImpactThresholds = {
  heavyRainMmDay: 10,
  dryDayMmDay: 1,
  heatTempC: 35,
};

export interface DailyRegionalRainfallPoint {
  readonly day: number;
  readonly baselineMeanMmDay: number;
  readonly scenarioMeanMmDay: number | null;
  readonly diffMmDay: number | null;
}

export interface RainfallImpactAnalysis {
  readonly steps: number;
  readonly baselineAccumulatedGrid: Float32Array;
  readonly scenarioAccumulatedGrid: Float32Array | null;
  readonly diffAccumulatedGrid: Float32Array | null;
  readonly baselineHeavyDaysGrid: Float32Array;
  readonly scenarioHeavyDaysGrid: Float32Array | null;
  readonly diffHeavyDaysGrid: Float32Array | null;
  readonly baselineDryDaysGrid: Float32Array;
  readonly scenarioDryDaysGrid: Float32Array | null;
  readonly diffDryDaysGrid: Float32Array | null;

  // Regional cos(lat)-weighted summaries
  readonly regionBaselineAccum: SpatialStats;
  readonly regionScenarioAccum: SpatialStats | null;
  readonly regionDiffAccum: SpatialStats | null;
  readonly regionBaselineHeavyDays: SpatialStats;
  readonly regionScenarioHeavyDays: SpatialStats | null;
  readonly regionBaselineDryDays: SpatialStats;
  readonly regionScenarioDryDays: SpatialStats | null;

  // Daily regional rainfall sequence (cos(lat)-weighted mean mm/day per forecast day)
  readonly dailyRegionalSequence: readonly DailyRegionalRainfallPoint[];
  readonly regionBaselineHeavySeqDays: number;
  readonly regionScenarioHeavySeqDays: number | null;
  readonly regionBaselineDrySeqDays: number;
  readonly regionScenarioDrySeqDays: number | null;
}

export interface HeatImpactAnalysis {
  readonly steps: number;
  readonly thresholdC: number;
  readonly baselineHotDaysGrid: Float32Array;
  readonly scenarioHotDaysGrid: Float32Array | null;
  readonly diffHotDaysGrid: Float32Array | null;
  readonly regionBaselineHotDays: SpatialStats;
  readonly regionScenarioHotDays: SpatialStats | null;
  readonly regionDiffHotDays: SpatialStats | null;
}

/**
 * Pure per-cell precipitation accumulation & threshold day counts over a
 * multi-day sequence of `tp` grids (`[steps][rows * cols]`).
 * Exported directly for exact hand-computed unit test verification.
 */
export function computePrecipitationCellMetrics(
  dailyTpGrids: readonly ArrayLike<number>[],
  heavyRainThresholdMmDay: number,
  dryDayThresholdMmDay: number,
): {
  accumulatedMm: Float32Array;
  heavyRainDays: Float32Array;
  dryDays: Float32Array;
} {
  const steps = dailyTpGrids.length;
  const cellCount = steps > 0 ? dailyTpGrids[0].length : 0;
  const accumulatedMm = new Float32Array(cellCount);
  const heavyRainDays = new Float32Array(cellCount);
  const dryDays = new Float32Array(cellCount);

  for (let s = 0; s < steps; s += 1) {
    const grid = dailyTpGrids[s];
    for (let i = 0; i < cellCount; i += 1) {
      const tp = grid[i];
      if (!Number.isFinite(tp)) continue;
      accumulatedMm[i] += tp;
      if (tp >= heavyRainThresholdMmDay) {
        heavyRainDays[i] += 1;
      }
      if (tp < dryDayThresholdMmDay) {
        dryDays[i] += 1;
      }
    }
  }

  return { accumulatedMm, heavyRainDays, dryDays };
}

/**
 * Pure per-cell count of days where `t2m` (raw Kelvin) converted to Celsius
 * meets or exceeds `heatThresholdC`.
 */
export function computeHeatDaysCellMetrics(
  dailyT2mKelvinGrids: readonly ArrayLike<number>[],
  heatThresholdC: number,
): Float32Array {
  const steps = dailyT2mKelvinGrids.length;
  const cellCount = steps > 0 ? dailyT2mKelvinGrids[0].length : 0;
  const hotDays = new Float32Array(cellCount);

  for (let s = 0; s < steps; s += 1) {
    const grid = dailyT2mKelvinGrids[s];
    for (let i = 0; i < cellCount; i += 1) {
      const tempC = kelvinToCelsius(grid[i]);
      // PackedRollout stores raw Kelvin in Float32Array (1 ULP ≈ 3.05e-5 K near 300 K);
      // 2e-5 °C tolerance prevents exact wire thresholds like 308.15 K (35.0 °C) from failing due to Float32 rounding.
      if (Number.isFinite(tempC) && tempC + 2e-5 >= heatThresholdC) {
        hotDays[i] += 1;
      }
    }
  }

  return hotDays;
}

function subtractGrids(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 1) {
    out[i] = a[i] - b[i];
  }
  return out;
}

/**
 * Computes Monsoon Rainfall Impact metrics strictly from actual baseline
 * (and optional scenario) rollouts across the selected geographic region.
 */
export function computeRainfallImpact(
  baseline: PackedRollout,
  scenario: PackedRollout | null,
  lat: readonly number[],
  lon: readonly number[],
  region: GeoRegion,
  heavyRainThresholdMmDay: number,
  dryDayThresholdMmDay: number,
): RainfallImpactAnalysis {
  const steps = scenario ? Math.min(baseline.steps, scenario.steps) : baseline.steps;
  const regionBounds = {
    latMin: region.latMin,
    latMax: region.latMax,
    lonMin: region.lonMin,
    lonMax: region.lonMax,
  };

  const baseDailyGrids: Float32Array[] = [];
  const scenDailyGrids: Float32Array[] = [];
  const dailyRegionalSequence: DailyRegionalRainfallPoint[] = [];

  let regionBaselineHeavySeqDays = 0;
  let regionScenarioHeavySeqDays = 0;
  let regionBaselineDrySeqDays = 0;
  let regionScenarioDrySeqDays = 0;

  for (let s = 0; s < steps; s += 1) {
    const baseTp = getChannelGridSlice(baseline, s, 1);
    baseDailyGrids.push(baseTp);
    const baseRegStats = computeAreaWeightedStats(baseTp, lat, lon, regionBounds);

    if (
      Number.isFinite(baseRegStats.weightedMean) &&
      baseRegStats.weightedMean >= heavyRainThresholdMmDay
    ) {
      regionBaselineHeavySeqDays += 1;
    }
    if (
      Number.isFinite(baseRegStats.weightedMean) &&
      baseRegStats.weightedMean < dryDayThresholdMmDay
    ) {
      regionBaselineDrySeqDays += 1;
    }

    let scenMean: number | null = null;
    if (scenario) {
      const scenTp = getChannelGridSlice(scenario, s, 1);
      scenDailyGrids.push(scenTp);
      const scenRegStats = computeAreaWeightedStats(scenTp, lat, lon, regionBounds);
      scenMean = scenRegStats.weightedMean;
      if (Number.isFinite(scenMean) && scenMean >= heavyRainThresholdMmDay) {
        regionScenarioHeavySeqDays += 1;
      }
      if (Number.isFinite(scenMean) && scenMean < dryDayThresholdMmDay) {
        regionScenarioDrySeqDays += 1;
      }
    }

    dailyRegionalSequence.push({
      day: s + 1,
      baselineMeanMmDay: baseRegStats.weightedMean,
      scenarioMeanMmDay: scenMean,
      diffMmDay:
        scenMean !== null && Number.isFinite(baseRegStats.weightedMean)
          ? scenMean - baseRegStats.weightedMean
          : null,
    });
  }

  const baseCells = computePrecipitationCellMetrics(
    baseDailyGrids,
    heavyRainThresholdMmDay,
    dryDayThresholdMmDay,
  );

  const scenCells = scenario
    ? computePrecipitationCellMetrics(
        scenDailyGrids,
        heavyRainThresholdMmDay,
        dryDayThresholdMmDay,
      )
    : null;

  const diffAccumulatedGrid = scenCells
    ? subtractGrids(scenCells.accumulatedMm, baseCells.accumulatedMm)
    : null;
  const diffHeavyDaysGrid = scenCells
    ? subtractGrids(scenCells.heavyRainDays, baseCells.heavyRainDays)
    : null;
  const diffDryDaysGrid = scenCells
    ? subtractGrids(scenCells.dryDays, baseCells.dryDays)
    : null;

  return {
    steps,
    baselineAccumulatedGrid: baseCells.accumulatedMm,
    scenarioAccumulatedGrid: scenCells ? scenCells.accumulatedMm : null,
    diffAccumulatedGrid,
    baselineHeavyDaysGrid: baseCells.heavyRainDays,
    scenarioHeavyDaysGrid: scenCells ? scenCells.heavyRainDays : null,
    diffHeavyDaysGrid,
    baselineDryDaysGrid: baseCells.dryDays,
    scenarioDryDaysGrid: scenCells ? scenCells.dryDays : null,
    diffDryDaysGrid,

    regionBaselineAccum: computeAreaWeightedStats(
      baseCells.accumulatedMm,
      lat,
      lon,
      regionBounds,
    ),
    regionScenarioAccum: scenCells
      ? computeAreaWeightedStats(scenCells.accumulatedMm, lat, lon, regionBounds)
      : null,
    regionDiffAccum: diffAccumulatedGrid
      ? computeAreaWeightedStats(diffAccumulatedGrid, lat, lon, regionBounds)
      : null,
    regionBaselineHeavyDays: computeAreaWeightedStats(
      baseCells.heavyRainDays,
      lat,
      lon,
      regionBounds,
    ),
    regionScenarioHeavyDays: scenCells
      ? computeAreaWeightedStats(scenCells.heavyRainDays, lat, lon, regionBounds)
      : null,
    regionBaselineDryDays: computeAreaWeightedStats(
      baseCells.dryDays,
      lat,
      lon,
      regionBounds,
    ),
    regionScenarioDryDays: scenCells
      ? computeAreaWeightedStats(scenCells.dryDays, lat, lon, regionBounds)
      : null,

    dailyRegionalSequence,
    regionBaselineHeavySeqDays,
    regionScenarioHeavySeqDays: scenario ? regionScenarioHeavySeqDays : null,
    regionBaselineDrySeqDays,
    regionScenarioDrySeqDays: scenario ? regionScenarioDrySeqDays : null,
  };
}

/**
 * Computes optional Heat Impact metrics strictly from actual baseline
 * (and optional scenario) `t2m` fields.
 */
export function computeHeatImpact(
  baseline: PackedRollout,
  scenario: PackedRollout | null,
  lat: readonly number[],
  lon: readonly number[],
  region: GeoRegion,
  heatThresholdC: number,
): HeatImpactAnalysis {
  const steps = scenario ? Math.min(baseline.steps, scenario.steps) : baseline.steps;
  const regionBounds = {
    latMin: region.latMin,
    latMax: region.latMax,
    lonMin: region.lonMin,
    lonMax: region.lonMax,
  };

  const baseT2m: Float32Array[] = [];
  const scenT2m: Float32Array[] = [];
  for (let s = 0; s < steps; s += 1) {
    baseT2m.push(getChannelGridSlice(baseline, s, 0));
    if (scenario) {
      scenT2m.push(getChannelGridSlice(scenario, s, 0));
    }
  }

  const baselineHotDaysGrid = computeHeatDaysCellMetrics(baseT2m, heatThresholdC);
  const scenarioHotDaysGrid = scenario
    ? computeHeatDaysCellMetrics(scenT2m, heatThresholdC)
    : null;
  const diffHotDaysGrid = scenarioHotDaysGrid
    ? subtractGrids(scenarioHotDaysGrid, baselineHotDaysGrid)
    : null;

  return {
    steps,
    thresholdC: heatThresholdC,
    baselineHotDaysGrid,
    scenarioHotDaysGrid,
    diffHotDaysGrid,
    regionBaselineHotDays: computeAreaWeightedStats(
      baselineHotDaysGrid,
      lat,
      lon,
      regionBounds,
    ),
    regionScenarioHotDays: scenarioHotDaysGrid
      ? computeAreaWeightedStats(scenarioHotDaysGrid, lat, lon, regionBounds)
      : null,
    regionDiffHotDays: diffHotDaysGrid
      ? computeAreaWeightedStats(diffHotDaysGrid, lat, lon, regionBounds)
      : null,
  };
}

export interface ImpactCsvMetadata {
  readonly region: GeoRegion;
  readonly thresholds: ImpactThresholds;
  readonly icLabel: string;
  readonly initDateIso?: string | null;
  readonly modelName: string | null;
  readonly scenarioLabel: string | null;
  readonly baselineInferenceMs: number;
  readonly scenarioInferenceMs: number | null;
}

function escapeCsv(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Builds a client-side CSV export of regional impact metrics and daily rainfall
 * sequence strictly from actual backend simulation results.
 */
export function buildImpactMetricsCsv(
  rainfall: RainfallImpactAnalysis,
  heat: HeatImpactAnalysis,
  meta: ImpactCsvMetadata,
): string {
  const initDateIso = meta.initDateIso ?? null;
  const forecastWindow = formatForecastWindow(initDateIso, rainfall.steps);
  const lines: string[] = [
    '# Multiverse of Monsoon — Impact Lens Regional Export (Actual Backend Simulation)',
    '# Disclaimer: Descriptive grid calculations on ~1 deg daily experimental model output — not validated impact forecasts.',
    `# Initial Conditions: ${meta.icLabel}`,
    `# Initialization Date: ${initDateIso ?? 'Not specified in IC metadata'}`,
    ...(forecastWindow ? [`# Valid Forecast Window: ${forecastWindow}`] : []),
    `# Model Name: ${meta.modelName ?? 'Not reported by backend'}`,
    `# Scenario: ${meta.scenarioLabel ?? 'Baseline only (no scenario run)'}`,
    `# Region: ${meta.region.label} (${meta.region.latMin}..${meta.region.latMax}N, ${meta.region.lonMin}..${meta.region.lonMax}E, ${rainfall.regionBaselineAccum.cellCount} cells of ${ROLLOUT_ROWS * ROLLOUT_COLS})`,
    `# User Thresholds: heavy_rain >= ${meta.thresholds.heavyRainMmDay} mm/day; dry_day < ${meta.thresholds.dryDayMmDay} mm/day; heat >= ${meta.thresholds.heatTempC} C`,
    `# Baseline Inference (ms): ${meta.baselineInferenceMs.toFixed(2)}`,
    `# Scenario Inference (ms): ${meta.scenarioInferenceMs !== null ? meta.scenarioInferenceMs.toFixed(2) : 'N/A'}`,
    '',
    'metric,unit,baseline_region_coslat_mean,scenario_region_coslat_mean,delta_scenario_minus_baseline,baseline_region_min,baseline_region_max',
  ];

  const fmt = (v: number | null | undefined, d = 3) =>
    v !== null && v !== undefined && Number.isFinite(v) ? v.toFixed(d) : '';

  const addRow = (
    metric: string,
    unit: string,
    baseVal: number,
    scenVal: number | null,
    bMin: number,
    bMax: number,
  ) => {
    const delta =
      scenVal !== null && Number.isFinite(baseVal) && Number.isFinite(scenVal)
        ? scenVal - baseVal
        : null;
    lines.push(
      [
        metric,
        unit,
        fmt(baseVal),
        fmt(scenVal),
        fmt(delta),
        fmt(bMin),
        fmt(bMax),
      ]
        .map(escapeCsv)
        .join(','),
    );
  };

  addRow(
    'accumulated_rainfall',
    'mm',
    rainfall.regionBaselineAccum.weightedMean,
    rainfall.regionScenarioAccum?.weightedMean ?? null,
    rainfall.regionBaselineAccum.min,
    rainfall.regionBaselineAccum.max,
  );
  addRow(
    `heavy_rain_days (>= ${meta.thresholds.heavyRainMmDay} mm/day)`,
    'days',
    rainfall.regionBaselineHeavyDays.weightedMean,
    rainfall.regionScenarioHeavyDays?.weightedMean ?? null,
    rainfall.regionBaselineHeavyDays.min,
    rainfall.regionBaselineHeavyDays.max,
  );
  addRow(
    `dry_days (< ${meta.thresholds.dryDayMmDay} mm/day)`,
    'days',
    rainfall.regionBaselineDryDays.weightedMean,
    rainfall.regionScenarioDryDays?.weightedMean ?? null,
    rainfall.regionBaselineDryDays.min,
    rainfall.regionBaselineDryDays.max,
  );
  addRow(
    `heat_days (>= ${meta.thresholds.heatTempC} C)`,
    'days',
    heat.regionBaselineHotDays.weightedMean,
    heat.regionScenarioHotDays?.weightedMean ?? null,
    heat.regionBaselineHotDays.min,
    heat.regionBaselineHotDays.max,
  );

  lines.push('');
  lines.push(
    'forecast_day,valid_date,baseline_region_mean_tp_mm_day,scenario_region_mean_tp_mm_day,delta_mm_day',
  );
  for (const pt of rainfall.dailyRegionalSequence) {
    const validDate = initDateIso
      ? (addCalendarDays(initDateIso, pt.day) ?? '')
      : '';
    lines.push(
      [
        pt.day,
        validDate,
        fmt(pt.baselineMeanMmDay, 4),
        fmt(pt.scenarioMeanMmDay, 4),
        fmt(pt.diffMmDay, 4),
      ]
        .map(escapeCsv)
        .join(','),
    );
  }

  return `${lines.join('\n')}\n`;
}
