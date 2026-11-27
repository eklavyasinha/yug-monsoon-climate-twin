/**
 * Timezone-independent UTC calendar arithmetic and metadata-driven initialization
 * date derivation for 1-10 day monsoon rollouts.
 *
 * Rules:
 * - Never invent or fall back to `today` (`new Date()`).
 * - If the IC file has no unambiguous initialization date, return `null` so the UI
 *   falls back honestly to Lead Day N without fabricated calendar dates.
 * - Day k (1-indexed, rollout[k - 1]) corresponds to `initDate + k` calendar days
 *   per docs/API_CONTRACT.md (`rollout[k]` is day `k + 1` after `init_states[-1]`).
 */

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export interface ParsedCalendarDate {
  readonly year: number;
  readonly month: number; // 1..12
  readonly day: number; // 1..31
  readonly iso: string; // YYYY-MM-DD
}

export type InitDateSource =
  | 'explicit_field'
  | 'explicit_dates_array'
  | 'metadata_text'
  | 'unavailable';

export interface DerivedInitDateResult {
  readonly initDateIso: string | null;
  readonly source: InitDateSource;
  readonly dayOneDateIso: string | null;
}

export interface ForecastDayDateInfo {
  readonly day: number;
  readonly isoDate: string | null;
  readonly longDate: string | null;
  readonly shortDate: string | null;
  readonly displayLabel: string;
  readonly compactLabel: string;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

/**
 * Parses and strictly validates an exact `YYYY-MM-DD` calendar date string.
 * Rejects impossible dates such as `2021-02-29` or `2021-04-31`.
 */
export function parseCalendarIsoDate(value: string): ParsedCalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (year < 1800 || year > 2200) return null;
  if (month < 1 || month > 12) return null;

  const maxDay = daysInMonth(year, month);
  if (day < 1 || day > maxDay) return null;

  return {
    year,
    month,
    day,
    iso: `${pad4(year)}-${pad2(month)}-${pad2(day)}`,
  };
}

/**
 * Adds an integer number of days to an ISO calendar date using pure UTC
 * calendar arithmetic so results never shift across browser timezones or DST.
 */
