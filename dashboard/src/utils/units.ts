import { scaleSequential } from 'd3-scale';
import {
  interpolateCividis,
  interpolateRdBu,
  interpolateYlGnBu,
} from 'd3-scale-chromatic';
import type { ChannelSpec } from '../config/projectFacts';
import type { DashboardVariable } from './rolloutStore';

export const KELVIN_OFFSET = 273.15;
export const PA_PER_HPA = 100;
export const CALM_WIND_THRESHOLD_MS = 1e-6;

/**
 * Convert temperature from Kelvin (wire unit) to degrees Celsius.
 * Returns NaN if input is non-finite.
 */
export function kelvinToCelsius(kelvin: number): number {
  if (!Number.isFinite(kelvin)) {
    return Number.NaN;
  }
  return kelvin - KELVIN_OFFSET;
}

/**
 * Convert temperature from degrees Celsius to Kelvin.
 */
export function celsiusToKelvin(celsius: number): number {
  if (!Number.isFinite(celsius)) {
    return Number.NaN;
  }
  return celsius + KELVIN_OFFSET;
}

/**
 * Convert pressure from Pascals (wire unit) to hectopascals (hPa / mbar).
 * Returns NaN if input is non-finite.
 */
export function pascalsToHpa(pascals: number): number {
  if (!Number.isFinite(pascals)) {
    return Number.NaN;
  }
  return pascals / PA_PER_HPA;
}

/**
 * Convert pressure from hectopascals (hPa) to Pascals.
 */
export function hpaToPascals(hpa: number): number {
  if (!Number.isFinite(hpa)) {
    return Number.NaN;
  }
  return hpa * PA_PER_HPA;
}

/**
 * Compute scalar 10 m wind speed magnitude using hypot(u10, v10).
 * Returns NaN if either component is non-finite.
 */
export function computeWindSpeed(u10: number, v10: number): number {
  if (!Number.isFinite(u10) || !Number.isFinite(v10)) {
    return Number.NaN;
  }
  return Math.hypot(u10, v10);
}

/**
 * Compute wind direction **toward which** the wind blows (flow heading in degrees
 * clockwise from geographic North, in [0, 360)):
 *
 *   theta_toward = (atan2(u10, v10) * 180 / pi + 360) % 360
 *
 * where u10 is eastward wind (+E) and v10 is northward wind (+N):
 *   - (u10 =  0, v10 = +5) ->   0° (blowing toward North)
 *   - (u10 = +5, v10 =  0) ->  90° (blowing toward East)
 *   - (u10 =  0, v10 = -5) -> 180° (blowing toward South)
 *   - (u10 = -5, v10 =  0) -> 270° (blowing toward West)
 *
 * Returns `null` when wind speed is below CALM_WIND_THRESHOLD_MS (calm / undefined direction)
 * or when inputs are non-finite.
 */
export function computeWindDirectionTowardDeg(
  u10: number,
  v10: number,
): number | null {
  if (!Number.isFinite(u10) || !Number.isFinite(v10)) {
    return null;
  }
  if (Math.hypot(u10, v10) < CALM_WIND_THRESHOLD_MS) {
    return null;
  }
  const deg = (Math.atan2(u10, v10) * (180 / Math.PI) + 360) % 360;
  return deg === 360 ? 0 : deg;
}

const COMPASS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export function formatCompassHeading(deg: number | null): string {
  if (deg === null || !Number.isFinite(deg)) {
    return 'Calm';
  }
  const normalized = ((deg % 360) + 360) % 360;
  const sector = Math.round(normalized / 45) % 8;
  return COMPASS_8[sector];
}

export interface VariableDisplayMeta {
  readonly key: DashboardVariable;
  readonly label: string;
  readonly shortLabel: string;
  readonly rawUnit: string;
  readonly displayUnit: string;
  readonly decimals: number;
  readonly isDerived: boolean;
}

