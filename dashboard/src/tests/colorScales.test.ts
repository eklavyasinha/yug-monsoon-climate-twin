import { describe, expect, it } from 'vitest';
import {
  computeSymmetricDeltaRange,
  computeVariableRange,
  createDashboardColorScale,
  createDivergingDifferenceScale,
} from '../utils/colorScales';
import { packRollout } from '../utils/rolloutStore';
import { makeDummyRollout } from './fixtures';

describe('Scientific color scales (fixed vs per-day, log1p rainfall, RdBu diverging)', () => {
  it('computes fixed-across-run range vs per-day range accurately', () => {
    const raw = makeDummyRollout(3);
    // Day 1: 290..295 K (~16.85..21.85 °C)
    // Day 2: 300..315 K (~26.85..41.85 °C)
    for (let r = 0; r < 32; r += 1) {
      for (let c = 0; c < 36; c += 1) {
        raw[0][0][r][c] = 290 + (c / 35) * 5;
        raw[1][0][r][c] = 300 + (c / 35) * 15;
        raw[2][0][r][c] = 295;
      }
    }
    const packed = packRollout(raw);

    const fixed = computeVariableRange(packed, 't2m', 'fixed-run', 0);
    expect(fixed[0]).toBeCloseTo(290 - 273.15, 3);
    expect(fixed[1]).toBeCloseTo(315 - 273.15, 3);

    const perDay0 = computeVariableRange(packed, 't2m', 'per-day', 0);
    expect(perDay0[0]).toBeCloseTo(290 - 273.15, 3);
    expect(perDay0[1]).toBeCloseTo(295 - 273.15, 3);
  });

  it('uses documented log1p nonlinear scale for rainfall with actual mm/day tick labels', () => {
    const scale = createDashboardColorScale('tp', [0, 80]);
    expect(scale.scaleKind).toBe('sequential-log1p');
    expect(scale.paletteName.toLowerCase()).not.toContain('rainbow');

    expect(scale.normalizeValue(0)).toBe(0);
    expect(scale.normalizeValue(80)).toBeCloseTo(1, 6);

    // log1p(10) / log1p(80) ≈ 2.3979 / 4.3944 ≈ 0.5457 (giving clear contrast to moderate rain)
    const norm10 = scale.normalizeValue(10);
    expect(norm10).toBeCloseTo(Math.log1p(10) / Math.log1p(80), 6);
    expect(norm10).toBeGreaterThan(0.5);

    // Ticks show actual mm/day values starting at 0 and ending at 80
    expect(scale.ticks[0].value).toBe(0);
    expect(scale.ticks[scale.ticks.length - 1].value).toBe(80);
  });

  it('builds a symmetric zero-centered RdBu diverging scale for differences', () => {
    const rawDiffs = new Float32Array([-2.0, 0.0, 5.5, -1.2]);
    const range = computeSymmetricDeltaRange(rawDiffs, 't2m');
    expect(range[0]).toBeCloseTo(-5.5, 5);
    expect(range[1]).toBeCloseTo(5.5, 5);

    const scale = createDivergingDifferenceScale(range);
    expect(scale.scaleKind).toBe('diverging-rdbu');
    expect(scale.normalizeValue(0)).toBeCloseTo(0.5, 6);
    expect(scale.mapValueToColor(-5.5)).not.toBe(scale.mapValueToColor(5.5));
    expect(scale.ticks[2].value).toBeCloseTo(0, 6);
  });
});
