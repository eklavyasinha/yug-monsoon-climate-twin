import { describe, expect, it } from 'vitest';
import {
  buildImpactMetricsCsv,
  computeHeatDaysCellMetrics,
  computeHeatImpact,
  computePrecipitationCellMetrics,
  computeRainfallImpact,
  DEFAULT_IMPACT_THRESHOLDS,
} from '../utils/impactMetrics';
import {
  packRollout,
  ROLLOUT_COLS,
  ROLLOUT_ROWS,
} from '../utils/rolloutStore';
import { PRESET_REGIONS } from '../utils/aggregation';
import { makeDummyRollout } from './fixtures';

const ASC_LAT = Array.from({ length: ROLLOUT_ROWS }, (_, i) => 6.5 + i);
const ASC_LON = Array.from({ length: ROLLOUT_COLS }, (_, i) => 65.5 + i);

describe('Phase 2B Impact Lens Metrics (impactMetrics.ts)', () => {
  it('matches hand-computed precipitation accumulation, heavy-rain days, and dry-day counts', () => {
    // 4 days × 2 cells
    const day1 = new Float32Array([0.0, 12.0]);
    const day2 = new Float32Array([0.9, 10.0]);
    const day3 = new Float32Array([1.0, 5.5]);
    const day4 = new Float32Array([15.5, 0.2]);

    // Heavy >= 10 mm/day, Dry < 1.0 mm/day
    const res = computePrecipitationCellMetrics([day1, day2, day3, day4], 10, 1);

    // Cell 0: sum = 0 + 0.9 + 1.0 + 15.5 = 17.4 mm; heavy = 1 (day4); dry = 2 (day1=0, day2=0.9; day3=1.0 is NOT < 1)
    expect(res.accumulatedMm[0]).toBeCloseTo(17.4, 4);
    expect(res.heavyRainDays[0]).toBe(1);
    expect(res.dryDays[0]).toBe(2);

    // Cell 1: sum = 12 + 10 + 5.5 + 0.2 = 27.7 mm; heavy = 2 (day1=12, day2=10); dry = 1 (day4=0.2)
    expect(res.accumulatedMm[1]).toBeCloseTo(27.7, 4);
    expect(res.heavyRainDays[1]).toBe(2);
    expect(res.dryDays[1]).toBe(1);
  });

  it('matches hand-computed heat-day counts converting Kelvin to Celsius at the boundary', () => {
    // 35.0 °C = 308.15 K
    const day1 = new Float32Array([308.15, 308.14]); // [35.00°C -> hot, 34.99°C -> not hot]
    const day2 = new Float32Array([310.15, 309.15]); // [37.00°C -> hot, 36.00°C -> hot]
    const day3 = new Float32Array([300.15, 308.15]); // [27.00°C -> not hot, 35.00°C -> hot]

    const hotDays = computeHeatDaysCellMetrics([day1, day2, day3], 35.0);
    expect(hotDays[0]).toBe(2);
    expect(hotDays[1]).toBe(2);
  });

  it('computes cos(lat)-weighted regional rainfall & heat summaries and baseline-vs-scenario deltas accurately', () => {
    const baseRaw = makeDummyRollout(3);
    const scenRaw = makeDummyRollout(3);

    // Set deterministic precipitation (ch 1) & temperature (ch 0) inside Core Monsoon Zone (18..28°N, 73..86°E)
    const coreRegion = PRESET_REGIONS.find((r) => r.id === 'central_monsoon_zone')!;
    const dailyBaseTp = [0.5, 8.0, 14.0]; // sum = 22.5 mm, heavy(>=10)=1, dry(<1)=1
    const dailyScenTp = [2.0, 12.0, 18.0]; // sum = 32.0 mm (+9.5 mm), heavy(>=10)=2 (+1), dry(<1)=0 (-1)
    const dailyBaseT2m = [307.15, 309.15, 310.15]; // [34, 36, 37°C] -> 2 days >= 35°C
    const dailyScenT2m = [309.15, 310.15, 311.15]; // [36, 37, 38°C] -> 3 days >= 35°C (+1 day)

    for (let s = 0; s < 3; s += 1) {
      for (let r = 0; r < ROLLOUT_ROWS; r += 1) {
        for (let c = 0; c < ROLLOUT_COLS; c += 1) {
          baseRaw[s][1][r][c] = dailyBaseTp[s];
          scenRaw[s][1][r][c] = dailyScenTp[s];
          baseRaw[s][0][r][c] = dailyBaseT2m[s];
          scenRaw[s][0][r][c] = dailyScenT2m[s];
        }
      }
    }

    const base = packRollout(baseRaw);
    const scen = packRollout(scenRaw);

    const rain = computeRainfallImpact(
      base,
      scen,
      ASC_LAT,
      ASC_LON,
      coreRegion,
      10,
      1,
    );
    const heat = computeHeatImpact(base, scen, ASC_LAT, ASC_LON, coreRegion, 35);

    expect(rain.steps).toBe(3);
    expect(rain.regionBaselineAccum.weightedMean).toBeCloseTo(22.5, 4);
    expect(rain.regionScenarioAccum?.weightedMean).toBeCloseTo(32.0, 4);
    expect(rain.regionDiffAccum?.weightedMean).toBeCloseTo(9.5, 4);
    expect(rain.regionBaselineHeavyDays.weightedMean).toBeCloseTo(1.0, 4);
    expect(rain.regionScenarioHeavyDays?.weightedMean).toBeCloseTo(2.0, 4);
    expect(rain.regionBaselineDryDays.weightedMean).toBeCloseTo(1.0, 4);
    expect(rain.regionScenarioDryDays?.weightedMean).toBeCloseTo(0.0, 4);

    expect(rain.dailyRegionalSequence).toHaveLength(3);
    expect(rain.dailyRegionalSequence[0].baselineMeanMmDay).toBeCloseTo(0.5, 4);
    expect(rain.dailyRegionalSequence[0].scenarioMeanMmDay).toBeCloseTo(2.0, 4);
    expect(rain.dailyRegionalSequence[0].diffMmDay).toBeCloseTo(1.5, 4);

    expect(heat.regionBaselineHotDays.weightedMean).toBeCloseTo(2.0, 4);
    expect(heat.regionScenarioHotDays?.weightedMean).toBeCloseTo(3.0, 4);
    expect(heat.regionDiffHotDays?.weightedMean).toBeCloseTo(1.0, 4);

    const csv = buildImpactMetricsCsv(rain, heat, {
      region: coreRegion,
      thresholds: DEFAULT_IMPACT_THRESHOLDS,
      icLabel: 'Test IC 2021-07-14',
      initDateIso: '2021-07-14',
      modelName: 'WeatherNet-Rollout',
      scenarioLabel: 'Warm Bay of Bengal',
      baselineInferenceMs: 420.5,
      scenarioInferenceMs: 430.2,
    });

    expect(csv).toContain('# Initialization Date: 2021-07-14');
    expect(csv).toContain('# Valid Forecast Window: Jul 15 – Jul 17, 2021');
    expect(csv).toContain('accumulated_rainfall,mm,22.500,32.000,9.500');
    expect(csv).toContain('heavy_rain_days (>= 10 mm/day),days,1.000,2.000,1.000');
    expect(csv).toContain('dry_days (< 1 mm/day),days,1.000,0.000,-1.000');
    expect(csv).toContain('heat_days (>= 35 C),days,2.000,3.000,1.000');
    expect(csv).toContain('not validated impact forecasts');
    expect(csv).toContain(
      'forecast_day,valid_date,baseline_region_mean_tp_mm_day',
    );
    expect(csv).toContain('1,2021-07-15,');
    expect(csv).toContain('3,2021-07-17,');
  });
});
