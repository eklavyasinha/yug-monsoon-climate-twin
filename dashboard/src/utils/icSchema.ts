import { z } from 'zod';
import { CHANNEL_KEYS, GRID_SPEC } from '../config/projectFacts';
import {
  checkDoyCalendarConsistency,
  deriveIcInitializationDate,
  parseCalendarIsoDate,
  type InitDateSource,
} from './forecastDates';
import { containsForbiddenProtoKey, parseJsonSafely } from './safeJson';

/**
 * Measured serialization budget for `mom-ic-v1`:
 * - `init_states` [3][6][32][36] = 20,736 numbers
 * - optional `static.land_sea_mask` [32][36] = 1,152 numbers
 * - Total ~21,888 floats => ~440–520 KB as dense/pretty IEEE-754 JSON.
 * 5 MB (5,242,880 bytes) provides >10x headroom while rejecting accidental multi-gigabyte dumps.
 */
export const MAX_IC_FILE_BYTES = 5 * 1024 * 1024;

export const TEMP_PLAUSIBLE_MIN_K = 180;
export const TEMP_PLAUSIBLE_MAX_K = 340;
export const CONTRACT_TEMP_MIN_K = 233.15; // -40 °C
export const CONTRACT_TEMP_MAX_K = 333.15; // +60 °C

const finiteNumberSchema = z
  .number({
    error: 'Expected a finite number',
  })
  .refine((val) => Number.isFinite(val), {
    message: 'Value must be a finite number (NaN and Infinity are invalid)',
  });

const calendarIsoDateSchema = z
  .string()
  .refine((val) => parseCalendarIsoDate(val) !== null, {
    message: 'Date must be a valid YYYY-MM-DD calendar date',
  });

const gridRowSchema = z
  .array(finiteNumberSchema)
  .length(GRID_SPEC.cols, `Each latitude row must have exactly ${GRID_SPEC.cols} longitude columns`);

const grid2DSchema = z
  .array(gridRowSchema)
  .length(GRID_SPEC.rows, `Each 2D field must have exactly ${GRID_SPEC.rows} latitude rows`);

const frameChannelsSchema = z
  .array(grid2DSchema)
  .length(GRID_SPEC.channelCount, `Each frame must have exactly ${GRID_SPEC.channelCount} channels`);

const initStatesSchema = z
  .array(frameChannelsSchema)
  .length(GRID_SPEC.historySteps, `init_states must contain exactly ${GRID_SPEC.historySteps} consecutive daily frames`);

const exactChannelsTupleSchema = z
  .tuple([
    z.literal('t2m'),
    z.literal('tp'),
    z.literal('u10'),
    z.literal('v10'),
    z.literal('msl'),
    z.literal('tcwv'),
  ]);

