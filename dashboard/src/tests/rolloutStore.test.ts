import { describe, expect, it } from 'vitest';
import {
  computeBaselineCacheKey,
  computeSameRunDifferenceGrid,
  forecastDayToStepIndex,
  getCellValue,
  getChannelGridSlice,
  getGridOrientation,
  getVariableGrid,
  packRollout,
  ROLLOUT_CHANNELS,
  ROLLOUT_COLS,
  ROLLOUT_ROWS,
  rolloutIndex,
} from '../utils/rolloutStore';
import { buildValidMomIc, makeDummyRollout } from './fixtures';

describe('Rollout compact Float32Array store and indexing', () => {
  it('maps Forecast Day 1 to step index 0 per docs/API_CONTRACT.md', () => {
    expect(forecastDayToStepIndex(1, 10)).toBe(0);
    expect(forecastDayToStepIndex(10, 10)).toBe(9);
    expect(() => forecastDayToStepIndex(0, 10)).toThrow(RangeError);
    expect(() => forecastDayToStepIndex(11, 10)).toThrow(RangeError);
  });

  it('computes exact row-major (step, channel, row, col) flat offsets and validates bounds', () => {
    const stepStride = ROLLOUT_CHANNELS * ROLLOUT_ROWS * ROLLOUT_COLS;
    const channelStride = ROLLOUT_ROWS * ROLLOUT_COLS;

    expect(rolloutIndex(0, 0, 0, 0, 10)).toBe(0);
    expect(rolloutIndex(0, 0, 1, 5, 10)).toBe(1 * ROLLOUT_COLS + 5);
    expect(rolloutIndex(2, 3, 4, 7, 10)).toBe(
      2 * stepStride + 3 * channelStride + 4 * ROLLOUT_COLS + 7,
    );

    expect(() => rolloutIndex(-1, 0, 0, 0, 10)).toThrow(RangeError);
    expect(() => rolloutIndex(10, 0, 0, 0, 10)).toThrow(RangeError);
    expect(() => rolloutIndex(0, 6, 0, 0, 10)).toThrow(RangeError);
    expect(() => rolloutIndex(0, 0, 32, 0, 10)).toThrow(RangeError);
    expect(() => rolloutIndex(0, 0, 0, 36, 10)).toThrow(RangeError);
  });

  it('packs nested backend rollout arrays into Float32Array without altering physical values', () => {
    const raw = makeDummyRollout(3);
    raw[2][0][10][15] = 307.25; // t2m in K on Day 3
    raw[1][1][5][8] = 18.5; // tp in mm/day on Day 2
    raw[0][2][12][20] = 3.0; // u10
    raw[0][3][12][20] = 4.0; // v10

    const packed = packRollout(raw);
    expect(packed.steps).toBe(3);
    expect(packed.data).toBeInstanceOf(Float32Array);
    expect(packed.data.length).toBe(3 * 6 * 32 * 36);

    expect(getCellValue(packed, 2, 0, 10, 15)).toBeCloseTo(307.25, 4);
    expect(getCellValue(packed, 1, 1, 5, 8)).toBeCloseTo(18.5, 4);

    // Slice extraction
    const day3T2m = getChannelGridSlice(packed, 2, 0);
    expect(day3T2m.length).toBe(32 * 36);
    expect(day3T2m[10 * 36 + 15]).toBeCloseTo(307.25, 4);

    // Derived wind_speed = hypot(u10, v10)
    const day1Wind = getVariableGrid(packed, 0, 'wind_speed');
    expect(day1Wind[12 * 36 + 20]).toBeCloseTo(5.0, 5);
  });

  it('computes exact same-run Day B minus Day A difference grids', () => {
    const raw = makeDummyRollout(4);
    raw[0][0][2][3] = 295.0; // Day 1
    raw[3][0][2][3] = 301.5; // Day 4
    const packed = packRollout(raw);

    const diff = computeSameRunDifferenceGrid(packed, 0, 3, 't2m');
    expect(diff[2 * 36 + 3]).toBeCloseTo(6.5, 5);
  });

  it('derives visual north-at-top / west-at-left orientation directly from lat/lon arrays', () => {
    const latSouthToNorth = Array.from({ length: 32 }, (_, i) => 6.5 + i);
    const lonWestToEast = Array.from({ length: 36 }, (_, i) => 65.5 + i);

    const ascOrient = getGridOrientation(latSouthToNorth, lonWestToEast);
    expect(ascOrient.latAscending).toBe(true);
    expect(ascOrient.lonAscending).toBe(true);
    // Visual top row (0) must be northernmost data row (31 = 37.5°N)
    expect(ascOrient.visualRowToDataRow(0)).toBe(31);
    expect(ascOrient.visualRowToDataRow(31)).toBe(0);
    expect(ascOrient.dataRowToVisualRow(31)).toBe(0);
    expect(ascOrient.visualColToDataCol(0)).toBe(0);

    // Reversed north-to-south latitude array
    const latNorthToSouth = [...latSouthToNorth].reverse();
    const descOrient = getGridOrientation(latNorthToSouth, lonWestToEast);
    expect(descOrient.latAscending).toBe(false);
    // Visual top row (0) is already data row 0 (37.5°N)
    expect(descOrient.visualRowToDataRow(0)).toBe(0);
    expect(descOrient.visualRowToDataRow(31)).toBe(31);
    expect(descOrient.dataRowToVisualRow(0)).toBe(0);
  });

  it('produces deterministic baseline cache keys sensitive to IC, URL, and steps', () => {
    const ic = buildValidMomIc();
    const k1 = computeBaselineCacheKey(ic, '/api', 10);
    const k2 = computeBaselineCacheKey(ic, '/api', 10);
    const k3 = computeBaselineCacheKey(ic, 'http://localhost:8000', 10);
    const k4 = computeBaselineCacheKey(ic, '/api', 5);

    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
    expect(k1).not.toBe(k4);
  });
});
