import { describe, expect, it } from 'vitest';
import {
  computeExperimentFixedSymmetricRange,
  computeIntegrityDiagnostics,
  computeLabDayMetrics,
  computeScenarioMinusBaselineGrid,
} from '../utils/labDiagnostics';
import {
  packRollout,
  ROLLOUT_COLS,
  ROLLOUT_ROWS,
  rolloutIndex,
} from '../utils/rolloutStore';
import { makeDummyRollout } from './fixtures';

const ASC_LAT = Array.from({ length: ROLLOUT_ROWS }, (_, i) => 6.5 + i);
const ASC_LON = Array.from({ length: ROLLOUT_COLS }, (_, i) => 65.5 + i);

describe('Phase 2B Experiment Lab Diagnostics (labDiagnostics.ts)', () => {
  it('computes exact Scenario minus Baseline difference sign', () => {
    const baseRaw = makeDummyRollout(3);
    const scenRaw = makeDummyRollout(3);

    // Cell (2, 4) on Day 1 (step 0), t2m (ch 0): scenario +3.5 K warmer than baseline
    scenRaw[0][0][2][4] = baseRaw[0][0][2][4] + 3.5;
    // Cell (5, 7) on Day 1 (step 0), t2m (ch 0): scenario -1.25 K cooler than baseline
    scenRaw[0][0][5][7] = baseRaw[0][0][5][7] - 1.25;

    const base = packRollout(baseRaw);
    const scen = packRollout(scenRaw);

    const diff = computeScenarioMinusBaselineGrid(base, scen, 0, 't2m');
    expect(diff[2 * ROLLOUT_COLS + 4]).toBeCloseTo(3.5, 4);
    expect(diff[5 * ROLLOUT_COLS + 7]).toBeCloseTo(-1.25, 4);
    expect(diff[0]).toBeCloseTo(0, 6);
  });

  it('locks symmetric diverging range across all days of an experiment', () => {
    const baseRaw = makeDummyRollout(4);
    const scenRaw = makeDummyRollout(4);

    // Small difference on Day 1 (+0.5 K), large negative difference on Day 4 (-4.2 K)
    scenRaw[0][0][10][10] = baseRaw[0][0][10][10] + 0.5;
    scenRaw[3][0][15][15] = baseRaw[3][0][15][15] - 4.2;

    const base = packRollout(baseRaw);
    const scen = packRollout(scenRaw);

    const [minLim, maxLim] = computeExperimentFixedSymmetricRange(
      base,
      scen,
      't2m',
    );
    expect(maxLim).toBeCloseTo(4.2, 4);
    expect(minLim).toBeCloseTo(-4.2, 4);
    expect(minLim).toBe(-maxLim);
  });

  it('computes exact hand-verified cos(lat)-weighted mean, RMS, max |Δ| location, and threshold fraction', () => {
    const baseRaw = makeDummyRollout(2);
    const scenRaw = makeDummyRollout(2);

    // Uniform +2.0 K on row 0 (lat 6.5°N) and -1.0 K on row 31 (lat 37.5°N); 0 elsewhere
    for (let c = 0; c < ROLLOUT_COLS; c += 1) {
      scenRaw[0][0][0][c] = baseRaw[0][0][0][c] + 2.0;
      scenRaw[0][0][31][c] = baseRaw[0][0][31][c] - 1.0;
    }
    // Single peak cell at (row=10, col=12) -> +5.0 K
    scenRaw[0][0][10][12] = baseRaw[0][0][10][12] + 5.0;

    const base = packRollout(baseRaw);
    const scen = packRollout(scenRaw);

    const metrics = computeLabDayMetrics(
      base,
      scen,
      0,
      't2m',
      ASC_LAT,
      ASC_LON,
      1.5, // threshold 1.5 °C -> matches all 36 cells on row 0 (+2.0) + 1 cell at (10,12) (+5.0) = 37 cells
    );

    expect(metrics.day).toBe(1);
    expect(metrics.maxAbsDiff).toBeCloseTo(5.0, 4);
    expect(metrics.maxAbsSignedDiff).toBeCloseTo(5.0, 4);
    expect(metrics.maxAbsLocation).toEqual({
      row: 10,
      col: 12,
      lat: ASC_LAT[10],
      lon: ASC_LON[12],
    });
    expect(metrics.cellsAboveThreshold).toBe(37);
    expect(metrics.totalCells).toBe(ROLLOUT_ROWS * ROLLOUT_COLS);
    expect(metrics.fractionAboveThreshold).toBeCloseTo(37 / 1152, 6);

    // Hand-compute cos(lat)-weighted mean and RMS
    let totalW = 0;
    let sumWD = 0;
    let sumWD2 = 0;
    for (let r = 0; r < ROLLOUT_ROWS; r += 1) {
      const w = Math.cos((ASC_LAT[r] * Math.PI) / 180);
      for (let c = 0; c < ROLLOUT_COLS; c += 1) {
        let d = 0;
        if (r === 0) d = 2.0;
        else if (r === 31) d = -1.0;
        else if (r === 10 && c === 12) d = 5.0;
        totalW += w;
        sumWD += w * d;
        sumWD2 += w * d * d;
      }
    }
    expect(metrics.meanDiff).toBeCloseTo(sumWD / totalW, 5);
    expect(metrics.cosLatRmsDiff).toBeCloseTo(Math.sqrt(sumWD2 / totalW), 5);
  });

  it('computes descriptive integrity diagnostics for zero-shock control, footprint containment, and negative precip detection', () => {
    const baseRaw = makeDummyRollout(3);
    const zeroScenRaw = makeDummyRollout(3);
    const base = packRollout(baseRaw);
    const zeroScen = packRollout(zeroScenRaw);

    const footprintMask = new Uint8Array(ROLLOUT_ROWS * ROLLOUT_COLS);
    footprintMask[4 * ROLLOUT_COLS + 6] = 1;
    footprintMask[4 * ROLLOUT_COLS + 7] = 1;

    // 1. Exact zero-shock control -> max diff === 0, footprint shares null
    const zeroReport = computeIntegrityDiagnostics(
      base,
      zeroScen,
      't2m',
      footprintMask,
    );
    expect(zeroReport.allValuesFinite).toBe(true);
    expect(zeroReport.precipitationNonNegative).toBe(true);
    expect(zeroReport.overallMaxAbsRawDiff).toBe(0);
    expect(zeroReport.selectedVarMaxAbsDiff).toBe(0);
    expect(zeroReport.day1FootprintShare).toBeNull();
    expect(zeroReport.finalDayFootprintShare).toBeNull();
    expect(zeroReport.day1OutsideTotalAbsDiff).toBe(0);

    // 2. Non-zero shock localized on Day 1 (100% inside), spreading outside by Day 3 (50% inside)
    const spreadRaw = makeDummyRollout(3);
    spreadRaw[0][0][4][6] = baseRaw[0][0][4][6] + 2.0; // Day 1 inside
    spreadRaw[2][0][4][6] = baseRaw[2][0][4][6] + 1.5; // Day 3 inside
    spreadRaw[2][0][20][20] = baseRaw[2][0][20][20] - 1.5; // Day 3 outside
    // Inject a negative precipitation cell to confirm diagnostic catches it
    spreadRaw[1][1][0][0] = -0.25;

    const spread = packRollout(spreadRaw);
    const spreadReport = computeIntegrityDiagnostics(
      base,
      spread,
      't2m',
      footprintMask,
    );

    expect(spreadReport.allValuesFinite).toBe(true);
    expect(spreadReport.precipitationNonNegative).toBe(false);
    expect(spreadReport.negativePrecipCount).toBe(1);
    expect(spreadReport.minPrecipMmDay).toBeCloseTo(-0.25, 5);
    expect(spreadReport.day1FootprintShare).toBeCloseTo(1.0, 6);
    expect(spreadReport.day1OutsideTotalAbsDiff).toBeCloseTo(0, 6);
    expect(spreadReport.finalDayNumber).toBe(3);
    expect(spreadReport.finalDayFootprintShare).toBeCloseTo(0.5, 5);
    expect(spreadReport.finalDayOutsideTotalAbsDiff).toBeCloseTo(1.5, 5);

    // Confirm non-finite detection works if Float32 buffer is corrupted
    const corrupt = packRollout(baseRaw);
    corrupt.data[rolloutIndex(0, 0, 1, 1)] = Number.NaN;
    const nanReport = computeIntegrityDiagnostics(
      base,
      corrupt,
      't2m',
      footprintMask,
    );
    expect(nanReport.allValuesFinite).toBe(false);
    expect(nanReport.nonFiniteCount).toBe(1);
  });
});