export const momIcV1Schema = z
  .object({
    schema: z.literal('mom-ic-v1', {
      error: 'schema must be the exact string "mom-ic-v1"',
    }),
    label: z.string().min(1, 'label must be a non-empty string'),
    source_note: z.string().min(1, 'source_note must be a non-empty string'),
    init_date: calendarIsoDateSchema.optional(),
    dates: z
      .tuple([
        calendarIsoDateSchema,
        calendarIsoDateSchema,
        calendarIsoDateSchema,
      ])
      .optional(),
    doy_sincos: z.tuple([finiteNumberSchema, finiteNumberSchema]),
    channels: exactChannelsTupleSchema,
    grid: z
      .object({
        lat: z
          .array(finiteNumberSchema)
          .length(GRID_SPEC.rows, `grid.lat must contain exactly ${GRID_SPEC.rows} finite latitude values`),
        lon: z
          .array(finiteNumberSchema)
          .length(GRID_SPEC.cols, `grid.lon must contain exactly ${GRID_SPEC.cols} finite longitude values`),
      })
      .strict(),
    init_states: initStatesSchema,
    static: z
      .object({
        land_sea_mask: grid2DSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type MomIcV1 = z.infer<typeof momIcV1Schema>;

export type AxisDirection = 'ascending' | 'descending' | 'non-monotonic';
export type LatOrientation = 'south-to-north' | 'north-to-south';
export type LonOrientation = 'west-to-east' | 'east-to-west';

export interface IcValidationWarning {
  code:
    | 'temperature_out_of_plausible_range'
    | 'temperature_outside_contract_gate'
    | 'negative_precipitation'
    | 'latitude_descending'
    | 'longitude_descending'
    | 'doy_sincos_unit_circle'
    | 'doy_calendar_mismatch';
  message: string;
  count?: number;
}

export interface IcValidationSummary {
  fileName: string;
  fileSizeBytes: number;
  label: string;
  sourceNote: string;
  initDateIso: string | null;
  initDateSource: InitDateSource;
  dayOneDateIso: string | null;
  shape: [3, 6, 32, 36];
  hasLandSeaMask: boolean;
  latRange: [number, number];
  lonRange: [number, number];
  latOrientation: LatOrientation;
  lonOrientation: LonOrientation;
  doySinCos: [number, number];
  warnings: IcValidationWarning[];
}

export type IcValidationResult =
  | {
      ok: true;
      data: MomIcV1;
      summary: IcValidationSummary;
    }
  | {
      ok: false;
      errors: string[];
    };

export function checkStrictMonotonicity(values: readonly number[]): AxisDirection {
  if (values.length < 2) {
    return 'non-monotonic';
  }
  let strictlyAsc = true;
  let strictlyDesc = true;
  for (let i = 1; i < values.length; i += 1) {
    if (!(values[i] > values[i - 1])) {
      strictlyAsc = false;
    }
    if (!(values[i] < values[i - 1])) {
      strictlyDesc = false;
    }
  }
  if (strictlyAsc) return 'ascending';
  if (strictlyDesc) return 'descending';
  return 'non-monotonic';
}

function formatZodIssues(issues: readonly z.core.$ZodIssue[]): string[] {
  const unique = new Set<string>();
  for (const issue of issues) {
    const pathStr = issue.path.length > 0 ? issue.path.join('.') : 'root';
    unique.add(`${pathStr}: ${issue.message}`);
    if (unique.size >= 12) {
      break;
    }
  }
  return Array.from(unique);
}

/**
 * Validates an already-parsed object against the `mom-ic-v1` schema and scientific checks.
 * Never mutates, clips, or reorders user data.
 */
export function validateMomIcObject(
  input: unknown,
  meta: { fileName?: string; fileSizeBytes?: number } = {},
): IcValidationResult {
  const fileName = meta.fileName ?? 'initial-conditions.json';
  const fileSizeBytes = meta.fileSizeBytes ?? 0;

  if (fileSizeBytes > MAX_IC_FILE_BYTES) {
    return {
      ok: false,
      errors: [
        `File size (${(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB) exceeds the ${(MAX_IC_FILE_BYTES / (1024 * 1024)).toFixed(0)} MB limit for mom-ic-v1 files.`,
      ],
    };
  }

  // Provide an explicit, high-signal error if channel order is wrong before generic tuple errors.
  if (input && typeof input === 'object' && 'channels' in input) {
    const rawChannels = (input as { channels?: unknown }).channels;
    if (Array.isArray(rawChannels)) {
      const matches =
        rawChannels.length === CHANNEL_KEYS.length &&
        rawChannels.every((c, i) => c === CHANNEL_KEYS[i]);
      if (!matches) {
        return {
          ok: false,
          errors: [
            `channels must match the exact contract order [${CHANNEL_KEYS.join(', ')}].`,
          ],
        };
      }
    }
  }

  const parsed = momIcV1Schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: formatZodIssues(parsed.error.issues),
    };
  }

  const data = parsed.data;
  const latDir = checkStrictMonotonicity(data.grid.lat);
  const lonDir = checkStrictMonotonicity(data.grid.lon);

  const axisErrors: string[] = [];
  if (latDir === 'non-monotonic') {
    axisErrors.push('grid.lat must be strictly monotonic (strictly increasing or strictly decreasing).');
  }
  if (lonDir === 'non-monotonic') {
    axisErrors.push('grid.lon must be strictly monotonic (strictly increasing or strictly decreasing).');
  }
  if (axisErrors.length > 0) {
    return { ok: false, errors: axisErrors };
  }

  const latOrientation: LatOrientation =
    latDir === 'ascending' ? 'south-to-north' : 'north-to-south';
  const lonOrientation: LonOrientation =
    lonDir === 'ascending' ? 'west-to-east' : 'east-to-west';

  const warnings: IcValidationWarning[] = [];

  if (latOrientation === 'north-to-south') {
    warnings.push({
      code: 'latitude_descending',
      message:
        'Detected north-to-south latitude order (descending). Note that docs/API_CONTRACT.md defines south-to-north (6.5°N to 37.5°N). Data has NOT been automatically flipped.',
    });
  }

  if (lonOrientation === 'east-to-west') {
    warnings.push({
      code: 'longitude_descending',
      message:
        'Detected east-to-west longitude order (descending). Note that docs/API_CONTRACT.md defines west-to-east (65.5°E to 100.5°E). Data has NOT been automatically flipped.',
    });
  }

  // Scan t2m (channel 0) and tp (channel 1) for plausibility warnings without altering values.
  let outOfPlausibleTemp = 0;
  let outOfContractTemp = 0;
  let minTemp = Number.POSITIVE_INFINITY;
  let maxTemp = Number.NEGATIVE_INFINITY;
  let negativePrecipCount = 0;
  let minPrecip = Number.POSITIVE_INFINITY;

  for (let t = 0; t < GRID_SPEC.historySteps; t += 1) {
    const t2mGrid = data.init_states[t][0];
    const tpGrid = data.init_states[t][1];
    for (let r = 0; r < GRID_SPEC.rows; r += 1) {
      for (let c = 0; c < GRID_SPEC.cols; c += 1) {
        const temp = t2mGrid[r][c];
        if (temp < minTemp) minTemp = temp;
        if (temp > maxTemp) maxTemp = temp;
        if (temp < TEMP_PLAUSIBLE_MIN_K || temp > TEMP_PLAUSIBLE_MAX_K) {
          outOfPlausibleTemp += 1;
        } else if (temp < CONTRACT_TEMP_MIN_K || temp > CONTRACT_TEMP_MAX_K) {
          outOfContractTemp += 1;
        }

        const precip = tpGrid[r][c];
        if (precip < minPrecip) minPrecip = precip;
        if (precip < 0) {
          negativePrecipCount += 1;
        }
      }
    }
  }

  if (outOfPlausibleTemp > 0) {
    warnings.push({
      code: 'temperature_out_of_plausible_range',
      count: outOfPlausibleTemp,
      message: `${outOfPlausibleTemp} t2m cells fall outside the plausible 180–340 K range (observed min ${minTemp.toFixed(2)} K, max ${maxTemp.toFixed(2)} K). Data was not altered.`,
    });
  }

  if (outOfContractTemp > 0) {
    warnings.push({
      code: 'temperature_outside_contract_gate',
      count: outOfContractTemp,
      message: `${outOfContractTemp} t2m cells fall outside the Round 1 contract gate of 233.15–333.15 K (−40 °C to +60 °C).`,
    });
  }

  if (negativePrecipCount > 0) {
    warnings.push({
      code: 'negative_precipitation',
      count: negativePrecipCount,
      message: `${negativePrecipCount} tp cells contain negative precipitation values (minimum ${minPrecip.toFixed(4)} mm/day). Data was not clipped.`,
    });
  }

  const [sinVal, cosVal] = data.doy_sincos;
  const radius = Math.hypot(sinVal, cosVal);
  if (Math.abs(radius - 1) > 0.05) {
    warnings.push({
      code: 'doy_sincos_unit_circle',
      message: `doy_sincos vector norm is ${radius.toFixed(4)} (expected ~1.0 on the unit circle [sin, cos]).`,
    });
  }

  const derivedDate = deriveIcInitializationDate({
    init_date: data.init_date,
    dates: data.dates,
    source_note: data.source_note,
    label: data.label,
  });

  if (derivedDate.initDateIso) {
    const doyCheck = checkDoyCalendarConsistency(
      derivedDate.initDateIso,
      data.doy_sincos,
    );
    if (doyCheck && !doyCheck.consistent) {
      warnings.push({
        code: 'doy_calendar_mismatch',
        message: `Metadata initialization date (${derivedDate.initDateIso}, DOY ${doyCheck.calendarDoy}) differs by ${doyCheck.deltaDays.toFixed(1)} days from doy_sincos (encoded DOY ${doyCheck.encodedDoy.toFixed(1)}). Dates are displayed as metadata only; the model uses doy_sincos directly.`,
      });
    }
  }

  return {
    ok: true,
    data,
    summary: {
      fileName,
      fileSizeBytes,
      label: data.label,
      sourceNote: data.source_note,
      initDateIso: derivedDate.initDateIso,
      initDateSource: derivedDate.source,
      dayOneDateIso: derivedDate.dayOneDateIso,
      shape: [3, 6, 32, 36],
      hasLandSeaMask: Boolean(data.static?.land_sea_mask),
      latRange: [data.grid.lat[0], data.grid.lat[data.grid.lat.length - 1]],
      lonRange: [data.grid.lon[0], data.grid.lon[data.grid.lon.length - 1]],
      latOrientation,
      lonOrientation,
      doySinCos: data.doy_sincos,
      warnings,
    },
  };
}

/**
 * Parses a raw JSON text string (with file size check) and validates it as `mom-ic-v1`.
 */
export function parseAndValidateMomIcJson(
  rawText: string,
  meta: { fileName?: string; fileSizeBytes?: number } = {},
): IcValidationResult {
  const byteSize = meta.fileSizeBytes ?? new TextEncoder().encode(rawText).byteLength;

  if (byteSize > MAX_IC_FILE_BYTES) {
    return {
      ok: false,
      errors: [
        `File size (${(byteSize / (1024 * 1024)).toFixed(2)} MB) exceeds the ${(MAX_IC_FILE_BYTES / (1024 * 1024)).toFixed(0)} MB limit for mom-ic-v1 files.`,
      ],
    };
  }

  if (containsForbiddenProtoKey(rawText)) {
    return {
      ok: false,
      errors: ['JSON contains forbidden object keys (__proto__, constructor, or prototype).'],
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = parseJsonSafely(rawText);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unable to parse JSON';
    return {
      ok: false,
      errors: [`Malformed JSON: ${detail}`],
    };
  }

  return validateMomIcObject(parsedJson, {
    fileName: meta.fileName,
    fileSizeBytes: byteSize,
  });
}
