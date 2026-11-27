import { describe, expect, it } from 'vitest';
import { PRESET_REGIONS } from '../utils/aggregation';
import { buildTimeSeriesCsv } from '../utils/exportData';
import {
  isSyntheticFixtureEnabled,
  loadDevSyntheticFixture,
} from '../utils/fixtureLoader';

const SAMPLE_SERIES = [
  {
    day: 1,
    stepIndex: 0,
    domain: {
      weightedMean: 28.5,
      min: 14.2,
      max: 39.1,
      minLocation: { row: 31, col: 10, lat: 37.5, lon: 75.5 },
      maxLocation: { row: 15, col: 6, lat: 21.5, lon: 71.5 },
      cellCount: 1152,
      weightSum: 1042.5,
    },
    region: {
      weightedMean: 30.1,
      min: 22.0,
      max: 36.4,
      minLocation: { row: 12, col: 10, lat: 18.5, lon: 75.5 },
      maxLocation: { row: 16, col: 14, lat: 22.5, lon: 79.5 },
      cellCount: 120,
      weightSum: 110.2,
    },
  },
];

describe('Client-side CSV export & dev synthetic fixture guards', () => {
  it('generates clean CSV with actual backend provenance for real runs', () => {
    const csv = buildTimeSeriesCsv(SAMPLE_SERIES, {
      variable: 't2m',
      region: PRESET_REGIONS[1],
      modelName: 'WeatherNet-Rollout-Baseline',
      icLabel: '2024-07-15.json',
      inferenceMs: 412.5,
      roundTripMs: 488.2,
      isSyntheticFixture: false,
    });

    expect(csv).toContain('Actual Backend Simulation Export');
    expect(csv).toContain('ACTUAL_BACKEND_RESPONSE');
    expect(csv).not.toContain('SYNTHETIC FIXTURE');
    expect(csv).toContain('28.5000');
    expect(csv).toContain('cos(latitude)-weighted average');
  });

  it('watermarks synthetic fixture CSV exports prominently', () => {
    const csv = buildTimeSeriesCsv(SAMPLE_SERIES, {
      variable: 'tp',
      region: PRESET_REGIONS[0],
      modelName: 'SYNTHETIC_DEV_FIXTURE',
      icLabel: 'SYNTHETIC_DEV_FIXTURE',
      inferenceMs: 0,
      roundTripMs: 0,
      isSyntheticFixture: true,
    });

    expect(csv).toContain('SYNTHETIC FIXTURE — NOT MODEL OUTPUT');
    expect(csv).toContain('SYNTHETIC_FIXTURE_NOT_MODEL_OUTPUT');
  });

  it('includes dynamic initialization date and valid_date column when initDateIso is provided', () => {
    const csv = buildTimeSeriesCsv(SAMPLE_SERIES, {
      variable: 't2m',
      region: PRESET_REGIONS[1],
      modelName: 'WeatherNet-Rollout-Baseline',
      icLabel: '2021-07-14 IC',
      initDateIso: '2021-07-14',
      inferenceMs: 412.5,
      roundTripMs: 488.2,
      isSyntheticFixture: false,
    });

    expect(csv).toContain('# Initialization Date: 2021-07-14');
    expect(csv).toContain('# Valid Forecast Window: Jul 15, 2021');
    expect(csv).toContain('forecast_day,valid_date,variable,unit,domain_coslat_mean');
    expect(csv).toContain('1,2021-07-15,t2m,°C,28.5000');
  });

  it('keeps synthetic test fixture strictly disabled by default', async () => {
    expect(isSyntheticFixtureEnabled()).toBe(false);
    await expect(loadDevSyntheticFixture()).rejects.toThrow(
      /Synthetic test fixture is disabled/i,
    );
  });
});
