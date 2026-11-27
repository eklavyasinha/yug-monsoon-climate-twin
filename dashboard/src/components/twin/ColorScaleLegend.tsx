import { useMemo } from 'react';
import type { ScaleRangeMode, ScientificColorScale } from '../../utils/colorScales';

interface ColorScaleLegendProps {
  scale: ScientificColorScale;
  unit: string;
  decimals?: number;
  isDifferenceMode: boolean;
  scaleRangeMode: ScaleRangeMode;
  onScaleRangeModeChange: (mode: ScaleRangeMode) => void;
}

export function ColorScaleLegend({
  scale,
  unit,
  decimals = 1,
  isDifferenceMode,
  scaleRangeMode,
  onScaleRangeModeChange,
}: ColorScaleLegendProps) {
  const gradientCss = useMemo(() => {
    const stops: string[] = [];
    const steps = 20;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      let sampleVal: number;
      if (scale.scaleKind === 'sequential-log1p') {
        const logMax = Math.log1p(Math.max(scale.max, 1));
        sampleVal = Math.expm1(t * logMax);
      } else {
        sampleVal = scale.min + t * (scale.max - scale.min);
      }
      stops.push(`${scale.mapValueToColor(sampleVal)} ${(t * 100).toFixed(1)}%`);
    }
    return `linear-gradient(to right, ${stops.join(', ')})`;
  }, [scale]);

  return (
    <div className="border-t border-[#1E2F4A] bg-[#08101D] px-3.5 py-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-xs text-[#E6EDF7] tabular-nums">
          <span>{scale.paletteName}</span>
          <span className="text-[#93A4BD]" aria-hidden="true"> · </span>
          <span className="text-[#BFE6F2]">
            {isDifferenceMode ? `Δ ${unit}` : unit}
          </span>
        </div>

        {!isDifferenceMode && (
          <div
            role="group"
            aria-label="Color scale range mode"
            className="inline-flex items-center rounded-xs border border-[#1E2F4A] bg-[#060B14] p-0.5 text-[11px] font-mono"
          >
            <button
              type="button"
              onClick={() => onScaleRangeModeChange('fixed-run')}
              aria-pressed={scaleRangeMode === 'fixed-run'}
              className={`min-h-[30px] px-2.5 py-1 rounded-xs transition-colors duration-150 whitespace-nowrap ${
                scaleRangeMode === 'fixed-run'
                  ? 'bg-[#142238] text-[#5CC8E0]'
                  : 'text-[#93A4BD] hover:text-[#E6EDF7]'
              }`}
            >
              Fixed across run
            </button>
            <button
              type="button"
              onClick={() => onScaleRangeModeChange('per-day')}
              aria-pressed={scaleRangeMode === 'per-day'}
              className={`min-h-[30px] px-2.5 py-1 rounded-xs transition-colors duration-150 whitespace-nowrap ${
                scaleRangeMode === 'per-day'
                  ? 'bg-[#142238] text-[#F2A93B]'
                  : 'text-[#93A4BD] hover:text-[#E6EDF7]'
              }`}
            >
              Per-day range
            </button>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <div
          className="h-2.5 w-full rounded-xs border border-[#1E2F4A]"
          style={{ background: gradientCss }}
          aria-hidden="true"
        />
        <div className="relative h-4 font-mono text-[11px] text-[#93A4BD] tabular-nums">
          {scale.ticks.map((tick, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === scale.ticks.length - 1;
            const formatted =
              isDifferenceMode && tick.value > 0
                ? `+${tick.value.toFixed(decimals)}`
                : tick.value.toFixed(decimals);
            const alignClass = isFirst
              ? 'left-0 translate-x-0'
              : isLast
                ? 'right-0 translate-x-0'
                : '-translate-x-1/2';
            return (
              <span
                key={`${idx}-${tick.value.toFixed(4)}`}
                className={`absolute top-0 whitespace-nowrap ${alignClass}`}
                style={
                  !isFirst && !isLast
                    ? { left: `${(tick.position * 100).toFixed(1)}%` }
                    : undefined
                }
              >
                {formatted}
              </span>
            );
          })}
        </div>
      </div>

      {!isDifferenceMode && scaleRangeMode === 'per-day' && (
        <p className="text-xs text-[#F2A93B] leading-snug">
          Per-day scaling rescales color limits independently for each forecast day and can change visual comparison across days.
        </p>
      )}
      {scale.scaleKind === 'sequential-log1p' && !isDifferenceMode && (
        <p className="font-mono text-[11px] text-[#93A4BD]">
          Rainfall encoded with log1p(mm/day) transform to preserve both light rain and heavy (&gt;10 mm/day) cores; tick labels show actual mm/day.
        </p>
      )}
    </div>
  );
}
