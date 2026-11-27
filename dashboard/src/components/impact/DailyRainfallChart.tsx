import { useMemo, useState } from 'react';
import { BarChart3, Table } from 'lucide-react';
import type { GeoRegion } from '../../utils/aggregation';
import { resolveForecastDayDate } from '../../utils/forecastDates';
import type { DailyRegionalRainfallPoint } from '../../utils/impactMetrics';

interface DailyRainfallChartProps {
  sequence: readonly DailyRegionalRainfallPoint[];
  region: GeoRegion;
  heavyRainThresholdMmDay: number;
  dryDayThresholdMmDay: number;
  hasScenario: boolean;
  initDateIso?: string | null;
}

const CHART_W = 680;
const CHART_H = 240;
const PAD_L = 56;
const PAD_R = 20;
const PAD_T = 18;
const PAD_B = 36;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;

export function DailyRainfallChart({
  sequence,
  region,
  heavyRainThresholdMmDay,
  dryDayThresholdMmDay,
  hasScenario,
  initDateIso = null,
}: DailyRainfallChartProps) {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  const yMax = useMemo(() => {
    let maxVal = Math.max(heavyRainThresholdMmDay * 1.15, dryDayThresholdMmDay * 2, 5);
    for (const pt of sequence) {
      if (Number.isFinite(pt.baselineMeanMmDay) && pt.baselineMeanMmDay > maxVal) {
        maxVal = pt.baselineMeanMmDay;
      }
      if (
        pt.scenarioMeanMmDay !== null &&
        Number.isFinite(pt.scenarioMeanMmDay) &&
        pt.scenarioMeanMmDay > maxVal
      ) {
        maxVal = pt.scenarioMeanMmDay;
      }
    }
    return maxVal * 1.1;
  }, [sequence, heavyRainThresholdMmDay, dryDayThresholdMmDay]);

  const xForIdx = (idx: number) => {
    if (sequence.length <= 1) return PAD_L + PLOT_W / 2;
    return PAD_L + (idx / (sequence.length - 1)) * PLOT_W;
  };
  const yForVal = (val: number) =>
    PAD_T + PLOT_H * (1 - Math.max(0, Math.min(1, val / (yMax || 1))));

  const baselinePath = sequence
    .map(
      (pt, i) =>
        `${i === 0 ? 'M' : 'L'} ${xForIdx(i).toFixed(1)} ${yForVal(pt.baselineMeanMmDay).toFixed(1)}`,
    )
    .join(' ');

  const scenarioPath = hasScenario
    ? sequence
        .map(
          (pt, i) =>
            `${i === 0 ? 'M' : 'L'} ${xForIdx(i).toFixed(1)} ${yForVal(pt.scenarioMeanMmDay ?? 0).toFixed(1)}`,
        )
        .join(' ')
    : '';

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);

  return (
    <section
      aria-labelledby="impact-daily-rain-heading"
      className="instrument-plane rounded-xs p-5 space-y-4 h-full flex flex-col justify-between"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1E2F4A] pb-3.5">
        <div className="space-y-1">
          <h2
            id="impact-daily-rain-heading"
            className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]"
          >
            Daily Regional Rainfall Sequence — {region.label}
          </h2>
          <p className="text-xs text-[#93A4BD]">
            cos(latitude)-weighted regional mean daily precipitation (mm/day).
            Regional averaging hides localized cell-level extremes.
          </p>
        </div>

        <div
          role="group"
          aria-label="Daily rainfall view mode"
          className="inline-flex rounded-xs border border-[#1E2F4A] bg-[#060B14] p-0.5 font-mono text-xs"
        >
          <button
            type="button"
            aria-pressed={viewMode === 'chart'}
            onClick={() => setViewMode('chart')}
            className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-xs px-3 py-1 ${
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
            aria-pressed={viewMode === 'table'}
            onClick={() => setViewMode('table')}
            className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-xs px-3 py-1 ${
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
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs text-[#93A4BD]">
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-0.5 w-4 bg-[#5CC8E0]" aria-hidden="true" />
              <span className="text-[#E6EDF7]">Baseline mean</span>
            </span>
            {hasScenario && (
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-0.5 w-4 bg-[#F2A93B]" aria-hidden="true" />
                <span className="text-[#E6EDF7]">Scenario mean</span>
              </span>
            )}
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-0.5 w-4 border-t border-dashed border-[#E5646B]" aria-hidden="true" />
              <span>Heavy threshold ({heavyRainThresholdMmDay} mm/day)</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-0.5 w-4 border-t border-dotted border-[#5FC9A0]" aria-hidden="true" />
              <span>Dry threshold ({dryDayThresholdMmDay} mm/day)</span>
            </span>
          </div>

          <div className="rounded-xs border border-[#1E2F4A] bg-[#08101D] p-2">
            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              role="img"
              aria-label={`Daily regional precipitation sequence across forecast days 1 to ${sequence.length}`}
              className="w-full h-auto block"
            >
              {yTicks.map((tick, idx) => {
                const y = yForVal(tick);
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
                      {tick.toFixed(1)}
                    </text>
                  </g>
                );
              })}

              {/* Threshold reference lines */}
              <line
                x1={PAD_L}
                y1={yForVal(heavyRainThresholdMmDay)}
                x2={PAD_L + PLOT_W}
                y2={yForVal(heavyRainThresholdMmDay)}
                stroke="#E5646B"
                strokeWidth="1.1"
                strokeDasharray="5 3"
              />
              <line
                x1={PAD_L}
                y1={yForVal(dryDayThresholdMmDay)}
                x2={PAD_L + PLOT_W}
                y2={yForVal(dryDayThresholdMmDay)}
                stroke="#5FC9A0"
                strokeWidth="1.1"
                strokeDasharray="2 3"
              />

              {/* Baseline line */}
              {baselinePath && (
                <path
                  d={baselinePath}
                  fill="none"
                  stroke="#5CC8E0"
                  strokeWidth="2"
                />
              )}

              {/* Scenario line */}
              {scenarioPath && (
                <path
                  d={scenarioPath}
                  fill="none"
                  stroke="#F2A93B"
                  strokeWidth="2"
                />
              )}

              {sequence.map((pt, i) => {
                const cx = xForIdx(i);
                const dayInfo = resolveForecastDayDate(initDateIso, pt.day);
                return (
                  <g key={pt.day}>
                    <circle
                      cx={cx}
                      cy={yForVal(pt.baselineMeanMmDay)}
                      r="3.2"
                      fill="#5CC8E0"
                      stroke="#08101D"
                      strokeWidth="1"
                    />
                    {hasScenario && pt.scenarioMeanMmDay !== null && (
                      <circle
                        cx={cx}
                        cy={yForVal(pt.scenarioMeanMmDay)}
                        r="3.2"
                        fill="#F2A93B"
                        stroke="#08101D"
                        strokeWidth="1"
                      />
                    )}
                    <text
                      x={cx}
                      y={PAD_T + PLOT_H + 17}
                      textAnchor="middle"
                      fill="#93A4BD"
                      fontSize="9.5"
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      {dayInfo.shortDate ?? `D${pt.day}`}
                    </text>
                  </g>
                );
              })}

              <text
                x={14}
                y={PAD_T + PLOT_H / 2}
                transform={`rotate(-90 14 ${PAD_T + PLOT_H / 2})`}
                textAnchor="middle"
                fill="#93A4BD"
                fontSize="10"
                fontFamily="IBM Plex Mono, monospace"
              >
                mm/day
              </text>
            </svg>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xs border border-[#1E2F4A] bg-[#08101D]">
          <table className="w-full text-left font-mono text-xs tabular-nums border-collapse">
            <thead>
              <tr className="border-b border-[#1E2F4A] bg-[#060B14] text-[#93A4BD]">
                <th className="p-2.5 font-medium">Day</th>
                {initDateIso && <th className="p-2.5 font-medium">Valid Date</th>}
                <th className="p-2.5 font-medium">Baseline mean (mm/day)</th>
                {hasScenario && (
                  <>
                    <th className="p-2.5 font-medium">Scenario mean (mm/day)</th>
                    <th className="p-2.5 font-medium">Delta (Scen − Base)</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2F4A]/80">
              {sequence.map((pt) => {
                const dayInfo = resolveForecastDayDate(initDateIso, pt.day);
                return (
                  <tr key={pt.day} className="text-[#E6EDF7]">
                    <td className="p-2.5 text-[#BFE6F2]">Day {pt.day}</td>
                    {initDateIso && (
                      <td className="p-2.5 text-[#BFE6F2]">
                        {dayInfo.isoDate ?? '—'}
                      </td>
                    )}
                    <td className="p-2.5">
                      {Number.isFinite(pt.baselineMeanMmDay)
                        ? pt.baselineMeanMmDay.toFixed(2)
                        : '—'}
                    </td>
                    {hasScenario && (
                      <>
                        <td className="p-2.5 text-[#F2A93B]">
                          {pt.scenarioMeanMmDay !== null &&
                          Number.isFinite(pt.scenarioMeanMmDay)
                            ? pt.scenarioMeanMmDay.toFixed(2)
                            : '—'}
                        </td>
                        <td className="p-2.5 text-[#93A4BD]">
                          {pt.diffMmDay !== null && Number.isFinite(pt.diffMmDay)
                            ? `${pt.diffMmDay > 0 ? '+' : ''}${pt.diffMmDay.toFixed(2)}`
                            : '—'}
                        </td>
                      </>
                    )}
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
