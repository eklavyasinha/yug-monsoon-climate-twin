import { GRID_SPEC } from '../config/projectFacts';
import type { MomIcV1 } from './icSchema';

export const ROLLOUT_CHANNELS = GRID_SPEC.channelCount; // 6
export const ROLLOUT_ROWS = GRID_SPEC.rows; // 32
export const ROLLOUT_COLS = GRID_SPEC.cols; // 36
export const CELLS_PER_GRID = ROLLOUT_ROWS * ROLLOUT_COLS; // 1152
export const CELLS_PER_STEP = ROLLOUT_CHANNELS * CELLS_PER_GRID; // 6912

export type DashboardVariable =
  | 't2m'
  | 'tp'
  | 'u10'
  | 'v10'
  | 'msl'
  | 'tcwv'
  | 'wind_speed';

export const VARIABLE_TO_CHANNEL_INDEX: Record<
  Exclude<DashboardVariable, 'wind_speed'>,
  number
> = {
  t2m: 0,
  tp: 1,
  u10: 2,
  v10: 3,
  msl: 4,
  tcwv: 5,
};

/**
 * Compact, cache-friendly Float32Array representation of a validated
 * `[steps, 6, 32, 36]` rollout in raw physical wire units.
 *
 * Contract confirmation (docs/API_CONTRACT.md, Endpoints section):
 *   "Response: {\"rollout\": [steps,6,32,36], \"inference_ms\": float};
 *    rollout[k] is day k+1 after the last input day."
 * Therefore Forecast Day 1 corresponds to stepIndex = 0, and Forecast Day N
 * corresponds to stepIndex = N - 1.
 */
export interface PackedRollout {
  readonly data: Float32Array;
  readonly steps: number;
  readonly channels: typeof ROLLOUT_CHANNELS;
  readonly rows: typeof ROLLOUT_ROWS;
  readonly cols: typeof ROLLOUT_COLS;
}

/**
 * Converts a 1-based Forecast Day (Day 1..steps) to the 0-based wire array index.
 * Confirmed against docs/API_CONTRACT.md: rollout[k] is day k+1.
 */
export function forecastDayToStepIndex(day: number, totalSteps: number): number {
  if (!Number.isInteger(day) || day < 1 || day > totalSteps) {
    throw new RangeError(
      `Forecast day ${day} is out of range [1, ${totalSteps}].`,
    );
  }
  return day - 1;
}

/**
 * Converts a 0-based wire array index to a 1-based Forecast Day.
 */
export function stepIndexToForecastDay(stepIndex: number, totalSteps: number): number {
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= totalSteps) {
    throw new RangeError(
      `Step index ${stepIndex} is out of range [0, ${totalSteps - 1}].`,
    );
  }
  return stepIndex + 1;
}

/**
 * Explicit flat-array indexer for `(step, channel, row, col)` in a PackedRollout.
 */
export function rolloutIndex(
  step: number,
  channel: number,
  row: number,
  col: number,
  totalSteps?: number,
): number {
  if (
    !Number.isInteger(step) ||
    step < 0 ||
    (totalSteps !== undefined && step >= totalSteps)
  ) {
    throw new RangeError(`Invalid rollout step index: ${step}`);
  }
  if (!Number.isInteger(channel) || channel < 0 || channel >= ROLLOUT_CHANNELS) {
    throw new RangeError(`Invalid rollout channel index: ${channel}`);
  }
  if (!Number.isInteger(row) || row < 0 || row >= ROLLOUT_ROWS) {
    throw new RangeError(`Invalid rollout row index: ${row}`);
  }
  if (!Number.isInteger(col) || col < 0 || col >= ROLLOUT_COLS) {
    throw new RangeError(`Invalid rollout col index: ${col}`);
  }
  return (
    step * CELLS_PER_STEP +
    channel * CELLS_PER_GRID +
    row * ROLLOUT_COLS +
    col
  );
}

/**
 * Packs a validated nested `[steps][6][32][36]` array into a contiguous Float32Array
 * without clipping, repairing, or altering any raw physical value.
 */
export function packRollout(nested: number[][][][]): PackedRollout {
  const steps = nested.length;
  if (steps < 1) {
    throw new RangeError('Cannot pack an empty rollout (steps must be >= 1).');
  }
  const data = new Float32Array(steps * CELLS_PER_STEP);
  let offset = 0;

  for (let s = 0; s < steps; s += 1) {
    const stepFrame = nested[s];
    if (stepFrame.length !== ROLLOUT_CHANNELS) {
      throw new RangeError(
        `Step ${s} has ${stepFrame.length} channels; expected ${ROLLOUT_CHANNELS}.`,
      );
    }
    for (let c = 0; c < ROLLOUT_CHANNELS; c += 1) {
      const channelGrid = stepFrame[c];
      if (channelGrid.length !== ROLLOUT_ROWS) {
        throw new RangeError(
          `Step ${s} channel ${c} has ${channelGrid.length} rows; expected ${ROLLOUT_ROWS}.`,
        );
      }
      for (let r = 0; r < ROLLOUT_ROWS; r += 1) {
        const rowVals = channelGrid[r];
        if (rowVals.length !== ROLLOUT_COLS) {
          throw new RangeError(
            `Step ${s} channel ${c} row ${r} has ${rowVals.length} cols; expected ${ROLLOUT_COLS}.`,
          );
        }
        for (let col = 0; col < ROLLOUT_COLS; col += 1) {
          data[offset] = rowVals[col];
          offset += 1;
        }
      }
    }
  }

  return {
    data,
    steps,
    channels: ROLLOUT_CHANNELS,
    rows: ROLLOUT_ROWS,
    cols: ROLLOUT_COLS,
  };
}