export function addCalendarDays(
  initDateIso: string,
  leadDays: number,
): string | null {
  if (!Number.isInteger(leadDays)) return null;
  const parsed = parseCalendarIsoDate(initDateIso);
  if (!parsed) return null;

  const utcMs = Date.UTC(parsed.year, parsed.month - 1, parsed.day + leadDays);
  const dt = new Date(utcMs);

  return `${pad4(dt.getUTCFullYear())}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/**
 * Formats an ISO calendar date deterministically without local timezone conversion.
 */
export function formatCalendarDate(
  iso: string,
  style: 'long' | 'short' | 'iso' = 'long',
): string {
  const parsed = parseCalendarIsoDate(iso);
  if (!parsed) return iso;
  if (style === 'iso') return parsed.iso;
  const monthLabel = SHORT_MONTHS[parsed.month - 1];
  if (style === 'short') {
    return `${monthLabel} ${parsed.day}`;
  }
  return `${monthLabel} ${parsed.day}, ${parsed.year}`;
}

/**
 * Formats a multi-day forecast horizon window (e.g., `Jul 15 – Jul 24, 2021`).
 */
export function formatForecastWindow(
  initDateIso: string | null,
  steps: number,
): string | null {
  if (!initDateIso || steps < 1) return null;
  const startIso = addCalendarDays(initDateIso, 1);
  const endIso = addCalendarDays(initDateIso, steps);
  if (!startIso || !endIso) return null;

  if (steps === 1) {
    return formatCalendarDate(startIso, 'long');
  }

  const startParsed = parseCalendarIsoDate(startIso);
  const endParsed = parseCalendarIsoDate(endIso);
  if (!startParsed || !endParsed) return null;

  if (startParsed.year === endParsed.year) {
    return `${formatCalendarDate(startIso, 'short')} – ${formatCalendarDate(endIso, 'long')}`;
  }
  return `${formatCalendarDate(startIso, 'long')} – ${formatCalendarDate(endIso, 'long')}`;
}

function extractLastValidDateFromText(text: string): string | null {
  if (!text) return null;

  const candidates: Array<{ index: number; iso: string }> = [];

  // 1. ISO YYYY-MM-DD occurrences (if a range like "2021-07-12 to 2021-07-14" is present,
  // the last date represents init_states[-1], i.e., the forecast initialization date).
  const isoRegex = /\b(\d{4}-\d{2}-\d{2})\b/g;
  for (const match of text.matchAll(isoRegex)) {
    const parsed = parseCalendarIsoDate(match[1]);
    if (parsed && match.index !== undefined) {
      candidates.push({ index: match.index, iso: parsed.iso });
    }
  }

  // 2. Named month formats: "July 14, 2021" or "Jul 14 2021"
  const mdyRegex =
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})\b/gi;
  for (const match of text.matchAll(mdyRegex)) {
    const month = MONTH_NAME_MAP[match[1].toLowerCase()];
    const day = Number(match[2]);
    const year = Number(match[3]);
    if (month && match.index !== undefined) {
      const parsed = parseCalendarIsoDate(
        `${pad4(year)}-${pad2(month)}-${pad2(day)}`,
      );
      if (parsed) {
        candidates.push({ index: match.index, iso: parsed.iso });
      }
    }
  }

  // 3. Day-first named month formats: "14 July 2021" or "14 Jul 2021"
  const dmyRegex =
    /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?),?\s+(\d{4})\b/gi;
  for (const match of text.matchAll(dmyRegex)) {
    const day = Number(match[1]);
    const month = MONTH_NAME_MAP[match[2].toLowerCase()];
    const year = Number(match[3]);
    if (month && match.index !== undefined) {
      const parsed = parseCalendarIsoDate(
        `${pad4(year)}-${pad2(month)}-${pad2(day)}`,
      );
      if (parsed) {
        candidates.push({ index: match.index, iso: parsed.iso });
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.index - b.index);
  return candidates[candidates.length - 1].iso;
}

/**
 * Derives the forecast initialization date dynamically from validated `mom-ic-v1` metadata.
 * Priority:
 * 1. Explicit `init_date` field (`YYYY-MM-DD`)
 * 2. Final element of optional `dates` 3-day tuple (`dates[2]`, corresponding to `init_states[-1]`)
 * 3. Unambiguous calendar date in `source_note` or `label`
 * 4. `null` (unavailable — never defaults to today's date)
 */
export function deriveIcInitializationDate(meta: {
  init_date?: string;
  dates?: readonly string[];
  source_note?: string;
  label?: string;
}): DerivedInitDateResult {
  if (typeof meta.init_date === 'string') {
    const parsed = parseCalendarIsoDate(meta.init_date);
    if (parsed) {
      return {
        initDateIso: parsed.iso,
        source: 'explicit_field',
        dayOneDateIso: addCalendarDays(parsed.iso, 1),
      };
    }
  }

  if (Array.isArray(meta.dates) && meta.dates.length > 0) {
    const lastEntry = meta.dates[meta.dates.length - 1];
    if (typeof lastEntry === 'string') {
      const parsed = parseCalendarIsoDate(lastEntry);
      if (parsed) {
        return {
          initDateIso: parsed.iso,
          source: 'explicit_dates_array',
          dayOneDateIso: addCalendarDays(parsed.iso, 1),
        };
      }
    }
  }

  const fromSourceNote = meta.source_note
    ? extractLastValidDateFromText(meta.source_note)
    : null;
  if (fromSourceNote) {
    return {
      initDateIso: fromSourceNote,
      source: 'metadata_text',
      dayOneDateIso: addCalendarDays(fromSourceNote, 1),
    };
  }

  const fromLabel = meta.label ? extractLastValidDateFromText(meta.label) : null;
  if (fromLabel) {
    return {
      initDateIso: fromLabel,
      source: 'metadata_text',
      dayOneDateIso: addCalendarDays(fromLabel, 1),
    };
  }

  return {
    initDateIso: null,
    source: 'unavailable',
    dayOneDateIso: null,
  };
}

/**
 * Computes 0-indexed day-of-year (0..365) from an ISO calendar date.
 */
export function getDayOfYearZeroIndexed(iso: string): number | null {
  const parsed = parseCalendarIsoDate(iso);
  if (!parsed) return null;
  const startOfYear = Date.UTC(parsed.year, 0, 1);
  const target = Date.UTC(parsed.year, parsed.month - 1, parsed.day);
  return Math.round((target - startOfYear) / 86_400_000);
}

/**
 * Checks consistency between a derived calendar date and `doy_sincos` using
 * serve.py's circular 365-day angle formula (`atan2(sin, cos) / 2pi * 365`).
 */
export function checkDoyCalendarConsistency(
  initDateIso: string,
  doySinCos: readonly [number, number],
): {
  consistent: boolean;
  calendarDoy: number;
  encodedDoy: number;
  deltaDays: number;
} | null {
  const calendarDoy = getDayOfYearZeroIndexed(initDateIso);
  if (calendarDoy === null) return null;
  const [sinVal, cosVal] = doySinCos;
  if (!Number.isFinite(sinVal) || !Number.isFinite(cosVal)) return null;

  const angle = Math.atan2(sinVal, cosVal);
  const rawDoy = ((angle / (2 * Math.PI)) * 365) % 365;
  const encodedDoy = rawDoy < 0 ? rawDoy + 365 : rawDoy;

  const rawDiff = Math.abs(encodedDoy - (calendarDoy % 365));
  const deltaDays = Math.min(rawDiff, 365 - rawDiff);

  // Allow up to 2.5 days tolerance for 0-based vs 1-based DOY or leap-year 365 vs 366 offset.
  return {
    consistent: deltaDays <= 2.5,
    calendarDoy,
    encodedDoy,
    deltaDays,
  };
}

/**
 * Resolves valid date display labels for a 1-indexed forecast lead day (`rollout[day - 1]`).
 */
export function resolveForecastDayDate(
  initDateIso: string | null,
  day: number,
): ForecastDayDateInfo {
  const isoDate =
    initDateIso && Number.isInteger(day) && day >= 1
      ? addCalendarDays(initDateIso, day)
      : null;

  if (!isoDate) {
    return {
      day,
      isoDate: null,
      longDate: null,
      shortDate: null,
      displayLabel: `Day ${day}`,
      compactLabel: `D${day}`,
    };
  }

  const longDate = formatCalendarDate(isoDate, 'long');
  const shortDate = formatCalendarDate(isoDate, 'short');

  return {
    day,
    isoDate,
    longDate,
    shortDate,
    displayLabel: `Day ${day} · ${longDate}`,
    compactLabel: `${shortDate}`,
  };
}
