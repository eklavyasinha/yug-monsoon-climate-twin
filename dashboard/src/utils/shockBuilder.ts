import { z } from 'zod';
import { GRID_SPEC } from '../config/projectFacts';
import {
  CHANNEL_KEYS_ORDERED,
  cloneShockConfig,
  getShockPresetById,
  SHOCK_PRESETS,
  type ChannelKey,
  type ShockBoxConfig,
  type ShockChannelEntry,
  type ShockConfig,
  type ShockFootprintType,
  type ShockGaussianConfig,
  type ShockPresetId,
  type ShockPresetMeta,
} from '../config/shockPresets';
import { ROLLOUT_COLS, ROLLOUT_ROWS } from './rolloutStore';
import { containsForbiddenProtoKey, parseJsonSafely } from './safeJson';

export {
  CHANNEL_KEYS_ORDERED,
  cloneShockConfig,
  getShockPresetById,
  SHOCK_PRESETS,
  type ChannelKey,
  type ShockBoxConfig,
  type ShockChannelEntry,
  type ShockConfig,
  type ShockFootprintType,
  type ShockGaussianConfig,
  type ShockPresetId,
  type ShockPresetMeta,
};

export const MAX_SHOCK_FILE_BYTES = 1_048_576; // 1 MB hard limit for imported shock definitions

const finiteNumber = z
  .number({ error: 'Expected finite number' })
  .refine((v) => Number.isFinite(v), {
    message: 'Must be a finite number (NaN/Inf prohibited)',
  });

export const shockBoxSchema = z
  .object({
    latMin: finiteNumber,
    latMax: finiteNumber,
    lonMin: finiteNumber,
    lonMax: finiteNumber,
  })
  .strict()
  .refine((b) => b.latMin < b.latMax, {
    message: 'Box latMin must be strictly less than latMax',
  })
  .refine((b) => b.lonMin < b.lonMax, {
    message: 'Box lonMin must be strictly less than lonMax',
  });

export const shockGaussianSchema = z
  .object({
    centerLat: finiteNumber,
    centerLon: finiteNumber,
    radiusDeg: finiteNumber.refine((v) => v > 0 && v <= 30, {
      message: 'Gaussian radiusDeg must be between 0 (exclusive) and 30 degrees',
    }),
    cutoffSigmas: finiteNumber
      .refine((v) => v >= 1 && v <= 6, {
        message: 'Gaussian cutoffSigmas must be between 1 and 6',
      })
      .default(3),
  })
  .strict();

export const shockChannelEntrySchema = z
  .object({
    channel: z.enum(['t2m', 'tp', 'u10', 'v10', 'msl', 'tcwv']),
    enabled: z.boolean(),
    peakDelta: finiteNumber,
  })
  .strict();

export const shockConfigSchema = z
  .object({
    schema: z.literal('mom-shock-v1'),
    presetId: z.enum([
      'control_zero',
      'warm_bay_of_bengal',
      'weaker_arabian_sea_wind',
      'custom',
    ]),
    name: z.string().trim().min(1, 'Shock name is required').max(120),
    notes: z.string().max(600).default(''),
    footprintType: z.enum(['box', 'gaussian']),
    box: shockBoxSchema,
    gaussian: shockGaussianSchema,
    channels: z
      .array(shockChannelEntrySchema)
      .length(
        GRID_SPEC.channelCount,
        `Shock config must specify all ${GRID_SPEC.channelCount} channels in canonical order`,
      )
      .refine(
        (entries) =>
          entries.every((e, idx) => e.channel === CHANNEL_KEYS_ORDERED[idx]),
        {
          message: `Channels must appear in exact API contract order: ${CHANNEL_KEYS_ORDERED.join(', ')}`,
        },
      ),
  })
  .strict();



/**
 * Equirectangular (cosine-corrected) angular distance in degrees on the regional
 * India lat/lon grid (6.5–37.5°N, 65.5–100.5°E).
 *
 * Assumption: Small-angle local tangent projection anchored at `centerLat`
 * (`dLonScaled = (lon - centerLon) * cos(centerLat * pi / 180)`).
 * Within this ~31° × 35° tropical-to-subtropical domain, this avoids meridian
 * stretching while remaining exact, deterministic, and transparent.
 */
export function equirectangularDistanceDeg(
  latDeg: number,
  lonDeg: number,
  centerLatDeg: number,
  centerLonDeg: number,
): number {
  const cosLat0 = Math.cos((centerLatDeg * Math.PI) / 180);
  const dLat = latDeg - centerLatDeg;
  const dLon = (lonDeg - centerLonDeg) * cosLat0;
  return Math.hypot(dLat, dLon);
}

