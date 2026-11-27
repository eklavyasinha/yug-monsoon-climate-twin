import { describe, expect, it } from 'vitest';
import {
  computeAreaWeightedStats,
  computeDailyVariableSeries,
  PRESET_REGIONS,
} from '../utils/aggregation';
import { packRollout } from '../utils/rolloutStore';
import { makeDummyRollout } from './fixtures';

describe('cos(latitude) area-weighted aggregation and regional stats', () => {
  it('matches hand-computed cos(latitude) weighted average on an exact 2x2 grid', () => {
    // Row 0 at 0°N (cos = 1.0): values 10 and 20 -> row sum = 30 * 1.0 = 30, weight = 2.0
    // Row 1 at 60°N (cos = 0.5): values 30 and 40 -> row sum = 70 * 0.5 = 35, weight = 1.0
    // Exact weighted mean = (30 + 35) / (2.0 + 1.0) = 65 / 3 = 21.6666667
    // (Simple unweighted arithmetic mean would be 25.0 — verifying cos(lat) weighting differs!)
    const grid = new Float32Array([10, 20, 30, 40]);
    const lat = [0, 60];
    const lon = [70, 80];

    const stats = computeAreaWeightedStats(grid, lat, lon);
    expect(stats.cellCount).toBe(4);
    expect(stats.weightedMean).toBeCloseTo(65 / 3, 6);
    expect(stats.weightedMean).not.toBeCloseTo(25, 2);
    expect(stats.min).toBe(10);
    expect(stats.max).toBe(40);
    expect(stats.minLocation).toEqual({ row: 0, col: 0, lat: 0, lon: 70 });
    expect(stats.maxLocation).toEqual({ row: 1, col: 1, lat: 60, lon: 80 });
  });

  it('filters strictly to a user-defined lat/lon bounding box and reports empty boxes safely', () => {
    const grid = new Float32Array([
      1, 2, 3,
      4, 5, 6,
      7, 8, 9,
    ]);
    const lat = [10, 20, 30];
    const lon = [70, 80, 90];

    // Select only lat=20..30, lon=80..90 -> values 5, 6, 8, 9
    const w20 = Math.cos((20 * Math.PI) / 180);
    const w30 = Math.cos((30 * Math.PI) / 180);
    const expectedMean = (w20 * (5 + 6) + w30 * (8 + 9)) / (2 * w20 + 2 * w30);

    const sub = computeAreaWeightedStats(grid, lat, lon, {
      latMin: 20,
      latMax: 30,
      lonMin: 80,
      lonMax: 90,
    });
    expect(sub.cellCount).toBe(4);
    expect(sub.weightedMean).toBeCloseTo(expectedMean, 6);
    expect(sub.min).toBe(5);
    expect(sub.max).toBe(9);
    expect(sub.maxLocation).toEqual({ row: 2, col: 2, lat: 30, lon: 90 });

    // Empty region outside grid
    const empty = computeAreaWeightedStats(grid, lat, lon, {
      latMin: 40,
      latMax: 45,
      lonMin: 110,
      lonMax: 120,
    });
    expect(empty.cellCount).toBe(0);
    expect(Number.isNaN(empty.weightedMean)).toBe(true);
    expect(empty.maxLocation).toBeNull();
  });

  it('computes daily series in display units across all forecast steps', () => {
    const raw = makeDummyRollout(3);
    // Set uniform 300.15 K (27°C) on Day 1, 302.15 K (29°C) on Day 2, 304.15 K (31°C) on Day 3
    for (let s = 0; s < 3; s += 1) {
      for (let r = 0; r < 32; r += 1) {
        for (let c = 0; c < 36; c += 1) {
          raw[s][0][r][c] = 300.15 + s * 2;
        }
      }
    }
    const packed = packRollout(raw);
    const lat = Array.from({ length: 32 }, (_, i) => 6.5 + i);
    const lon = Array.from({ length: 36 }, (_, i) => 65.5 + i);

    const series = computeDailyVariableSeries(
      packed,
      't2m',
      lat,
      lon,
      PRESET_REGIONS[1],
    );
    expect(series).toHaveLength(3);
    expect(series[0].day).toBe(1);
    expect(series[0].domain.weightedMean).toBeCloseTo(27, 4);
    expect(series[1].day).toBe(2);
    expect(series[1].domain.weightedMean).toBeCloseTo(29, 4);
    expect(series[2].day).toBe(3);
    expect(series[2].domain.weightedMean).toBeCloseTo(31, 4);
    expect(series[2].region.cellCount).toBeGreaterThan(0);
  });
});
