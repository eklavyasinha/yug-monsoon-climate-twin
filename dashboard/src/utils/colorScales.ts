import { scaleSequential } from 'd3-scale';
import {
  interpolateCividis,
  interpolateRdBu,
  interpolateViridis,
} from 'd3-scale-chromatic';
import {
  getVariableGrid,
  type DashboardVariable,
  type PackedRollout,
} from './rolloutStore';
import { toDisplayDelta, toDisplayValue } from './units';

export type ScaleRangeMode = 'fixed-run' | 'per-day';

export interface ScientificColorScale {
  readonly paletteName: string;
  readonly scaleKind: 'sequential-linear' | 'sequential-log1p' | 'diverging-rdbu';
  readonly min: number;
  readonly max: number;
  readonly mapValueToColor: (value: number) => string;
  readonly normalizeValue: (value: number) => number;
  readonly ticks: readonly { value: number; position: number }[];
}

/**
 * Computes `[min, max]` in display units across either all steps of the run
 * (`fixed-run`, default) or a single step (`per-day`).
 */
export function computeVariableRange(
  rollout: PackedRollout,
  variable: DashboardVariable,
  mode: ScaleRangeMode,
  stepIndex: number,
): [number, number] {
  const startStep = mode === 'fixed-run' ? 0 : stepIndex;
  const endStep = mode === 'fixed-run' ? rollout.steps - 1 : stepIndex;

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let s = startStep; s <= endStep; s += 1) {
    const grid = getVariableGrid(rollout, s, variable);
    for (let i = 0; i < grid.length; i += 1) {
      const displayVal = toDisplayValue(variable, grid[i]);
      if (!Number.isFinite(displayVal)) continue;
      if (displayVal < min) min = displayVal;
      if (displayVal > max) max = displayVal;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [0, 1];
  }

  if (variable === 'tp') {
    // Anchor precipitation scale at 0 mm/day on the lower bound so dry cells stay visually consistent.
    const lower = Math.min(0, min);
    const upper = Math.max(max, 1);
    return [lower, upper];
  }

  if (Math.abs(max - min) < 1e-6) {
    return [min - 0.5, max + 0.5];
  }

  return [min, max];
}

/**
 * Computes a symmetric diverging range `[-maxAbs, +maxAbs]` in display delta units
 * for Day B - Day A (or Phase 2B scenario - baseline) comparisons.
 */
export function computeSymmetricDeltaRange(
  rawDiffGrid: ArrayLike<number>,
  variable: DashboardVariable,
): [number, number] {
  let maxAbs = 0;
  for (let i = 0; i < rawDiffGrid.length; i += 1) {
    const delta = Math.abs(toDisplayDelta(variable, rawDiffGrid[i]));
    if (Number.isFinite(delta) && delta > maxAbs) {
      maxAbs = delta;
    }
  }
  const safeMax = maxAbs < 1e-5 ? 1 : maxAbs;
  return [-safeMax, safeMax];
}

function buildLinearTicks(
  min: number,
  max: number,
  count = 5,
): { value: number; position: number }[] {
  const ticks: { value: number; position: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    ticks.push({
      value: min + t * (max - min),
      position: t,
    });
  }
  return ticks;
}

/**
 * Builds documented `log1p` tick marks with actual mm/day labels for rainfall.
 */
function buildRainfallLog1pTicks(
  maxMmPerDay: number,
): { value: number; position: number }[] {
  const safeMax = Math.max(maxMmPerDay, 1);
  const logMax = Math.log1p(safeMax);
  const candidates = [0, 1, 5, 10, 25, 50, 100, 200];

  const chosen: number[] = [0];
  for (const val of candidates) {
    if (val > 0 && val < safeMax * 0.88) {
      chosen.push(val);
    }
  }

  // Keep a readable 4–5 tick density while always including 0 and max.
  const trimmed =
    chosen.length > 4
      ? [0, chosen[Math.floor(chosen.length / 3)], chosen[Math.floor((2 * chosen.length) / 3)]]
      : chosen;
  trimmed.push(safeMax);

  return trimmed.map((value) => ({
    value,
    position: Math.min(1, Math.max(0, Math.log1p(Math.max(0, value)) / logMax)),
  }));
}

/**
 * Creates a color-blind-conscious scientific color scale for any DashboardVariable.
 * Never uses rainbow scales.
 *
 * - `tp` (rainfall): documented `log1p` nonlinear mapping on Viridis with actual mm/day ticks.
 * - `t2m`: Cividis sequential (perceptually uniform, deuteranopia/protanopia safe).
 * - `wind_speed`, `u10`, `v10`, `msl`, `tcwv`: Viridis/Cividis sequential family.
 */
export function createDashboardColorScale(
  variable: DashboardVariable,
  domain: [number, number],
): ScientificColorScale {
  const [min, max] = domain;

  if (variable === 'tp') {
    const safeMax = Math.max(max, 1);
    const logMax = Math.log1p(safeMax);
    const normalizeValue = (v: number): number => {
      if (!Number.isFinite(v) || v <= 0) return 0;
      return Math.min(1, Math.log1p(v) / logMax);
    };
    return {
      paletteName: 'Viridis (log1p nonlinear)',
      scaleKind: 'sequential-log1p',
      min: Math.max(0, min),
      max: safeMax,
      normalizeValue,
      mapValueToColor: (value: number) => interpolateViridis(normalizeValue(value)),
      ticks: buildRainfallLog1pTicks(safeMax),
    };
  }

  const interpolator =
    variable === 't2m' || variable === 'msl'
      ? interpolateCividis
      : interpolateViridis;
  const paletteName =
    variable === 't2m' || variable === 'msl'
      ? 'Cividis (sequential)'
      : 'Viridis (sequential)';

  const span = max - min || 1;
  const scale = scaleSequential(interpolator).domain([min, max]).clamp(true);
  const normalizeValue = (v: number): number =>
    Math.min(1, Math.max(0, (v - min) / span));

  return {
    paletteName,
    scaleKind: 'sequential-linear',
    min,
    max,
    normalizeValue,
    mapValueToColor: (value: number) => scale(value),
    ticks: buildLinearTicks(min, max, 5),
  };
}

/**
 * Creates a symmetric diverging RdBu color scale centered at 0 for Day B - Day A
 * and Phase 2B scenario difference visualizations.
 * Blue encodes negative deltas, neutral light encodes 0, red encodes positive deltas.
 */
export function createDivergingDifferenceScale(
  domain: [number, number],
): ScientificColorScale {
  const [min, max] = domain;
  const span = max - min || 1;
  const scale = scaleSequential((t: number) => interpolateRdBu(1 - t))
    .domain([min, max])
    .clamp(true);
  const normalizeValue = (v: number): number =>
    Math.min(1, Math.max(0, (v - min) / span));

  return {
    paletteName: 'RdBu (diverging, 0-centred)',
    scaleKind: 'diverging-rdbu',
    min,
    max,
    normalizeValue,
    mapValueToColor: (value: number) => scale(value),
    ticks: buildLinearTicks(min, max, 5),
  };
}
