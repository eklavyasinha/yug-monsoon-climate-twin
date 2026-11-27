import {
  getVariableGrid,
  ROLLOUT_CHANNELS,
  ROLLOUT_COLS,
  ROLLOUT_ROWS,
  type DashboardVariable,
  type PackedRollout,
} from './rolloutStore';
import { toDisplayDelta } from './units';

export interface LabDayComparisonMetrics {
  readonly day: number;
  readonly stepIndex: number;
  /** Maximum absolute difference in display units (`max |Scenario - Baseline|`). */
  readonly maxAbsDiff: number;
  /** Signed difference value at the location of maximum absolute difference. */
  readonly maxAbsSignedDiff: number;
  readonly maxAbsLocation: {
    row: number;
    col: number;
    lat: number;
    lon: number;
  } | null;
  /** cos(latitude)-weighted mean difference (`Scenario - Baseline`) in display units. */
  readonly meanDiff: number;
  /** cos(latitude)-weighted RMS difference in display units. */
  readonly cosLatRmsDiff: number;
  /** Fraction in [0, 1] of cells where `|Scenario - Baseline| > threshold`. */
  readonly fractionAboveThreshold: number;
  readonly cellsAboveThreshold: number;
  readonly totalCells: number;
}

export interface IntegrityDiagnosticsReport {
  readonly allValuesFinite: boolean;
  readonly nonFiniteCount: number;
  readonly precipitationNonNegative: boolean;
  readonly negativePrecipCount: number;
  readonly minPrecipMmDay: number;
  /** Max `|Scenario - Baseline|` across ALL steps and ALL 6 raw physical channels. */
  readonly overallMaxAbsRawDiff: number;
  /** Max `|Scenario - Baseline|` for the currently selected variable (display units) across all steps. */
  readonly selectedVarMaxAbsDiff: number;
  /** Day 1 share in [0, 1] of total `|Δ|` located inside the user-defined footprint (null if total |Δ| === 0). */
  readonly day1FootprintShare: number | null;
  /** Final-day (Day 10 when 10-step) share in [0, 1] of total `|Δ|` inside the same footprint. */
  readonly finalDayFootprintShare: number | null;
  readonly finalDayNumber: number;
  /** Sum of `|Δ|` (display units) outside the footprint on Day 1. */
  readonly day1OutsideTotalAbsDiff: number;
  /** Sum of `|Δ|` (display units) outside the footprint on the final day. */
  readonly finalDayOutsideTotalAbsDiff: number;
  readonly footprintCellCount: number;
}

/**
 * Computes exact per-cell difference grid: `Scenario minus Baseline` in raw wire units.
 */
export function computeScenarioMinusBaselineGrid(
  baseline: PackedRollout,
  scenario: PackedRollout,
  stepIndex: number,
  variable: DashboardVariable,
): Float32Array {
  const baseGrid = getVariableGrid(baseline, stepIndex, variable);
  const scenGrid = getVariableGrid(scenario, stepIndex, variable);
  const diff = new Float32Array(baseGrid.length);
  for (let i = 0; i < baseGrid.length; i += 1) {
    diff[i] = scenGrid[i] - baseGrid[i];
  }
  return diff;
}

/**
 * Computes a single symmetric diverging scale range `[-maxAbs, +maxAbs]` in display
 * units across ALL forecast days of an experiment so color encoding remains fixed
 * across days 1..N.
 */
export function computeExperimentFixedSymmetricRange(
  baseline: PackedRollout,
  scenario: PackedRollout,
  variable: DashboardVariable,
): [number, number] {
  const steps = Math.min(baseline.steps, scenario.steps);
  let maxAbs = 0;

  for (let s = 0; s < steps; s += 1) {
    const rawDiff = computeScenarioMinusBaselineGrid(baseline, scenario, s, variable);
    for (let i = 0; i < rawDiff.length; i += 1) {
      const val = Math.abs(toDisplayDelta(variable, rawDiff[i]));
      if (Number.isFinite(val) && val > maxAbs) {
        maxAbs = val;
      }
    }
  }

  const safeLimit = maxAbs < 1e-6 ? 1 : maxAbs;
  return [-safeLimit, safeLimit];
}

/**
 * Computes per-day quantitative comparison metrics (`Scenario minus Baseline`)
 * using exact cos(latitude) area weighting.
 */
export function computeLabDayMetrics(
  baseline: PackedRollout,
  scenario: PackedRollout,
  stepIndex: number,
  variable: DashboardVariable,
  lat: readonly number[],
  lon: readonly number[],
  thresholdDisplayUnits: number,
): LabDayComparisonMetrics {
  const rawDiff = computeScenarioMinusBaselineGrid(
    baseline,
    scenario,
    stepIndex,
    variable,
  );
  const absThresh = Math.max(0, Number.isFinite(thresholdDisplayUnits) ? thresholdDisplayUnits : 0);

  let maxAbsDiff = -1;
  let maxAbsSignedDiff = 0;
  let maxAbsLocation: LabDayComparisonMetrics['maxAbsLocation'] = null;
  let weightedSum = 0;
  let weightedSqSum = 0;
  let weightSum = 0;
  let cellsAboveThreshold = 0;
  let totalCells = 0;

  for (let r = 0; r < lat.length; r += 1) {
    const w = Math.cos((lat[r] * Math.PI) / 180);
    if (!Number.isFinite(w) || w <= 0) continue;

    for (let c = 0; c < lon.length; c += 1) {
      const rawVal = rawDiff[r * lon.length + c];
      const delta = toDisplayDelta(variable, rawVal);
      if (!Number.isFinite(delta)) continue;

      const absDelta = Math.abs(delta);
      totalCells += 1;
      weightSum += w;
      weightedSum += w * delta;
      weightedSqSum += w * delta * delta;

      if (absDelta > absThresh) {
        cellsAboveThreshold += 1;
      }

      if (absDelta > maxAbsDiff) {
        maxAbsDiff = absDelta;
        maxAbsSignedDiff = delta;
        maxAbsLocation = { row: r, col: c, lat: lat[r], lon: lon[c] };
      }
    }
  }

  return {
    day: stepIndex + 1,
    stepIndex,
    maxAbsDiff: maxAbsDiff < 0 ? 0 : maxAbsDiff,
    maxAbsSignedDiff,
    maxAbsLocation,
    meanDiff: weightSum > 0 ? weightedSum / weightSum : Number.NaN,
    cosLatRmsDiff: weightSum > 0 ? Math.sqrt(weightedSqSum / weightSum) : Number.NaN,
    fractionAboveThreshold: totalCells > 0 ? cellsAboveThreshold / totalCells : 0,
    cellsAboveThreshold,
    totalCells,
  };
}

