import { CheckCircle2, Info, XCircle } from 'lucide-react';
import type { IntegrityDiagnosticsReport } from '../../utils/labDiagnostics';
import type { DashboardVariable } from '../../utils/rolloutStore';
import { getVariableMeta } from '../../utils/units';

interface LabIntegrityPanelProps {
  report: IntegrityDiagnosticsReport;
  variable: DashboardVariable;
  isZeroControl: boolean;
}

export function LabIntegrityPanel({
  report,
  variable,
  isZeroControl,
}: LabIntegrityPanelProps) {
  const vMeta = getVariableMeta(variable);

  const fmtPct = (share: number | null) =>
    share === null ? 'N/A (zero total |Δ|)' : `${(share * 100).toFixed(1)}%`;

  return (
    <section
      aria-labelledby="integrity-panel-heading"
      data-testid="lab-integrity-panel"
      className="instrument-plane rounded-xs divide-y divide-[#1E2F4A]"
    >
      <div className="px-5 py-3.5 bg-[#08101D] space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#F2A93B]">
            Experiment Diagnostics
          </span>
          <span className="text-[#1E2F4A]" aria-hidden="true">
            |
          </span>
          <h2
            id="integrity-panel-heading"
            className="font-mono text-xs font-semibold text-[#E6EDF7]"
          >
            Descriptive diagnostics — not scientific validation
          </h2>
        </div>
        <p className="text-xs text-[#93A4BD]">
          Computed directly from actual returned baseline and scenario rollout
          tensors. Passing numeric sanity checks does not validate physical or
          scientific accuracy.
        </p>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 bg-[#1E2F4A] gap-px font-mono text-xs tabular-nums">
        <div className="bg-[#08101D] p-4 space-y-1">
          <dt className="text-[#93A4BD]">All response values finite</dt>
          <dd className="flex items-center gap-1.5 text-sm font-semibold">
            {report.allValuesFinite ? (
              <>
                <CheckCircle2
                  className="h-4 w-4 text-[#5FC9A0]"
                  aria-hidden="true"
                />
                <span className="text-[#5FC9A0]">Yes (0 non-finite)</span>
              </>
            ) : (
              <>
                <XCircle
                  className="h-4 w-4 text-[#E5646B]"
                  aria-hidden="true"
                />
                <span className="text-[#E5646B]">
                  No ({report.nonFiniteCount} non-finite)
                </span>
              </>
            )}
          </dd>
        </div>

        <div className="bg-[#08101D] p-4 space-y-1">
          <dt className="text-[#93A4BD]">Precipitation nonnegative</dt>
          <dd className="flex items-center gap-1.5 text-sm font-semibold">
            {report.precipitationNonNegative ? (
              <>
                <CheckCircle2
                  className="h-4 w-4 text-[#5FC9A0]"
                  aria-hidden="true"
                />
                <span className="text-[#5FC9A0]">
                  Yes (min {report.minPrecipMmDay.toFixed(3)} mm/day)
                </span>
              </>
            ) : (
              <>
                <XCircle
                  className="h-4 w-4 text-[#F2A93B]"
                  aria-hidden="true"
                />
                <span className="text-[#F2A93B]">
                  {report.negativePrecipCount} cell(s) &lt; 0 (min{' '}
                  {report.minPrecipMmDay.toFixed(4)})
                </span>
              </>
            )}
          </dd>
        </div>

        <div className="bg-[#08101D] p-4 space-y-1">
          <dt className="text-[#93A4BD]">
            {isZeroControl
              ? 'Control vs baseline max |Δ| (all channels)'
              : 'Scenario vs baseline max |Δ| (all channels)'}
          </dt>
          <dd className="text-sm font-semibold text-[#BFE6F2]">
            {report.overallMaxAbsRawDiff.toExponential(3)}
            <span className="block text-[11px] font-normal text-[#93A4BD] mt-0.5">
              {vMeta.key} max |Δ|: {report.selectedVarMaxAbsDiff.toFixed(4)}{' '}
              {vMeta.displayUnit}
            </span>
          </dd>
        </div>

        <div className="bg-[#08101D] p-4 space-y-1">
          <dt className="text-[#93A4BD]">
            Day 1 share of total |Δ| inside footprint ({report.footprintCellCount}{' '}
            cells)
          </dt>
          <dd className="text-sm font-semibold text-[#5CC8E0]">
            {fmtPct(report.day1FootprintShare)}
          </dd>
        </div>

        <div className="bg-[#08101D] p-4 space-y-1">
          <dt className="text-[#93A4BD]">
            Day {report.finalDayNumber} share of total |Δ| inside footprint
          </dt>
          <dd className="text-sm font-semibold text-[#5CC8E0]">
            {fmtPct(report.finalDayFootprintShare)}
          </dd>
        </div>

        <div className="bg-[#08101D] p-4 space-y-1">
          <dt className="text-[#93A4BD]">
            Total |Δ| outside footprint ({vMeta.displayUnit})
          </dt>
          <dd className="text-sm font-semibold text-[#E6EDF7]">
            D1: {report.day1OutsideTotalAbsDiff.toFixed(2)} · D
            {report.finalDayNumber}:{' '}
            {report.finalDayOutsideTotalAbsDiff.toFixed(2)}
          </dd>
        </div>
      </dl>

      <p className="flex items-start gap-2 bg-[#060B14] px-5 py-3 text-xs text-[#93A4BD] leading-relaxed">
        <Info
          className="h-4 w-4 text-[#5CC8E0] shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <span>
          Localized initial perturbations may influence cells outside their
          initial footprint through the model’s receptive field and autoregressive
          steps, but this diagnostic is purely descriptive and does not prove
          physical causality or scientific validity.
        </span>
      </p>
    </section>
  );
}
