import { describe, expect, it } from 'vitest';
import {
  buildPerturbationTensor,
  cloneShockConfig,
  equirectangularDistanceDeg,
  evaluateFootprintWeight,
  MAX_SHOCK_FILE_BYTES,
  parseAndValidateShockConfigJson,
  serializeShockConfigJson,
  SHOCK_PRESETS,
} from '../utils/shockBuilder';

const ASC_LAT = Array.from({ length: 32 }, (_, i) => 6.5 + i); // 6.5..37.5°N
const DESC_LAT = Array.from({ length: 32 }, (_, i) => 37.5 - i); // 37.5..6.5°N
const ASC_LON = Array.from({ length: 36 }, (_, i) => 65.5 + i); // 65.5..100.5°E

describe('Phase 2B Live Shock Builder (shockBuilder.ts)', () => {
  it('builds an exact [6][32][36] all-zero perturbation for Control — Zero Shock', () => {
    const control = cloneShockConfig(
      SHOCK_PRESETS.find((p) => p.id === 'control_zero')!.config,
    );
    const res = buildPerturbationTensor(control, ASC_LAT, ASC_LON);

    expect(res.ok).toBe(true);
    expect(res.validationErrors).toEqual([]);
    expect(res.isAllZero).toBe(true);
    expect(res.perturbation.length).toBe(6);
    for (let ch = 0; ch < 6; ch += 1) {
      expect(res.perturbation[ch].length).toBe(32);
      for (let r = 0; r < 32; r += 1) {
        expect(res.perturbation[ch][r].length).toBe(36);
        for (let c = 0; c < 36; c += 1) {
          expect(res.perturbation[ch][r][c]).toBe(0);
          expect(Object.is(res.perturbation[ch][r][c], -0)).toBe(false);
        }
      }
    }
  });

  it('constructs exact box footprint perturbations with zero outside and peakDelta inside across multiple channels', () => {
    const config = cloneShockConfig(
      SHOCK_PRESETS.find((p) => p.id === 'warm_bay_of_bengal')!.config,
    );
    config.box = { latMin: 10.0, latMax: 13.0, lonMin: 85.0, lonMax: 88.0 };
    // Enable t2m (+2.5 K) and tcwv (+4.0 kg/m²) simultaneously
    config.channels = config.channels.map((entry) => {
      if (entry.channel === 't2m') return { ...entry, enabled: true, peakDelta: 2.5 };
      if (entry.channel === 'tcwv') return { ...entry, enabled: true, peakDelta: 4.0 };
      return { ...entry, enabled: false, peakDelta: 0 };
    });

    const res = buildPerturbationTensor(config, ASC_LAT, ASC_LON);
    expect(res.ok).toBe(true);
    expect(res.isAllZero).toBe(false);
    // Enclosed lat: 10.5, 11.5, 12.5 (3 rows); enclosed lon: 85.5, 86.5, 87.5 (3 cols) -> 9 cells
    expect(res.selectedCellCount).toBe(9);
    expect(res.maxAbsByChannel.t2m).toBeCloseTo(2.5, 6);
    expect(res.maxAbsByChannel.tcwv).toBeCloseTo(4.0, 6);
    expect(res.maxAbsByChannel.tp).toBe(0);
    expect(res.maxAbsByChannel.u10).toBe(0);
    expect(res.maxAbsByChannel.v10).toBe(0);
    expect(res.maxAbsByChannel.msl).toBe(0);

    for (let r = 0; r < 32; r += 1) {
      for (let c = 0; c < 36; c += 1) {
        const inside =
          ASC_LAT[r] >= 10.0 &&
          ASC_LAT[r] <= 13.0 &&
          ASC_LON[c] >= 85.0 &&
          ASC_LON[c] <= 88.0;
        expect(res.perturbation[0][r][c]).toBe(inside ? 2.5 : 0); // t2m is channel 0
        expect(res.perturbation[5][r][c]).toBe(inside ? 4.0 : 0); // tcwv is channel 5
        expect(res.perturbation[1][r][c]).toBe(0);
      }
    }
  });

  it('places the perturbation at identical physical coordinates regardless of ascending vs descending lat orientation', () => {
    const config = cloneShockConfig(
      SHOCK_PRESETS.find((p) => p.id === 'weaker_arabian_sea_wind')!.config,
    );
    config.footprintType = 'gaussian';
    config.gaussian = {
      centerLat: 14.5,
      centerLon: 70.5,
      radiusDeg: 3.0,
      cutoffSigmas: 3,
    };

    const ascRes = buildPerturbationTensor(config, ASC_LAT, ASC_LON);
    const descRes = buildPerturbationTensor(config, DESC_LAT, ASC_LON);

    expect(ascRes.ok).toBe(true);
    expect(descRes.ok).toBe(true);
    expect(ascRes.selectedCellCount).toBe(descRes.selectedCellCount);

    // Coordinate (14.5°N, 70.5°E):
    // In ASC_LAT (6.5 + r): r = 8 -> 14.5
    // In DESC_LAT (37.5 - r): r = 23 -> 14.5
    // In ASC_LON (65.5 + c): c = 5 -> 70.5
    expect(ASC_LAT[8]).toBe(14.5);
    expect(DESC_LAT[23]).toBe(14.5);
    expect(ASC_LON[5]).toBe(70.5);

    // Channel 2 is u10 (-2.0 m/s peak at centre)
    expect(ascRes.perturbation[2][8][5]).toBeCloseTo(-2.0, 6);
    expect(descRes.perturbation[2][23][5]).toBeCloseTo(-2.0, 6);

    // Every physical lat/lon coordinate must match between ascending and reversed grids
    for (let rAsc = 0; rAsc < 32; rAsc += 1) {
      const rDesc = 31 - rAsc;
      expect(ASC_LAT[rAsc]).toBe(DESC_LAT[rDesc]);
      for (let c = 0; c < 36; c += 1) {
        expect(ascRes.perturbation[2][rAsc][c]).toBeCloseTo(
          descRes.perturbation[2][rDesc][c],
          6,
        );
      }
    }
  });

  it('verifies Gaussian centring, cosine-corrected longitudinal decay, symmetry, and cutoff boundary', () => {
    const config = cloneShockConfig(
      SHOCK_PRESETS.find((p) => p.id === 'warm_bay_of_bengal')!.config,
    );
    config.footprintType = 'gaussian';
    config.gaussian = {
      centerLat: 20.5,
      centerLon: 85.5,
      radiusDeg: 2.0,
      cutoffSigmas: 3,
    };

    // Exact centre has weight 1.0
    expect(evaluateFootprintWeight(config, 20.5, 85.5)).toBe(1);

    // Meridional offset of exactly 1 sigma (2.0 deg north/south) gives exp(-0.5) symmetrically
    const wNorth = evaluateFootprintWeight(config, 22.5, 85.5);
    const wSouth = evaluateFootprintWeight(config, 18.5, 85.5);
    expect(wNorth).toBeCloseTo(Math.exp(-0.5), 10);
    expect(wSouth).toBeCloseTo(wNorth, 10);

    // Zonal offset is cosine-corrected at centerLat = 20.5°N:
    // distance(20.5, 87.5) = 2.0 * cos(20.5°) < 2.0 -> strictly larger weight than meridional 2.0°
    const expectedLonDist = 2.0 * Math.cos((20.5 * Math.PI) / 180);
    expect(equirectangularDistanceDeg(20.5, 87.5, 20.5, 85.5)).toBeCloseTo(
      expectedLonDist,
      10,
    );
    const wEast = evaluateFootprintWeight(config, 20.5, 87.5);
    const wWest = evaluateFootprintWeight(config, 20.5, 83.5);
    expect(wEast).toBeCloseTo(wWest, 10);
    expect(wEast).toBeGreaterThan(wNorth);

    // Strictly beyond cutoff (3 * 2.0 = 6.0 deg -> e.g. 6.5 deg north) receives exact 0
    expect(evaluateFootprintWeight(config, 27.0, 85.5)).toBe(0);
    // Exactly at cutoff (6.0 deg north) still receives exp(-4.5) > 0
    expect(evaluateFootprintWeight(config, 26.5, 85.5)).toBeCloseTo(
      Math.exp(-4.5),
      10,
    );
  });

  it('rejects invalid box ranges and out-of-grid footprints', () => {
    const inverted = cloneShockConfig(
      SHOCK_PRESETS.find((p) => p.id === 'warm_bay_of_bengal')!.config,
    );
    inverted.box = { latMin: 22.0, latMax: 12.0, lonMin: 82.0, lonMax: 94.0 };
    const invertedRes = buildPerturbationTensor(inverted, ASC_LAT, ASC_LON);
    expect(invertedRes.ok).toBe(false);
    expect(invertedRes.validationErrors.join(' ')).toMatch(/latMin/i);

    const outOfGrid = cloneShockConfig(
      SHOCK_PRESETS.find((p) => p.id === 'warm_bay_of_bengal')!.config,
    );
    outOfGrid.box = { latMin: 40.0, latMax: 45.0, lonMin: 110.0, lonMax: 115.0 };
    const outRes = buildPerturbationTensor(outOfGrid, ASC_LAT, ASC_LON);
    expect(outRes.ok).toBe(false);
    expect(outRes.selectedCellCount).toBe(0);
    expect(outRes.validationErrors.join(' ')).toMatch(/overlap|0 grid cells/i);
  });

  it('round-trips valid shock JSON and rejects malformed, unknown-field, wrong-order, and >1 MB imports', () => {
    const preset = SHOCK_PRESETS.find((p) => p.id === 'warm_bay_of_bengal')!.config;
    const json = serializeShockConfigJson(preset);
    const okParsed = parseAndValidateShockConfigJson(json);
    expect(okParsed.ok).toBe(true);
    if (okParsed.ok) {
      expect(okParsed.config.name).toBe(preset.name);
      expect(okParsed.config.channels[0].peakDelta).toBe(2.0);
    }

    // Oversized (> 1 MB)
    const oversized = parseAndValidateShockConfigJson(json, MAX_SHOCK_FILE_BYTES + 1);
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) {
      expect(oversized.errors[0]).toMatch(/1 MB/i);
    }

    // Malformed JSON
    const syntaxBad = parseAndValidateShockConfigJson('{not valid json');
    expect(syntaxBad.ok).toBe(false);

    // Unsupported extra field (strict Zod schema prevents untrusted object merge)
    const rawObj = JSON.parse(json) as Record<string, unknown>;
    rawObj.injectedField = 'evil';
    const strictBad = parseAndValidateShockConfigJson(JSON.stringify(rawObj));
    expect(strictBad.ok).toBe(false);

    // Wrong channel ordering
    const swapped = cloneShockConfig(preset);
    const tmp = swapped.channels[0];
    swapped.channels[0] = swapped.channels[1];
    swapped.channels[1] = tmp;
    const orderBad = parseAndValidateShockConfigJson(JSON.stringify(swapped));
    expect(orderBad.ok).toBe(false);
    if (!orderBad.ok) {
      expect(orderBad.errors.join(' ')).toMatch(/API contract order/i);
    }
  });
});
