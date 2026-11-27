import {
  getVariableGrid,
  ROLLOUT_COLS,
  ROLLOUT_ROWS,
  type DashboardVariable,
  type PackedRollout,
} from './rolloutStore';
import { toDisplayValue } from './units';

export interface GeoRegion {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly latMin: number;
  readonly latMax: number;
  readonly lonMin: number;
  readonly lonMax: number;
}

export const PRESET_REGIONS: readonly GeoRegion[] = [
  {
    id: 'bay_of_bengal',
    label: 'Bay of Bengal box',
    note: 'Round 1 contract warm_ocean box (8–20°N, 82–94°E)',
    latMin: 8.0,
    latMax: 20.0,
    lonMin: 82.0,
    lonMax: 94.0,
  },
  {
    id: 'arabian_sea',
    label: 'Arabian Sea box',
    note: 'Round 1 contract monsoon_stall box (8–20°N, 65.5–75°E)',
    latMin: 8.0,
    latMax: 20.0,
    lonMin: 65.5,
    lonMax: 75.0,
  },
  {
    id: 'central_monsoon_zone',
    label: 'Central Monsoon Zone',
    note: 'Core continental monsoon trough box (16.5–26.5°N, 74.5–86.5°E)',
    latMin: 16.5,
    latMax: 26.5,
    lonMin: 74.5,
    lonMax: 86.5,
  },
  {
    id: 'full_domain',
    label: 'Full domain (ocean + neighboring land)',
    note: 'All 32 × 36 cells (6.5–37.5°N, 65.5–100.5°E); includes ocean and neighboring land',
    latMin: 6.5,
    latMax: 37.5,
    lonMin: 65.5,
    lonMax: 100.5,
  },
] as const;

export interface CellCoordinate {
  row: number;
  col: number;
  lat: number;
  lon: number;
}

export interface SpatialStats {
  /** Area-weighted mean using cos(latitude in radians) weights. */
  weightedMean: number;
  min: number;
  max: number;
  minLocation: CellCoordinate | null;
  maxLocation: CellCoordinate | null;
  cellCount: number;
  weightSum: number;
}

export interface DailySeriesPoint {
  day: number;
  stepIndex: number;
  domain: SpatialStats;
  region: SpatialStats;
}

/**
 * Computes cos(latitude)-weighted mean, min, max, and extremum coordinates over
 * a flat `rows * cols` grid of values (either raw or already converted to display units).
 *
 * Weight for latitude row `r`: w_r = cos(lat[r] * Math.PI / 180).
 * Only cells whose `(lat[r], lon[c])` fall within `region` (inclusive) are included.
 */
export function computeAreaWeightedStats(
  values: ArrayLike<number>,
  lat: readonly number[],
  lon: readonly number[],
  region?: Pick<GeoRegion, 'latMin' | 'latMax' | 'lonMin' | 'lonMax'>,
): SpatialStats {
  const rows = lat.length;
  const cols = lon.length;

  let weightedSum = 0;
  let weightSum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let minLocation: CellCoordinate | null = null;
  let maxLocation: CellCoordinate | null = null;
  let cellCount = 0;

  for (let r = 0; r < rows; r += 1) {
    const latDeg = lat[r];
    if (region && (latDeg < region.latMin || latDeg > region.latMax)) {
      continue;
    }
    const weight = Math.cos((latDeg * Math.PI) / 180);
    if (!(weight > 0)) {
      continue;
    }

    const rowOffset = r * cols;
    for (let c = 0; c < cols; c += 1) {
      const lonDeg = lon[c];
      if (region && (lonDeg < region.lonMin || lonDeg > region.lonMax)) {
        continue;
      }

      const value = values[rowOffset + c];
      if (!Number.isFinite(value)) {
        continue;
      }

      weightedSum += weight * value;
      weightSum += weight;
      cellCount += 1;

      if (value < min) {
        min = value;
        minLocation = { row: r, col: c, lat: latDeg, lon: lonDeg };
      }
      if (value > max) {
        max = value;
        maxLocation = { row: r, col: c, lat: latDeg, lon: lonDeg };
      }
    }
  }

  if (cellCount === 0 || weightSum === 0) {
    return {
      weightedMean: Number.NaN,
      min: Number.NaN,
      max: Number.NaN,
      minLocation: null,
      maxLocation: null,
      cellCount: 0,
      weightSum: 0,
    };
  }

  return {
    weightedMean: weightedSum / weightSum,
    min,
    max,
    minLocation,
    maxLocation,
    cellCount,
    weightSum,
  };
}

/**
 * Computes day-by-day display-unit spatial summaries (full domain and selected region)
 * across all steps of an actual PackedRollout.
 */
export function computeDailyVariableSeries(
  rollout: PackedRollout,
  variable: DashboardVariable,
  lat: readonly number[],
  lon: readonly number[],
  region: GeoRegion,
): DailySeriesPoint[] {
  const series: DailySeriesPoint[] = [];
  const converted = new Float32Array(ROLLOUT_ROWS * ROLLOUT_COLS);

  for (let step = 0; step < rollout.steps; step += 1) {
    const rawGrid = getVariableGrid(rollout, step, variable);
    for (let i = 0; i < rawGrid.length; i += 1) {
      converted[i] = toDisplayValue(variable, rawGrid[i]);
    }

    const domain = computeAreaWeightedStats(converted, lat, lon);
    const regionStats = computeAreaWeightedStats(converted, lat, lon, region);

    series.push({
      day: step + 1,
      stepIndex: step,
      domain,
      region: regionStats,
    });
  }

  return series;
}