/**
 * Evaluates the spatial weight `w ∈ [0, 1]` at `(latDeg, lonDeg)` for a box or
 * Gaussian footprint.
 *
 * - Box: `1` when `latMin <= latDeg <= latMax` and `lonMin <= lonDeg <= lonMax`, else `0`.
 * - Gaussian: `exp(-d² / (2 * radiusDeg²))` when `d <= cutoffSigmas * radiusDeg`, else `0`.
 */
export function evaluateFootprintWeight(
  config: ShockConfig,
  latDeg: number,
  lonDeg: number,
): number {
  if (config.footprintType === 'box') {
    const inside =
      latDeg >= config.box.latMin &&
      latDeg <= config.box.latMax &&
      lonDeg >= config.box.lonMin &&
      lonDeg <= config.box.lonMax;
    return inside ? 1 : 0;
  }

  const dist = equirectangularDistanceDeg(
    latDeg,
    lonDeg,
    config.gaussian.centerLat,
    config.gaussian.centerLon,
  );
  const cutoff = config.gaussian.cutoffSigmas * config.gaussian.radiusDeg;
  if (dist > cutoff) {
    return 0;
  }
  return Math.exp(-(dist * dist) / (2 * config.gaussian.radiusDeg * config.gaussian.radiusDeg));
}

export interface BuiltPerturbationResult {
  readonly ok: boolean;
  readonly validationErrors: string[];
  readonly perturbation: number[][][];
  readonly previewGrids: Record<ChannelKey, Float32Array>;
  readonly footprintMask: Uint8Array;
  readonly selectedCellCount: number;
  readonly isAllZero: boolean;
  readonly maxAbsByChannel: Record<ChannelKey, number>;
}

/**
 * Builds the exact `[6][32][36]` physical-unit perturbation array expected by
 * `POST /simulate`, honoring the actual IC `lat` and `lon` arrays regardless
 * of whether `lat` is ascending or descending.
 */
