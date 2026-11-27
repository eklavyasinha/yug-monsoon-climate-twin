import { useMemo, useState } from 'react';
import { BarChart3, Table } from 'lucide-react';
import type { DailySeriesPoint, GeoRegion } from '../../utils/aggregation';
import { resolveForecastDayDate } from '../../utils/forecastDates';
import type { DashboardVariable } from '../../utils/rolloutStore';
import { getVariableMeta } from '../../utils/units';

interface VariableTimeSeriesChartProps {
  series: readonly DailySeriesPoint[];
  variable: DashboardVariable;
  region: GeoRegion;
  selectedDay: number;
  onSelectDay: (day: number) => void;
  initDateIso?: string | null;
}

const CHART_W = 680;
const CHART_H = 260;
const PAD_L = 58;
const PAD_R = 20;
const PAD_T = 18;
const PAD_B = 38;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;

export function VariableTimeSeriesChart({
  series,
  variable,
  region,
  selectedDay,
  onSelectDay,
  initDateIso = null,
}: VariableTimeSeriesChartProps) {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  const vMeta = getVariableMeta(variable);

  const bounds = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const pt of series) {
      for (const val of [
        pt.domain.min,
        pt.domain.max,
        pt.domain.weightedMean,
        pt.region.weightedMean,
      ]) {
        if (Number.isFinite(val)) {
          if (val < min) min = val;
          if (val > max) max = val;
        }
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { yMin: 0, yMax: 1 };
    }
    if (Math.abs(max - min) < 1e-5) {
      return { yMin: min - 1, yMax: max + 1 };
    }
    const pad = (max - min) * 0.08;
    return {
      yMin: variable === 'tp' ? Math.min(0, min) : min - pad,
      yMax: max + pad,
    };
  }, [series, variable]);

  const xForIndex = (idx: number) => {
    if (series.length <= 1) return PAD_L + PLOT_W / 2;
    return PAD_L + (idx / (series.length - 1)) * PLOT_W;
  };

  const yForValue = (val: number) => {
    const span = bounds.yMax - bounds.yMin || 1;
    const t = (val - bounds.yMin) / span;
    return PAD_T + PLOT_H * (1 - t);
  };

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let i = 0; i <= 4; i += 1) {
      ticks.push(bounds.yMin + (i / 4) * (bounds.yMax - bounds.yMin));
    }
    return ticks;
  }, [bounds]);

  const domainLinePath = useMemo(
    () =>
      series
        .map(
          (pt, idx) =>
            `${idx === 0 ? 'M' : 'L'} ${xForIndex(idx).toFixed(1)} ${yForValue(pt.domain.weightedMean).toFixed(1)}`,
        )
        .join(' '),
    [series, bounds],
  );

  const regionLinePath = useMemo(() => {
    const validPoints = series
      .map((pt, idx) => ({ pt, idx }))
      .filter(({ pt }) => Number.isFinite(pt.region.weightedMean));
    return validPoints
      .map(
        ({ pt, idx }, i) =>
          `${i === 0 ? 'M' : 'L'} ${xForIndex(idx).toFixed(1)} ${yForValue(pt.region.weightedMean).toFixed(1)}`,
      )
      .join(' ');
  }, [series, bounds]);

  const minMaxBandPath = useMemo(() => {
    if (series.length === 0) return '';
    const upper = series.map(
      (pt, idx) =>
        `${idx === 0 ? 'M' : 'L'} ${xForIndex(idx).toFixed(1)} ${yForValue(pt.domain.max).toFixed(1)}`,
    );
    const lower = [...series]
      .reverse()
      .map(
        (pt, revIdx) =>
          `L ${xForIndex(series.length - 1 - revIdx).toFixed(1)} ${yForValue(pt.domain.min).toFixed(1)}`,
      );
    return `${upper.join(' ')} ${lower.join(' ')} Z`;
  }, [series, bounds]);

  const activeDay = hoveredDay ?? selectedDay;
  const activePoint =
    series.find((pt) => pt.day === activeDay) ?? series[0] ?? null;

  return (
    <section
      aria-labelledby="timeseries-heading"
      className="instrument-plane rounded-xs p-5 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1E2F4A] pb-3.5">
        <div className="space-y-1">
          <h2
            id="timeseries-heading"
            className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]"
          >
            Daily Rollout Series — {vMeta.label}
          </h2>
          <p className="text-xs text-[#93A4BD]">
            cos(latitude)-weighted domain mean (includes ocean and neighboring land),
            selected-region mean ({region.label}), and domain min–max envelope in{' '}
            <span className="font-mono text-[#BFE6F2]">{vMeta.displayUnit}</span>.
          </p>
        </div>

        <div
          role="group"
          aria-label="Chart display mode"
          className="inline-flex items-center rounded-xs border border-[#1E2F4A] bg-[#060B14] p-0.5 text-xs font-mono"
        >
          <button
            type="button"
            onClick={() => setViewMode('chart')}
            aria-pressed={viewMode === 'chart'}
            className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-xs px-3 py-1 transition-colors duration-150 whitespace-nowrap ${
              viewMode === 'chart'
                ? 'bg-[#142238] text-[#5CC8E0]'
                : 'text-[#93A4BD] hover:text-[#E6EDF7]'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Chart</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            aria-pressed={viewMode === 'table'}
            className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-xs px-3 py-1 transition-colors duration-150 whitespace-nowrap ${
              viewMode === 'table'
                ? 'bg-[#142238] text-[#5CC8E0]'
                : 'text-[#93A4BD] hover:text-[#E6EDF7]'
            }`}
          >
            <Table className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Table</span>
          </button>
        </div>
      </div>

      {viewMode === 'chart' ? (
        <div className="space-y-3">
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs text-[#93A4BD]">
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-0.5 w-4 bg-[#5CC8E0]" aria-hidden="true" />
              <span className="text-[#E6EDF7]">Domain cos(lat) mean</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-block h-0.5 w-4 border-t-2 border-dashed border-[#F2A93B]"
                aria-hidden="true"
              />
              <span className="text-[#E6EDF7]">Region mean ({region.label})</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-4 bg-[#5CC8E0]/18 border border-[#5CC8E0]/35"
                aria-hidden="true"
              />
              <span>Domain min–max range</span>
            </span>
          </div>

          <div className="rounded-xs border border-[#1E2F4A] bg-[#08101D] p-2">
            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              role="img"
              aria-label={`Time series chart of ${vMeta.label} in ${vMeta.displayUnit} across forecast days 1 to ${series.length}.`}
              className="w-full h-auto block"
              onMouseLeave={() => setHoveredDay(null)}
            >
              {/* Horizontal gridlines & Y ticks */}
              {yTicks.map((tick, idx) => {
                const y = yForValue(tick);
                return (
                  <g key={idx}>
                    <line
                      x1={PAD_L}
                      y1={y}
                      x2={PAD_L + PLOT_W}
                      y2={y}
                      stroke="#1E2F4A"
                      strokeWidth="0.8"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={PAD_L - 8}
                      y={y + 3.5}
                      textAnchor="end"
                      fill="#93A4BD"
                      fontSize="10"
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      {tick.toFixed(vMeta.decimals === 2 && Math.abs(tick) < 100 ? 1 : 0)}
                    </text>
                  </g>
                );
              })}

              {/* Y axis unit label */}
              <text
                x={12}
                y={PAD_T + PLOT_H / 2}
                transform={`rotate(-90 12 ${PAD_T + PLOT_H / 2})`}
                textAnchor="middle"
                fill="#93A4BD"
                fontSize="10"
                fontFamily="IBM Plex Mono, monospace"
              >
                {vMeta.displayUnit}
              </text>

              {/* Domain min-max envelope */}
              {minMaxBandPath && (
                <path
                  d={minMaxBandPath}
                  fill="rgba(92, 200, 224, 0.14)"
                  stroke="rgba(92, 200, 224, 0.3)"
                  strokeWidth="0.8"
                />
              )}

              {/* Selected day vertical crosshair */}
              {activePoint && (
                <line
                  x1={xForIndex(activePoint.stepIndex)}
                  y1={PAD_T}
                  x2={xForIndex(activePoint.stepIndex)}
                  y2={PAD_T + PLOT_H}
                  stroke="#BFE6F2"
                  strokeOpacity="0.45"
                  strokeWidth="1"
                />
              )}

              {/* Domain cos(lat) mean */}
              <path
                d={domainLinePath}
                fill="none"
                stroke="#5CC8E0"
                strokeWidth="2"
              />

              {/* Region cos(lat) mean */}
              {regionLinePath && (
                <path
                  d={regionLinePath}
                  fill="none"
                  stroke="#F2A93B"
                  strokeWidth="2"
                  strokeDasharray="5 3"
                />
              )}

              {/* Interactive keyboard-focusable day markers */}
              {series.map((pt, idx) => {
                const cx = xForIndex(idx);
                const cyDomain = yForValue(pt.domain.weightedMean);
                const cyRegion = Number.isFinite(pt.region.weightedMean)
                  ? yForValue(pt.region.weightedMean)
                  : null;
                const isSelected = pt.day === selectedDay;
                const dayInfo = resolveForecastDayDate(initDateIso, pt.day);
                return (
                  <g key={pt.day}>
                    <text
                      x={cx}
                      y={PAD_T + PLOT_H + 17}
                      textAnchor="middle"
                      fill={isSelected ? '#E6EDF7' : '#93A4BD'}
                      fontSize="9.5"
                      fontFamily="IBM Plex Mono, monospace"
                      fontWeight={isSelected ? '600' : '400'}
                    >
                      {dayInfo.shortDate ?? `D${pt.day}`}
                    </text>

                    <circle
                      cx={cx}
                      cy={cyDomain}
                      r={isSelected ? 4.5 : 3}
                      fill={isSelected ? '#BFE6F2' : '#5CC8E0'}
                      stroke="#08101D"
                      strokeWidth="1.2"
                    />

                    {cyRegion !== null && (
                      <circle
                        cx={cx}
                        cy={cyRegion}
                        r={isSelected ? 4 : 2.8}
                        fill="#F2A93B"
                        stroke="#08101D"
                        strokeWidth="1.2"
                      />
                    )}

                    {/* Keyboard-accessible day hit target */}
                    <rect
                      x={cx - 16}
                      y={PAD_T}
                      width={32}
                      height={PLOT_H}
                      fill="transparent"
                      tabIndex={0}
                      role="button"
                      aria-label={`Select Forecast ${dayInfo.displayLabel}: domain mean ${pt.domain.weightedMean.toFixed(vMeta.decimals)} ${vMeta.displayUnit}, min ${pt.domain.min.toFixed(vMeta.decimals)}, max ${pt.domain.max.toFixed(vMeta.decimals)}`}
                      className="cursor-pointer focus:outline-none"
                      onMouseEnter={() => setHoveredDay(pt.day)}
                      onFocus={() => setHoveredDay(pt.day)}
                      onBlur={() => setHoveredDay(null)}
                      onClick={() => onSelectDay(pt.day)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectDay(pt.day);
                        }
                      }}
                    />
                  </g>
                );
              })}

              <text
                x={PAD_L + PLOT_W / 2}
                y={CHART_H - 4}
                textAnchor="middle"
                fill="#93A4BD"
                fontSize="10"
                fontFamily="IBM Plex Mono, monospace"
              >
                {initDateIso
                  ? 'Valid Calendar Date (rollout[k] = init + k + 1 days)'
                  : 'Forecast Day (rollout[k] = Day k + 1)'}
              </text>
            </svg>
          </div>

          {activePoint && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xs border border-[#1E2F4A] bg-[#08101D] px-3.5 py-2 font-mono text-xs tabular-nums">
              <span className="text-[#BFE6F2] font-medium">
                {resolveForecastDayDate(initDateIso, activePoint.day).displayLabel}
              </span>
              <span className="text-[#E6EDF7]">
                Domain mean: {activePoint.domain.weightedMean.toFixed(vMeta.decimals)}{' '}
                {vMeta.displayUnit}
              </span>
              <span className="text-[#F2A93B]">
                Region mean:{' '}
                {Number.isFinite(activePoint.region.weightedMean)
                  ? `${activePoint.region.weightedMean.toFixed(vMeta.decimals)} ${vMeta.displayUnit}`
                  : 'No cells'}
              </span>
              <span className="text-[#93A4BD]">
                Min / Max: {activePoint.domain.min.toFixed(vMeta.decimals)} /{' '}
                {activePoint.domain.max.toFixed(vMeta.decimals)} {vMeta.displayUnit}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xs border border-[#1E2F4A] bg-[#08101D]">
          <table
            className="w-full text-left font-mono text-xs tabular-nums border-collapse"
            data-testid="timeseries-data-table"
          >
            <thead>
              <tr className="border-b border-[#1E2F4A] bg-[#060B14] text-[#93A4BD]">
                <th className="p-2.5 font-medium">Day</th>
                {initDateIso && <th className="p-2.5 font-medium">Valid Date</th>}
                <th className="p-2.5 font-medium">Domain mean ({vMeta.displayUnit})</th>
                <th className="p-2.5 font-medium">Domain min</th>
                <th className="p-2.5 font-medium">Domain max</th>
                <th className="p-2.5 font-medium">Max location</th>
                <th className="p-2.5 font-medium">Region mean ({vMeta.displayUnit})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2F4A]/80">
              {series.map((pt) => {
                const dayInfo = resolveForecastDayDate(initDateIso, pt.day);
                return (
                  <tr
                    key={pt.day}
                    className={
                      pt.day === selectedDay ? 'bg-[#142238]/80 text-[#E6EDF7]' : 'text-[#E6EDF7]'
                    }
                  >
                    <td className="p-2.5">
                      <button
                        type="button"
                        onClick={() => onSelectDay(pt.day)}
                        className="text-[#5CC8E0] underline hover:text-[#BFE6F2]"
                      >
                        Day {pt.day}
                      </button>
                    </td>
                    {initDateIso && (
                      <td className="p-2.5 text-[#BFE6F2]">
                        {dayInfo.isoDate ?? '—'}
                      </td>
                    )}
                    <td className="p-2.5">{pt.domain.weightedMean.toFixed(vMeta.decimals)}</td>
                    <td className="p-2.5 text-[#93A4BD]">{pt.domain.min.toFixed(vMeta.decimals)}</td>
                    <td className="p-2.5 text-[#93A4BD]">{pt.domain.max.toFixed(vMeta.decimals)}</td>
                    <td className="p-2.5 text-[#93A4BD]">
                      {pt.domain.maxLocation
                        ? `${pt.domain.maxLocation.lat.toFixed(1)}°N, ${pt.domain.maxLocation.lon.toFixed(1)}°E`
                        : '—'}
                    </td>
                    <td className="p-2.5 text-[#F2A93B]">
                      {Number.isFinite(pt.region.weightedMean)
                        ? pt.region.weightedMean.toFixed(vMeta.decimals)
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
