import { AlertTriangle } from 'lucide-react';
import type { SimulationRunRecord } from '../../context/AppDataContext';
import type { DailySeriesPoint, GeoRegion } from '../../utils/aggregation';
import {
  formatCalendarDate,
  resolveForecastDayDate,
} from '../../utils/forecastDates';
import type { DashboardVariable } from '../../utils/rolloutStore';
import { getVariableMeta } from '../../utils/units';

interface TwinSummaryPanelProps {
  run: SimulationRunRecord;
  dayPoint: DailySeriesPoint;
  variable: DashboardVariable;
  region: GeoRegion;
  comparisonDays: { dayA: number; dayB: number } | null;
  initDateIso?: string | null;
}

export function TwinSummaryPanel({
  run,
  dayPoint,
  variable,
  region,
  comparisonDays,
  initDateIso = null,
}: TwinSummaryPanelProps) {
  const vMeta = getVariableMeta(variable);
  const exceedsFiveSecTarget =
    !run.isSyntheticFixture && run.steps === 10 && run.inferenceMs > 5000;

  const dayInfo = resolveForecastDayDate(initDateIso, dayPoint.day);
  const dayAInfo = comparisonDays
    ? resolveForecastDayDate(initDateIso, comparisonDays.dayA)
    : null;
  const dayBInfo = comparisonDays
    ? resolveForecastDayDate(initDateIso, comparisonDays.dayB)
    : null;

  return (
    <section
      aria-label="Forecast day summary statistics"
      className="instrument-plane rounded-xs"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#1E2F4A] px-5 py-3.5">
        <div className="space-y-0.5">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]">
            {comparisonDays && dayAInfo && dayBInfo
              ? `${dayBInfo.displayLabel} − ${dayAInfo.displayLabel} Context (Selected: ${dayInfo.displayLabel})`
              : `Forecast ${dayInfo.displayLabel} Summary`}
          </h2>
          <p className="text-xs text-[#93A4BD]">
            Domain mean uses cos(latitude) area weighting and includes ocean and neighboring land.
            {' · '}
            {initDateIso
              ? `Initialized ${formatCalendarDate(initDateIso, 'long')} (${initDateIso})`
              : 'Initialization date not provided in IC metadata'}
          </p>
        </div>
        <span className="font-mono text-xs text-[#BFE6F2]">
          {run.fromCache ? 'Cached baseline run' : 'Fresh rollout'}
        </span>
      </div>

      {/* Primary quantitative metrics — hairline ruled 6-column ledger */}
      <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-[#1E2F4A] font-mono tabular-nums">
        <div className="px-4 py-3.5 space-y-1">
          <dt className="text-[11px] text-[#93A4BD]">Selected day</dt>
          <dd className="text-xl font-semibold text-[#E6EDF7] tracking-tight">
            Day {dayPoint.day}
            <span className="text-xs font-normal text-[#93A4BD]"> / {run.steps}</span>
          </dd>
          {dayInfo.longDate && (
            <p className="text-[11px] text-[#5CC8E0]">
              Valid {dayInfo.longDate}
            </p>
          )}
        </div>

        <div className="px-4 py-3.5 space-y-1">
          <dt className="text-[11px] text-[#93A4BD]">Domain mean</dt>
          <dd className="text-xl font-semibold text-[#5CC8E0] tracking-tight">
            {dayPoint.domain.weightedMean.toFixed(vMeta.decimals)}
            <span className="text-xs font-normal text-[#93A4BD] ml-1">
              {vMeta.displayUnit}
            </span>
          </dd>
        </div>

        <div className="px-4 py-3.5 space-y-1">
          <dt className="text-[11px] text-[#93A4BD]">Domain min</dt>
          <dd className="text-xl font-semibold text-[#E6EDF7] tracking-tight">
            {dayPoint.domain.min.toFixed(vMeta.decimals)}
            <span className="text-xs font-normal text-[#93A4BD] ml-1">
              {vMeta.displayUnit}
            </span>
          </dd>
        </div>

        <div className="px-4 py-3.5 space-y-1">
          <dt className="text-[11px] text-[#93A4BD]">Domain max</dt>
          <dd className="text-xl font-semibold text-[#F2A93B] tracking-tight">
            {dayPoint.domain.max.toFixed(vMeta.decimals)}
            <span className="text-xs font-normal text-[#93A4BD] ml-1">
              {vMeta.displayUnit}
            </span>
          </dd>
        </div>

        <div className="px-4 py-3.5 space-y-1">
          <dt className="text-[11px] text-[#93A4BD]">Location of max</dt>
          <dd className="text-sm font-medium text-[#E6EDF7] pt-1">
            {dayPoint.domain.maxLocation
              ? `${dayPoint.domain.maxLocation.lat.toFixed(1)}°N, ${dayPoint.domain.maxLocation.lon.toFixed(1)}°E`
              : '—'}
          </dd>
        </div>

        <div className="px-4 py-3.5 space-y-1">
          <dt className="text-[11px] text-[#93A4BD] truncate" title={region.label}>
            Region mean
          </dt>
          <dd className="text-xl font-semibold text-[#BFE6F2] tracking-tight">
            {Number.isFinite(dayPoint.region.weightedMean)
              ? dayPoint.region.weightedMean.toFixed(vMeta.decimals)
              : '—'}
            <span className="text-xs font-normal text-[#93A4BD] ml-1">
              {vMeta.displayUnit}
            </span>
          </dd>
        </div>
      </dl>

      {/* Selected region details + backend telemetry */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#1E2F4A] border-t border-[#1E2F4A] font-mono text-xs tabular-nums">
        <div className="px-5 py-3.5 space-y-1">
          <p className="text-[#F2A93B] font-medium">
            Selected region: {region.label}
          </p>
          <p className="text-[#93A4BD]">
            Bounds: {region.latMin.toFixed(1)}–{region.latMax.toFixed(1)}°N,{' '}
            {region.lonMin.toFixed(1)}–{region.lonMax.toFixed(1)}°E ·{' '}
            {dayPoint.region.cellCount} cells
          </p>
          <p className="text-[#E6EDF7]">
            Mean:{' '}
            {Number.isFinite(dayPoint.region.weightedMean)
              ? `${dayPoint.region.weightedMean.toFixed(vMeta.decimals)} ${vMeta.displayUnit}`
              : '—'}{' '}
            · Min:{' '}
            {Number.isFinite(dayPoint.region.min)
              ? dayPoint.region.min.toFixed(vMeta.decimals)
              : '—'}{' '}
            · Max:{' '}
            {Number.isFinite(dayPoint.region.max)
              ? dayPoint.region.max.toFixed(vMeta.decimals)
              : '—'}
          </p>
        </div>

        <div className="px-5 py-3.5 space-y-1">
          <p className="text-[#BFE6F2] font-medium">
            Model: {run.modelName ?? 'Not reported by /health'}
          </p>
          <p className="text-[#E6EDF7]">
            Backend inference: {run.inferenceMs.toFixed(1)} ms · Frontend round-trip:{' '}
            {run.roundTripMs.toFixed(1)} ms
          </p>
          <p className="text-[#93A4BD]">
            Local timing does not predict official grader CPU timing.
          </p>
        </div>
      </div>

      {exceedsFiveSecTarget && (
        <div
          role="status"
          className="border-t border-[#F2A93B]/50 bg-[#08101D] px-5 py-3 flex items-start gap-2.5 text-xs text-[#F2A93B]"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            10-step backend inference reported {(run.inferenceMs / 1000).toFixed(2)} s,
            above the Round 1 challenge target of 5.0 s. Local machine performance does not
            predict official grader performance.
          </span>
        </div>
      )}

      {run.diagnostics.negativePrecipitationCount > 0 && (
        <div
          role="status"
          className="border-t border-[#F2A93B]/50 bg-[#08101D] px-5 py-3 text-xs text-[#F2A93B]"
        >
          Response contained {run.diagnostics.negativePrecipitationCount} negative
          precipitation cell(s) (minimum {run.diagnostics.minPrecipitation.toFixed(4)}{' '}
          mm/day). Raw backend values were preserved untouched.
        </div>
      )}
    </section>
  );
}
