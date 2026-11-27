import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  checkDoyCalendarConsistency,
  daysInMonth,
  deriveIcInitializationDate,
  formatCalendarDate,
  formatForecastWindow,
  isLeapYear,
  parseCalendarIsoDate,
  resolveForecastDayDate,
} from '../utils/forecastDates';

describe('Forecast calendar date math & IC metadata derivation (forecastDates.ts)', () => {
  it('handles leap years and invalid calendar dates strictly', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2021)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);

    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2021, 2)).toBe(28);
    expect(daysInMonth(2021, 4)).toBe(30);

    expect(parseCalendarIsoDate('2024-02-29')?.iso).toBe('2024-02-29');
    expect(parseCalendarIsoDate('2021-02-29')).toBeNull();
    expect(parseCalendarIsoDate('2021-04-31')).toBeNull();
    expect(parseCalendarIsoDate('2021-13-01')).toBeNull();
    expect(parseCalendarIsoDate('not-a-date')).toBeNull();
  });

  it('computes accurate Day 1–10 UTC calendar dates across month, year, and leap-year boundaries', () => {
    // 2021-07-14 -> Day 1..Day 10
    expect(addCalendarDays('2021-07-14', 1)).toBe('2021-07-15');
    expect(addCalendarDays('2021-07-14', 10)).toBe('2021-07-24');
    expect(formatForecastWindow('2021-07-14', 10)).toBe('Jul 15 – Jul 24, 2021');

    // Month boundary
    expect(addCalendarDays('2021-07-30', 3)).toBe('2021-08-02');

    // Year boundary
    expect(addCalendarDays('2021-12-30', 3)).toBe('2022-01-02');
    expect(formatForecastWindow('2021-12-30', 10)).toBe(
      'Dec 31, 2021 – Jan 9, 2022',
    );

    // Leap-year February vs non-leap February
    expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addCalendarDays('2024-02-28', 2)).toBe('2024-03-01');
    expect(addCalendarDays('2021-02-28', 1)).toBe('2021-03-01');

    expect(formatCalendarDate('2021-07-15', 'long')).toBe('Jul 15, 2021');
    expect(formatCalendarDate('2021-07-15', 'short')).toBe('Jul 15');
    expect(formatCalendarDate('2021-07-15', 'iso')).toBe('2021-07-15');
  });

  it('derives initialization date by priority and returns null when absent (never today)', () => {
    // 1. Explicit init_date takes top priority
    const explicit = deriveIcInitializationDate({
      init_date: '2021-07-14',
      dates: ['2020-01-01', '2020-01-02', '2020-01-03'],
      source_note: 'ERA5 window 2019-06-01',
    });
    expect(explicit.initDateIso).toBe('2021-07-14');
    expect(explicit.source).toBe('explicit_field');
    expect(explicit.dayOneDateIso).toBe('2021-07-15');

    // 2. Final element of dates[] tuple
    const fromArray = deriveIcInitializationDate({
      dates: ['2021-07-12', '2021-07-13', '2021-07-14'],
      source_note: 'ERA5 July 2021',
    });
    expect(fromArray.initDateIso).toBe('2021-07-14');
    expect(fromArray.source).toBe('explicit_dates_array');

    // 3. Last valid date in source_note range, then label
    const fromNoteRange = deriveIcInitializationDate({
      source_note: 'ERA5 window 2021-07-12 to 2021-07-14',
      label: 'Unused fallback',
    });
    expect(fromNoteRange.initDateIso).toBe('2021-07-14');
    expect(fromNoteRange.source).toBe('metadata_text');

    const fromNamedMonthLabel = deriveIcInitializationDate({
      source_note: 'ERA5 sample without calendar day',
      label: 'Monsoon onset sample (14 July 2021)',
    });
    expect(fromNamedMonthLabel.initDateIso).toBe('2021-07-14');
    expect(fromNamedMonthLabel.source).toBe('metadata_text');

    // 4. Absent -> null (never today's date)
    const missing = deriveIcInitializationDate({
      source_note: 'Synthetic fixture without date',
      label: 'Blind window',
    });
    expect(missing.initDateIso).toBeNull();
    expect(missing.source).toBe('unavailable');
    expect(missing.dayOneDateIso).toBeNull();

    const fallbackDay = resolveForecastDayDate(null, 4);
    expect(fallbackDay.isoDate).toBeNull();
    expect(fallbackDay.displayLabel).toBe('Day 4');
    expect(fallbackDay.compactLabel).toBe('D4');

    const resolvedDay = resolveForecastDayDate('2021-07-14', 4);
    expect(resolvedDay.isoDate).toBe('2021-07-18');
    expect(resolvedDay.longDate).toBe('Jul 18, 2021');
    expect(resolvedDay.displayLabel).toBe('Day 4 · Jul 18, 2021');
  });

  it('checks doy_sincos consistency against derived initialization date', () => {
    // July 14, 2021 is 0-indexed DOY 194 -> angle = 194 / 365 * 2pi
    const angle = (194 / 365) * 2 * Math.PI;
    const match = checkDoyCalendarConsistency('2021-07-14', [
      Math.sin(angle),
      Math.cos(angle),
    ]);
    expect(match?.consistent).toBe(true);
    expect(match?.deltaDays).toBeLessThan(0.5);

    const mismatch = checkDoyCalendarConsistency('2021-01-15', [
      Math.sin(angle),
      Math.cos(angle),
    ]);
    expect(mismatch?.consistent).toBe(false);
    expect(mismatch?.deltaDays).toBeGreaterThan(100);
  });
});
