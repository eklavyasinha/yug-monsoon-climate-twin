import { describe, expect, it } from 'vitest';
import {
  celsiusToKelvin,
  computeWindDirectionTowardDeg,
  computeWindSpeed,
  createChannelColorScale,
  formatCompassHeading,
  formatPhysicalValue,
  hpaToPascals,
  kelvinToCelsius,
  pascalsToHpa,
  toDisplayDelta,
  toDisplayValue,
} from '../utils/units';

describe('Physical unit conversions', () => {
  it('converts temperature accurately from Kelvin to Celsius', () => {
    expect(kelvinToCelsius(273.15)).toBeCloseTo(0, 6);
    expect(kelvinToCelsius(300.15)).toBeCloseTo(27, 6);
    expect(kelvinToCelsius(233.15)).toBeCloseTo(-40, 6);
    expect(kelvinToCelsius(333.15)).toBeCloseTo(60, 6);
  });

  it('converts temperature accurately from Celsius to Kelvin', () => {
    expect(celsiusToKelvin(0)).toBeCloseTo(273.15, 6);
    expect(celsiusToKelvin(30)).toBeCloseTo(303.15, 6);
  });

  it('returns NaN for non-finite temperature inputs', () => {
    expect(Number.isNaN(kelvinToCelsius(Number.NaN))).toBe(true);
    expect(Number.isNaN(kelvinToCelsius(Number.POSITIVE_INFINITY))).toBe(true);
    expect(Number.isNaN(celsiusToKelvin(Number.NEGATIVE_INFINITY))).toBe(true);
  });

  it('converts pressure accurately from Pascals to hectopascals', () => {
    expect(pascalsToHpa(101325)).toBeCloseTo(1013.25, 6);
    expect(pascalsToHpa(99850)).toBeCloseTo(998.5, 6);
    expect(hpaToPascals(1005.4)).toBeCloseTo(100540, 6);
  });

  it('returns NaN for non-finite pressure inputs', () => {
    expect(Number.isNaN(pascalsToHpa(Number.NaN))).toBe(true);
    expect(Number.isNaN(pascalsToHpa(Number.POSITIVE_INFINITY))).toBe(true);
  });

  it('computes wind speed via hypot(u10, v10)', () => {
    expect(computeWindSpeed(3, 4)).toBeCloseTo(5, 6);
    expect(computeWindSpeed(-6, 8)).toBeCloseTo(10, 6);
    expect(computeWindSpeed(0, 0)).toBe(0);
    expect(Number.isNaN(computeWindSpeed(Number.NaN, 2))).toBe(true);
  });

  it('computes wind direction toward which wind blows using documented atan2(u10, v10) convention', () => {
    // 0° = toward North (u=0, v>0)
    expect(computeWindDirectionTowardDeg(0, 5)).toBeCloseTo(0, 6);
    expect(formatCompassHeading(0)).toBe('N');

    // 90° = toward East (u>0, v=0)
    expect(computeWindDirectionTowardDeg(5, 0)).toBeCloseTo(90, 6);
    expect(formatCompassHeading(90)).toBe('E');

    // 180° = toward South (u=0, v<0)
    expect(computeWindDirectionTowardDeg(0, -5)).toBeCloseTo(180, 6);
    expect(formatCompassHeading(180)).toBe('S');

    // 270° = toward West (u<0, v=0)
    expect(computeWindDirectionTowardDeg(-5, 0)).toBeCloseTo(270, 6);
    expect(formatCompassHeading(270)).toBe('W');

    // Diagonal headings
    expect(computeWindDirectionTowardDeg(4, 4)).toBeCloseTo(45, 6);
    expect(formatCompassHeading(45)).toBe('NE');
    expect(computeWindDirectionTowardDeg(-4, -4)).toBeCloseTo(225, 6);
    expect(formatCompassHeading(225)).toBe('SW');

    // Calm wind returns null
    expect(computeWindDirectionTowardDeg(0, 0)).toBeNull();
    expect(formatCompassHeading(null)).toBe('Calm');
  });

  it('converts display values and display deltas accurately without offset errors', () => {
    expect(toDisplayValue('t2m', 300.15)).toBeCloseTo(27, 6);
    // Temperature differences are identical in K and °C (must NOT subtract 273.15!)
    expect(toDisplayDelta('t2m', 2.5)).toBeCloseTo(2.5, 6);
    expect(toDisplayValue('msl', 100800)).toBeCloseTo(1008, 6);
    expect(toDisplayDelta('msl', -350)).toBeCloseTo(-3.5, 6);
    expect(toDisplayValue('tp', 14.2)).toBeCloseTo(14.2, 6);
  });

  it('formats finite values with explicit units and rejects non-finite values', () => {
    expect(formatPhysicalValue(301.426, 'K', 2)).toBe('301.43 K');
    expect(formatPhysicalValue(Number.NaN, 'K', 2)).toBe('Non-finite K');
  });

  it('produces valid d3-scale colour outputs for channels', () => {
    const tempScale = createChannelColorScale('t2m', [260, 320]);
    const rainScale = createChannelColorScale('tp', [0, 50]);
    expect(typeof tempScale(300)).toBe('string');
    expect(tempScale(300).length).toBeGreaterThan(3);
    expect(typeof rainScale(12)).toBe('string');
  });
});