export function buildPerturbationTensor(
  config: ShockConfig,
  lat: readonly number[],
  lon: readonly number[],
): BuiltPerturbationResult {
  const errors: string[] = [];

  const parsed = shockConfigSchema.safeParse(config);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join('.') || 'config'}: ${issue.message}`);
    }
  }

  if (lat.length !== ROLLOUT_ROWS || lon.length !== ROLLOUT_COLS) {
    errors.push(
      `Expected grid axes of length ${ROLLOUT_ROWS} × ${ROLLOUT_COLS}, received ${lat.length} × ${lon.length}.`,
    );
  }

  const latMinGrid = Math.min(...lat);
  const latMaxGrid = Math.max(...lat);
  const lonMinGrid = Math.min(...lon);
  const lonMaxGrid = Math.max(...lon);

  if (config.footprintType === 'box') {
    if (
      config.box.latMax < latMinGrid ||
      config.box.latMin > latMaxGrid ||
      config.box.lonMax < lonMinGrid ||
      config.box.lonMin > lonMaxGrid
    ) {
      errors.push(
        `Box footprint does not overlap the IC grid extent (${latMinGrid.toFixed(1)}–${latMaxGrid.toFixed(1)}°N, ${lonMinGrid.toFixed(1)}–${lonMaxGrid.toFixed(1)}°E).`,
      );
    }
  } else {
    if (
      config.gaussian.centerLat < latMinGrid ||
      config.gaussian.centerLat > latMaxGrid ||
      config.gaussian.centerLon < lonMinGrid ||
      config.gaussian.centerLon > lonMaxGrid
    ) {
      errors.push(
        `Gaussian centre (${config.gaussian.centerLat.toFixed(1)}°N, ${config.gaussian.centerLon.toFixed(1)}°E) must lie within the IC grid extent (${latMinGrid.toFixed(1)}–${latMaxGrid.toFixed(1)}°N, ${lonMinGrid.toFixed(1)}–${lonMaxGrid.toFixed(1)}°E).`,
      );
    }
  }

  const footprintMask = new Uint8Array(ROLLOUT_ROWS * ROLLOUT_COLS);
  const weights = new Float32Array(ROLLOUT_ROWS * ROLLOUT_COLS);
  let selectedCellCount = 0;

  for (let r = 0; r < ROLLOUT_ROWS; r += 1) {
    const la = lat[r] ?? 0;
    for (let c = 0; c < ROLLOUT_COLS; c += 1) {
      const lo = lon[c] ?? 0;
      const idx = r * ROLLOUT_COLS + c;
      const w = evaluateFootprintWeight(config, la, lo);
      weights[idx] = w;

      // Footprint mask for diagnostics:
      // - Box: cells inside [latMin..latMax, lonMin..lonMax] (w === 1)
      // - Gaussian: cells within 2*sigma of centre (covers ~95.4% amplitude)
      const inFootprint =
        config.footprintType === 'box'
          ? w > 0
          : equirectangularDistanceDeg(
              la,
              lo,
              config.gaussian.centerLat,
              config.gaussian.centerLon,
            ) <=
            2 * config.gaussian.radiusDeg;

      if (inFootprint) {
        footprintMask[idx] = 1;
        selectedCellCount += 1;
      }
    }
  }

  if (selectedCellCount === 0 && config.presetId !== 'control_zero') {
    errors.push('Footprint covers 0 grid cells. Expand bounds so at least one cell centre is enclosed.');
  }

  const perturbation: number[][][] = [];
  const previewGrids = {} as Record<ChannelKey, Float32Array>;
  const maxAbsByChannel = {} as Record<ChannelKey, number>;
  let isAllZero = true;

  for (let chIdx = 0; chIdx < GRID_SPEC.channelCount; chIdx += 1) {
    const chKey = CHANNEL_KEYS_ORDERED[chIdx];
    const entry = config.channels[chIdx];
    const activeDelta = entry && entry.enabled ? entry.peakDelta : 0;

    const grid2d: number[][] = [];
    const flat = new Float32Array(ROLLOUT_ROWS * ROLLOUT_COLS);
    let maxAbs = 0;

    for (let r = 0; r < ROLLOUT_ROWS; r += 1) {
      const rowArr: number[] = new Array<number>(ROLLOUT_COLS);
      for (let c = 0; c < ROLLOUT_COLS; c += 1) {
        const idx = r * ROLLOUT_COLS + c;
        const val = activeDelta === 0 ? 0 : activeDelta * weights[idx];
        if (!Number.isFinite(val)) {
          errors.push(`Non-finite perturbation generated at channel ${chKey} [${r},${c}].`);
          rowArr[c] = 0;
          flat[idx] = 0;
        } else {
          // Avoid -0 in JSON serialization
          const clean = val === 0 ? 0 : val;
          rowArr[c] = clean;
          flat[idx] = clean;
          const absVal = Math.abs(clean);
          if (absVal > 0) isAllZero = false;
          if (absVal > maxAbs) maxAbs = absVal;
        }
      }
      grid2d.push(rowArr);
    }

    perturbation.push(grid2d);
    previewGrids[chKey] = flat;
    maxAbsByChannel[chKey] = maxAbs;
  }

  // Final tensor structural sanity verification
  if (
    perturbation.length !== GRID_SPEC.channelCount ||
    perturbation.some(
      (ch) =>
        ch.length !== ROLLOUT_ROWS || ch.some((row) => row.length !== ROLLOUT_COLS),
    )
  ) {
    errors.push('Perturbation tensor failed exact [6, 32, 36] shape check.');
  }

  return {
    ok: errors.length === 0,
    validationErrors: errors,
    perturbation,
    previewGrids,
    footprintMask,
    selectedCellCount,
    isAllZero,
    maxAbsByChannel,
  };
}

export type ShockJsonParseResult =
  | { ok: true; config: ShockConfig }
  | { ok: false; errors: string[] };

/**
 * Safely parses and Zod-validates an imported shock configuration JSON file.
 * Enforces the 1 MB maximum size limit and never merges untrusted objects into state.
 */
export function parseAndValidateShockConfigJson(
  rawText: string,
  fileSizeBytes?: number,
): ShockJsonParseResult {
  const actualBytes =
    fileSizeBytes ?? new TextEncoder().encode(rawText).byteLength;

  if (actualBytes > MAX_SHOCK_FILE_BYTES) {
    return {
      ok: false,
      errors: [
        `Shock configuration file (${(actualBytes / (1024 * 1024)).toFixed(2)} MB) exceeds the 1 MB maximum limit.`,
      ],
    };
  }

  if (containsForbiddenProtoKey(rawText)) {
    return {
      ok: false,
      errors: [
        'Shock configuration JSON contains forbidden object keys (__proto__, constructor, or prototype).',
      ],
    };
  }

  let parsedUnknown: unknown;
  try {
    parsedUnknown = parseJsonSafely(rawText);
  } catch {
    return {
      ok: false,
      errors: ['Invalid JSON syntax in imported shock configuration file.'],
    };
  }

  const result = shockConfigSchema.safeParse(parsedUnknown);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map(
        (issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`,
      ),
    };
  }

  return { ok: true, config: cloneShockConfig(result.data) };
}

export function serializeShockConfigJson(config: ShockConfig): string {
  const validated = shockConfigSchema.parse(config);
  return `${JSON.stringify(validated, null, 2)}\n`;
}
