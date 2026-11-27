import { describe, expect, it } from 'vitest';
import {
  MAX_IC_FILE_BYTES,
  parseAndValidateMomIcJson,
  validateMomIcObject,
} from '../utils/icSchema';
import { buildValidMomIc } from './fixtures';

describe('mom-ic-v1 schema and scientific validation', () => {
  it('validates a well-formed mom-ic-v1 file and measures representative JSON size well below 5 MB', () => {
    const ic = buildValidMomIc({ includeMask: true });
    const serialized = JSON.stringify(ic);
    const byteLength = new TextEncoder().encode(serialized).byteLength;

    // Documented evidence: representative JSON serialization is far below 5 MB
    expect(byteLength).toBeLessThan(MAX_IC_FILE_BYTES);
    expect(byteLength).toBeGreaterThan(100_000);

    const result = parseAndValidateMomIcJson(serialized, {
      fileName: 'valid-ic.json',
      fileSizeBytes: byteLength,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary.shape).toEqual([3, 6, 32, 36]);
      expect(result.summary.latOrientation).toBe('south-to-north');
      expect(result.summary.lonOrientation).toBe('west-to-east');
      expect(result.summary.hasLandSeaMask).toBe(true);
      expect(result.summary.warnings).toHaveLength(0);
    }
  });

  it('detects latitude orientation from actual grid.lat values and warns on north-to-south without mutating', () => {
    const ic = buildValidMomIc({ latDescending: true });
    const result = validateMomIcObject(ic);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary.latOrientation).toBe('north-to-south');
      expect(result.summary.latRange).toEqual([37.5, 6.5]);
      expect(result.data.grid.lat[0]).toBe(37.5);
      expect(
        result.summary.warnings.some((w) => w.code === 'latitude_descending'),
      ).toBe(true);
    }
  });

  it('rejects wrong dimensions (frames, channels, rows, cols)', () => {
    const badFrames = buildValidMomIc();
    badFrames.init_states = badFrames.init_states.slice(0, 2);
    expect(validateMomIcObject(badFrames).ok).toBe(false);

    const badRows = buildValidMomIc();
    badRows.init_states[0][0] = badRows.init_states[0][0].slice(0, 31);
    expect(validateMomIcObject(badRows).ok).toBe(false);

    const badCols = buildValidMomIc();
    badCols.init_states[0][0][0] = badCols.init_states[0][0][0].slice(0, 35);
    expect(validateMomIcObject(badCols).ok).toBe(false);

    const badLatLen = buildValidMomIc();
    badLatLen.grid.lat = badLatLen.grid.lat.slice(0, 30);
    expect(validateMomIcObject(badLatLen).ok).toBe(false);
  });

  it('rejects NaN and Infinity values in init_states and doy_sincos', () => {
    const withNaN = buildValidMomIc();
    withNaN.init_states[1][2][5][5] = Number.NaN;
    expect(validateMomIcObject(withNaN).ok).toBe(false);

    const withInf = buildValidMomIc();
    withInf.init_states[0][4][0][0] = Number.POSITIVE_INFINITY;
    expect(validateMomIcObject(withInf).ok).toBe(false);

    const withBadDoy = buildValidMomIc();
    withBadDoy.doy_sincos = [Number.NaN, 1.0];
    expect(validateMomIcObject(withBadDoy).ok).toBe(false);
  });

  it('rejects wrong channel order', () => {
    const wrongOrder = buildValidMomIc() as unknown as Record<string, unknown>;
    wrongOrder.channels = ['tp', 't2m', 'u10', 'v10', 'msl', 'tcwv'];
    const result = validateMomIcObject(wrongOrder);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain('exact contract order');
    }
  });

  it('rejects non-monotonic latitude or longitude arrays', () => {
    const nonMonotonicLat = buildValidMomIc();
    nonMonotonicLat.grid.lat[10] = nonMonotonicLat.grid.lat[9];
    expect(validateMomIcObject(nonMonotonicLat).ok).toBe(false);

    const nonMonotonicLon = buildValidMomIc();
    nonMonotonicLon.grid.lon[5] = nonMonotonicLon.grid.lon[2];
    expect(validateMomIcObject(nonMonotonicLon).ok).toBe(false);
  });

  it('emits plausibility warnings for extreme temperatures and negative precipitation without altering data', () => {
    const extreme = buildValidMomIc({ t2mValue: 165.0, tpValue: -0.75 });
    const result = validateMomIcObject(extreme);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        result.summary.warnings.some(
          (w) => w.code === 'temperature_out_of_plausible_range',
        ),
      ).toBe(true);
      expect(
        result.summary.warnings.some((w) => w.code === 'negative_precipitation'),
      ).toBe(true);
      // Confirm no silent clipping or repair occurred
      expect(result.data.init_states[0][0][0][0]).toBe(165.0);
      expect(result.data.init_states[0][1][0][0]).toBe(-0.75);
    }
  });

  it('rejects malformed JSON, missing fields, wrong schema version, and oversized files', () => {
    const malformed = parseAndValidateMomIcJson('{ invalid json');
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) {
      expect(malformed.errors[0]).toContain('Malformed JSON');
    }

    const missing = parseAndValidateMomIcJson(JSON.stringify({ schema: 'mom-ic-v1' }));
    expect(missing.ok).toBe(false);

    const wrongSchema = buildValidMomIc() as unknown as Record<string, unknown>;
    wrongSchema.schema = 'mom-ic-v2';
    expect(validateMomIcObject(wrongSchema).ok).toBe(false);

    const oversized = parseAndValidateMomIcJson('{}', {
      fileName: 'huge.json',
      fileSizeBytes: MAX_IC_FILE_BYTES + 1,
    });
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) {
      expect(oversized.errors[0]).toContain('exceeds the 5 MB limit');
    }
  });

  it('validates optional init_date and dates fields, rejects invalid calendar dates, and warns on DOY mismatch', () => {
    // July 14, 2021 DOY ~ 194
    const angle = (194 / 365) * 2 * Math.PI;
    const withDate = buildValidMomIc();
    withDate.init_date = '2021-07-14';
    withDate.dates = ['2021-07-12', '2021-07-13', '2021-07-14'];
    withDate.doy_sincos = [Math.sin(angle), Math.cos(angle)];

    const okResult = validateMomIcObject(withDate);
    expect(okResult.ok).toBe(true);
    if (okResult.ok) {
      expect(okResult.summary.initDateIso).toBe('2021-07-14');
      expect(okResult.summary.dayOneDateIso).toBe('2021-07-15');
      expect(okResult.summary.initDateSource).toBe('explicit_field');
      expect(
        okResult.summary.warnings.some((w) => w.code === 'doy_calendar_mismatch'),
      ).toBe(false);
    }

    const invalidLeap = buildValidMomIc() as unknown as Record<string, unknown>;
    invalidLeap.init_date = '2021-02-29';
    expect(validateMomIcObject(invalidLeap).ok).toBe(false);

    // Date in January with July doy_sincos -> non-blocking warning
    const mismatched = buildValidMomIc();
    mismatched.init_date = '2021-01-10';
    mismatched.doy_sincos = [Math.sin(angle), Math.cos(angle)];
    const warnResult = validateMomIcObject(mismatched);
    expect(warnResult.ok).toBe(true);
    if (warnResult.ok) {
      expect(
        warnResult.summary.warnings.some((w) => w.code === 'doy_calendar_mismatch'),
      ).toBe(true);
    }
  });
});