/**
 * Computes descriptive integrity diagnostics strictly from actual baseline and
 * scenario responses. Does NOT make scientific pass/fail or causality claims.
 */
export function computeIntegrityDiagnostics(
  baseline: PackedRollout,
  scenario: PackedRollout,
  variable: DashboardVariable,
  footprintMask: Uint8Array,
): IntegrityDiagnosticsReport {
  const steps = Math.min(baseline.steps, scenario.steps);
  let nonFiniteCount = 0;
  let negativePrecipCount = 0;
  let minPrecipMmDay = Number.POSITIVE_INFINITY;
  let overallMaxAbsRawDiff = 0;

  const cellCount = ROLLOUT_ROWS * ROLLOUT_COLS;
  const stepStride = ROLLOUT_CHANNELS * cellCount;

  // Scan all steps and all 6 raw channels across both baseline and scenario
  for (let s = 0; s < steps; s += 1) {
    for (let ch = 0; ch < ROLLOUT_CHANNELS; ch += 1) {
      const baseOffset = s * stepStride + ch * cellCount;
      for (let i = 0; i < cellCount; i += 1) {
        const b = baseline.data[baseOffset + i];
        const sc = scenario.data[baseOffset + i];
        if (!Number.isFinite(b)) nonFiniteCount += 1;
        if (!Number.isFinite(sc)) nonFiniteCount += 1;

        if (Number.isFinite(b) && Number.isFinite(sc)) {
          const absD = Math.abs(sc - b);
          if (absD > overallMaxAbsRawDiff) overallMaxAbsRawDiff = absD;
        }

        // Channel 1 is `tp` (precipitation, mm/day)
        if (ch === 1) {
          if (Number.isFinite(b)) {
            if (b < minPrecipMmDay) minPrecipMmDay = b;
            if (b < 0) negativePrecipCount += 1;
          }
          if (Number.isFinite(sc)) {
            if (sc < minPrecipMmDay) minPrecipMmDay = sc;
            if (sc < 0) negativePrecipCount += 1;
          }
        }
      }
    }
  }

  let selectedVarMaxAbsDiff = 0;
  for (let s = 0; s < steps; s += 1) {
    const diff = computeScenarioMinusBaselineGrid(baseline, scenario, s, variable);
    for (let i = 0; i < diff.length; i += 1) {
      const absD = Math.abs(toDisplayDelta(variable, diff[i]));
      if (Number.isFinite(absD) && absD > selectedVarMaxAbsDiff) {
        selectedVarMaxAbsDiff = absD;
      }
    }
  }

  const measureFootprintSplit = (stepIdx: number) => {
    const diff = computeScenarioMinusBaselineGrid(
      baseline,
      scenario,
      stepIdx,
      variable,
    );
    let insideAbs = 0;
    let outsideAbs = 0;
    for (let i = 0; i < diff.length; i += 1) {
      const absD = Math.abs(toDisplayDelta(variable, diff[i]));
      if (!Number.isFinite(absD)) continue;
      if (footprintMask[i] === 1) {
        insideAbs += absD;
      } else {
        outsideAbs += absD;
      }
    }
    const total = insideAbs + outsideAbs;
    return {
      shareInside: total > 1e-12 ? insideAbs / total : null,
      outsideTotal: outsideAbs,
    };
  };

  const day1Split = measureFootprintSplit(0);
  const finalStepIdx = Math.max(0, steps - 1);
  const finalSplit = measureFootprintSplit(finalStepIdx);

  let footprintCellCount = 0;
  for (let i = 0; i < footprintMask.length; i += 1) {
    if (footprintMask[i] === 1) footprintCellCount += 1;
  }

  return {
    allValuesFinite: nonFiniteCount === 0,
    nonFiniteCount,
    precipitationNonNegative: negativePrecipCount === 0,
    negativePrecipCount,
    minPrecipMmDay: Number.isFinite(minPrecipMmDay) ? minPrecipMmDay : 0,
    overallMaxAbsRawDiff,
    selectedVarMaxAbsDiff,
    day1FootprintShare: day1Split.shareInside,
    finalDayFootprintShare: finalSplit.shareInside,
    finalDayNumber: finalStepIdx + 1,
    day1OutsideTotalAbsDiff: day1Split.outsideTotal,
    finalDayOutsideTotalAbsDiff: finalSplit.outsideTotal,
    footprintCellCount,
  };
}
