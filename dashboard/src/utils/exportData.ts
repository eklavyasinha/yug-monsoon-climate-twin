import type { DailySeriesPoint, GeoRegion } from './aggregation';
import {
  addCalendarDays,
  formatForecastWindow,
} from './forecastDates';
import type { DashboardVariable } from './rolloutStore';
import { getVariableMeta } from './units';

export interface CsvExportMetadata {
  variable: DashboardVariable;
  region: GeoRegion;
  modelName: string | null;
  icLabel: string;
  initDateIso?: string | null;
  inferenceMs: number;
  roundTripMs: number;
  isSyntheticFixture: boolean;
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Builds a client-side CSV document strictly from the currently loaded rollout's
 * daily time-series statistics. Watermarks synthetic fixture exports prominently.
 */
export function buildTimeSeriesCsv(
  series: readonly DailySeriesPoint[],
  meta: CsvExportMetadata,
): string {
  const vMeta = getVariableMeta(meta.variable);
  const lines: string[] = [];
  const initDateIso = meta.initDateIso ?? null;
  const forecastWindow = formatForecastWindow(initDateIso, series.length);

  if (meta.isSyntheticFixture) {
    lines.push('# WARNING: SYNTHETIC FIXTURE — NOT MODEL OUTPUT');
    lines.push('# Generated exclusively for local UI testing (VITE_ENABLE_FIXTURE=true).');
  } else {
    lines.push('# Multiverse of Monsoon — Actual Backend Simulation Export');
  }

  lines.push(`# Variable: ${vMeta.label} (${vMeta.displayUnit})`);
  lines.push(`# Initial Conditions: ${meta.icLabel}`);
  lines.push(
    `# Initialization Date: ${initDateIso ?? 'Not specified in IC metadata'}`,
  );
  if (forecastWindow) {
    lines.push(`# Valid Forecast Window: ${forecastWindow}`);
  }
  lines.push(`# Model Name: ${meta.modelName ?? 'Not reported by backend'}`);
  lines.push(`# Backend Inference Time (ms): ${meta.inferenceMs.toFixed(2)}`);
  lines.push(`# Frontend Round-Trip Time (ms): ${meta.roundTripMs.toFixed(1)}`);
  lines.push('# Domain Mean Note: cos(latitude)-weighted average over full 32x36 grid (includes ocean and neighboring land)');
  lines.push(
    `# Selected Region: ${meta.region.label} (${meta.region.latMin}..${meta.region.latMax}N, ${meta.region.lonMin}..${meta.region.lonMax}E)`,
  );

  lines.push(
    [
      'forecast_day',
      'valid_date',
      'variable',
      'unit',
      'domain_coslat_mean',
      'domain_min',
      'domain_max',
      'domain_max_lat',
      'domain_max_lon',
      'region_coslat_mean',
      'region_min',
      'region_max',
      'region_cells',
      'data_provenance',
    ].join(','),
  );

  const provenance = meta.isSyntheticFixture
    ? 'SYNTHETIC_FIXTURE_NOT_MODEL_OUTPUT'
    : 'ACTUAL_BACKEND_RESPONSE';

  for (const pt of series) {
    const validDate = initDateIso
      ? (addCalendarDays(initDateIso, pt.day) ?? '')
      : '';
    lines.push(
      [
        pt.day,
        validDate,
        vMeta.key,
        vMeta.displayUnit,
        pt.domain.weightedMean.toFixed(4),
        pt.domain.min.toFixed(4),
        pt.domain.max.toFixed(4),
        pt.domain.maxLocation ? pt.domain.maxLocation.lat.toFixed(1) : '',
        pt.domain.maxLocation ? pt.domain.maxLocation.lon.toFixed(1) : '',
        Number.isFinite(pt.region.weightedMean)
          ? pt.region.weightedMean.toFixed(4)
          : '',
        Number.isFinite(pt.region.min) ? pt.region.min.toFixed(4) : '',
        Number.isFinite(pt.region.max) ? pt.region.max.toFixed(4) : '',
        pt.region.cellCount,
        provenance,
      ]
        .map(escapeCsvCell)
        .join(','),
    );
  }

  return `${lines.join('\n')}\n`;
}

export function triggerClientFileDownload(
  content: BlobPart,
  fileName: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