/**
 * Reads a single raw physical cell value at `(step, channel, row, col)`.
 */
export function getCellValue(
  rollout: PackedRollout,
  step: number,
  channel: number,
  row: number,
  col: number,
): number {
  return rollout.data[rolloutIndex(step, channel, row, col, rollout.steps)];
}

/**
 * Returns a zero-copy Float32Array view of length 32*36 = 1152 for a single `(step, channel)`.
 */
export function getChannelGridSlice(
  rollout: PackedRollout,
  step: number,
  channel: number,
): Float32Array {
  const start = rolloutIndex(step, channel, 0, 0, rollout.steps);
  return rollout.data.subarray(start, start + CELLS_PER_GRID);
}

/**
 * Extracts a 32x36 Float32Array for any DashboardVariable (including derived wind speed hypot(u10, v10)).
 * Raw wire values are never modified.
 */
export function getVariableGrid(
  rollout: PackedRollout,
  step: number,
  variable: DashboardVariable,
): Float32Array {
  if (variable !== 'wind_speed') {
    return getChannelGridSlice(
      rollout,
      step,
      VARIABLE_TO_CHANNEL_INDEX[variable],
    );
  }
  const u10 = getChannelGridSlice(rollout, step, VARIABLE_TO_CHANNEL_INDEX.u10);
  const v10 = getChannelGridSlice(rollout, step, VARIABLE_TO_CHANNEL_INDEX.v10);
  const speed = new Float32Array(CELLS_PER_GRID);
  for (let i = 0; i < CELLS_PER_GRID; i += 1) {
    speed[i] = Math.hypot(u10[i], v10[i]);
  }
  return speed;
}

/**
 * Computes element-wise difference `field(stepB) - field(stepA)` for same-run
 * Day A vs Day B comparisons in raw physical units (convertible afterwards).
 */
export function computeSameRunDifferenceGrid(
  rollout: PackedRollout,
  stepA: number,
  stepB: number,
  variable: DashboardVariable,
): Float32Array {
  const gridA = getVariableGrid(rollout, stepA, variable);
  const gridB = getVariableGrid(rollout, stepB, variable);
  const diff = new Float32Array(CELLS_PER_GRID);
  for (let i = 0; i < CELLS_PER_GRID; i += 1) {
    diff[i] = gridB[i] - gridA[i];
  }
  return diff;
}

/**
 * Orientation mapping derived strictly from the IC file's actual `grid.lat` and `grid.lon`
 * arrays so North is always rendered at visual top and East at visual right without
 * assuming row 0 is south or north.
 */
export interface GridOrientation {
  readonly latAscending: boolean;
  readonly lonAscending: boolean;
  readonly rows: number;
  readonly cols: number;
  visualRowToDataRow: (visualRow: number) => number;
  dataRowToVisualRow: (dataRow: number) => number;
  visualColToDataCol: (visualCol: number) => number;
  dataColToVisualCol: (dataCol: number) => number;
}

export function getGridOrientation(
  lat: readonly number[],
  lon: readonly number[],
): GridOrientation {
  if (lat.length < 2 || lon.length < 2) {
    throw new RangeError('Latitude and longitude arrays must have at least 2 points.');
  }
  const rows = lat.length;
  const cols = lon.length;
  const latAscending = lat[lat.length - 1] > lat[0];
  const lonAscending = lon[lon.length - 1] > lon[0];

  return {
    latAscending,
    lonAscending,
    rows,
    cols,
    // Visual row 0 is Northernmost (highest latitude).
    visualRowToDataRow: (visualRow: number) =>
      latAscending ? rows - 1 - visualRow : visualRow,
    dataRowToVisualRow: (dataRow: number) =>
      latAscending ? rows - 1 - dataRow : dataRow,
    // Visual col 0 is Westernmost (lowest longitude).
    visualColToDataCol: (visualCol: number) =>
      lonAscending ? visualCol : cols - 1 - visualCol,
    dataColToVisualCol: (dataCol: number) =>
      lonAscending ? dataCol : cols - 1 - dataCol,
  };
}

/**
 * Deterministic non-cryptographic cache key (FNV-1a 32-bit) over IC tensors,
 * seasonal encoding, API endpoint, and step count so baseline runs can be cached
 * cleanly without logging or persisting raw IC payloads.
 */
export function computeBaselineCacheKey(
  ic: MomIcV1,
  apiBaseUrl: string,
  steps: number,
): string {
  let hash = 0x811c9dc5;
  const mixNumber = (n: number) => {
    const quantized = Math.round(n * 1e4);
    hash ^= quantized & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (quantized >>> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (quantized >>> 16) & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (quantized >>> 24) & 0xff;
    hash = Math.imul(hash, 0x01000193);
  };

  mixNumber(ic.doy_sincos[0]);
  mixNumber(ic.doy_sincos[1]);
  mixNumber(steps);

  for (let t = 0; t < ic.init_states.length; t += 1) {
    for (let c = 0; c < ic.init_states[t].length; c += 1) {
      const grid = ic.init_states[t][c];
      for (let r = 0; r < grid.length; r += 1) {
        const row = grid[r];
        for (let col = 0; col < row.length; col += 1) {
          mixNumber(row[col]);
        }
      }
    }
  }

  return `${apiBaseUrl}|s${steps}|${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