export const DASHBOARD_VARIABLES: readonly VariableDisplayMeta[] = [
  {
    key: 't2m',
    label: '2 m temperature (t2m)',
    shortLabel: 'Temperature',
    rawUnit: 'K',
    displayUnit: '°C',
    decimals: 2,
    isDerived: false,
  },
  {
    key: 'tp',
    label: 'Daily total precipitation (tp)',
    shortLabel: 'Precipitation',
    rawUnit: 'mm/day',
    displayUnit: 'mm/day',
    decimals: 2,
    isDerived: false,
  },
  {
    key: 'wind_speed',
    label: '10 m wind speed (hypot u10, v10)',
    shortLabel: 'Wind speed',
    rawUnit: 'm/s',
    displayUnit: 'm/s',
    decimals: 2,
    isDerived: true,
  },
  {
    key: 'u10',
    label: '10 m eastward wind (u10)',
    shortLabel: 'Eastward wind',
    rawUnit: 'm/s',
    displayUnit: 'm/s',
    decimals: 2,
    isDerived: false,
  },
  {
    key: 'v10',
    label: '10 m northward wind (v10)',
    shortLabel: 'Northward wind',
    rawUnit: 'm/s',
    displayUnit: 'm/s',
    decimals: 2,
    isDerived: false,
  },
  {
    key: 'msl',
    label: 'Mean sea level pressure (msl)',
    shortLabel: 'Sea-level pressure',
    rawUnit: 'Pa',
    displayUnit: 'hPa',
    decimals: 2,
    isDerived: false,
  },
  {
    key: 'tcwv',
    label: 'Total column water vapour (tcwv)',
    shortLabel: 'Water vapour',
    rawUnit: 'kg/m²',
    displayUnit: 'kg/m²',
    decimals: 2,
    isDerived: false,
  },
] as const;

export function getVariableMeta(variable: DashboardVariable): VariableDisplayMeta {
  const found = DASHBOARD_VARIABLES.find((v) => v.key === variable);
  if (!found) {
    throw new Error(`Unknown dashboard variable: ${variable}`);
  }
  return found;
}

/**
 * Converts a raw physical wire value to its display unit without modifying state.
 */
export function toDisplayValue(variable: DashboardVariable, rawValue: number): number {
  if (!Number.isFinite(rawValue)) return Number.NaN;
  switch (variable) {
    case 't2m':
      return kelvinToCelsius(rawValue);
    case 'msl':
      return pascalsToHpa(rawValue);
    default:
      return rawValue;
  }
}

/**
 * Converts a raw physical difference (Day B - Day A) to its display difference unit.
 * Note: temperature difference in Kelvin equals difference in Celsius (ΔK === Δ°C),
 * whereas pressure difference in Pascals converts to hPa via ΔPa / 100.
 */
export function toDisplayDelta(variable: DashboardVariable, rawDelta: number): number {
  if (!Number.isFinite(rawDelta)) return Number.NaN;
  if (variable === 'msl') {
    return pascalsToHpa(rawDelta);
  }
  return rawDelta;
}

/**
 * Format a finite physical readout with fixed decimals and explicit unit.
 */
export function formatPhysicalValue(
  value: number,
  unit: string,
  decimals = 2,
): string {
  if (!Number.isFinite(value)) {
    return `Non-finite ${unit}`;
  }
  return `${value.toFixed(decimals)} ${unit}`;
}

/**
 * Format a signed difference value (+ / −) with explicit unit.
 */
export function formatSignedDelta(
  value: number,
  unit: string,
  decimals = 2,
): string {
  if (!Number.isFinite(value)) {
    return `Non-finite ${unit}`;
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)} ${unit}`;
}

/**
 * Phase 1 scientific sequential/diverging colour-scale utility built on d3-scale.
 * Preserved for backward compatibility with Phase 1 tests.
 */
export function createChannelColorScale(
  channel: ChannelSpec['key'],
  domain: [number, number],
): (value: number) => string {
  switch (channel) {
    case 't2m':
      return scaleSequential(interpolateCividis).domain(domain).clamp(true);
    case 'tp':
    case 'tcwv':
      return scaleSequential(interpolateYlGnBu).domain(domain).clamp(true);
    case 'u10':
    case 'v10':
    case 'msl':
    default:
      return scaleSequential((t: number) => interpolateRdBu(1 - t))
        .domain(domain)
        .clamp(true);
  }
}
