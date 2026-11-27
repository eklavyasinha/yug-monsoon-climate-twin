import { CHANNELS, GRID_SPEC, PROJECT_FACTS } from '../config/projectFacts';

export function MethodPage() {
  const { evaluation } = PROJECT_FACTS;

  return (
    <div className="workstation-canvas">
      <div className="mx-auto max-w-[1360px] px-4 py-10 sm:px-6 lg:px-8 space-y-12">
        {/* Research Specification Masthead */}
        <header className="border-b border-[#1E2F4A] pb-7 grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
          <div className="lg:col-span-8 space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#5CC8E0]">
              Scientific Methodology · Round 1 Wire Protocol
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight text-[#E6EDF7]">
              Methodology, Wire Contract &amp; Evaluation Protocol
            </h1>
          </div>
          <p className="lg:col-span-4 text-sm text-[#93A4BD] leading-relaxed">
            Formal specification of the 1° atmospheric grid, the{' '}
            <code className="font-mono text-[#BFE6F2]">mom-ic-v1</code> schema,
            the HTTP contract verified in{' '}
            <code className="font-mono text-[#BFE6F2]">docs/API_CONTRACT.md</code>,
            and the Round 1 blind evaluation protocol.
          </p>
        </header>

        {/* Chapter I — Spatial Grid & Physical Units */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 border-t border-[#1E2F4A] pt-8">
          <div className="lg:col-span-4 space-y-2">
            <p className="font-mono text-xs text-[#5CC8E0]">CHAPTER I</p>
            <h2 className="font-display text-2xl font-semibold text-[#E6EDF7]">
              Spatial Grid &amp; Physical Units
            </h2>
            <p className="text-xs leading-relaxed text-[#93A4BD]">
              The domain covers{' '}
              <code className="font-mono text-[#BFE6F2]">
                {GRID_SPEC.rows} × {GRID_SPEC.cols}
              </code>{' '}
              cells at 1° spacing with cell centres spanning{' '}
              <code className="font-mono text-[#BFE6F2]">6.5–37.5°N</code> (south
              to north) and{' '}
              <code className="font-mono text-[#BFE6F2]">65.5–100.5°E</code>{' '}
              (west to east). Each cell is constructed as the mean of the four
              surrounding 1° ERA5 grid points. Wire tensors always carry raw
              physical units—normalisation happens exclusively inside the backend.
            </p>
          </div>

          <div className="lg:col-span-8 overflow-x-auto border border-[#1E2F4A] bg-[#08101D]">
            <table className="w-full text-left font-mono text-xs tabular-nums border-collapse">
              <thead>
                <tr className="border-b border-[#1E2F4A] bg-[#060B14] text-[#93A4BD]">
                  <th className="px-4 py-3 font-medium">Idx</th>
                  <th className="px-4 py-3 font-medium">Key</th>
                  <th className="px-4 py-3 font-medium">Variable</th>
                  <th className="px-4 py-3 font-medium">Wire unit</th>
                  <th className="px-4 py-3 font-medium">Daily aggregation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2F4A]">
                {CHANNELS.map((ch) => (
                  <tr key={ch.key}>
                    <td className="px-4 py-3 text-[#93A4BD]">{ch.index}</td>
                    <td className="px-4 py-3 text-[#5CC8E0] font-semibold">
                      {ch.key}
                    </td>
                    <td className="px-4 py-3 text-[#E6EDF7] font-sans">
                      {ch.name}
                    </td>
                    <td className="px-4 py-3 text-[#BFE6F2]">{ch.unit}</td>
                    <td className="px-4 py-3 text-[#93A4BD] font-sans">
                      {ch.dailyAggregation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Chapter II — Initial-Conditions Format */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 border-t border-[#1E2F4A] pt-8">
          <div className="lg:col-span-4 space-y-2">
            <p className="font-mono text-xs text-[#5CC8E0]">CHAPTER II</p>
            <h2 className="font-display text-2xl font-semibold text-[#E6EDF7]">
              Initial-Conditions Format (mom-ic-v1)
            </h2>
            <p className="text-xs leading-relaxed text-[#93A4BD]">
              Local browser-loaded initial conditions use the strict versioned
              JSON schema{' '}
              <code className="font-mono text-[#BFE6F2]">mom-ic-v1</code>. Files
              are validated with Zod for exact shape{' '}
              <code className="font-mono text-[#BFE6F2]">[3, 6, 32, 36]</code>,
              exact channel order, finite numbers, strictly monotonic
              latitude/longitude arrays, and a 5 MB file size cap. Optional{' '}
              <code className="font-mono text-[#BFE6F2]">init_date</code> or{' '}
              <code className="font-mono text-[#BFE6F2]">dates</code> fields (or
              unambiguous dates in metadata) drive valid forecast calendar dates
              using UTC arithmetic; if absent, views stay on Lead Day 1–N.
              Orientation is read directly from{' '}
              <code className="font-mono text-[#BFE6F2]">grid.lat</code>; data is
              never silently flipped, clipped, or repaired.
            </p>
          </div>

          <div className="lg:col-span-8">
            <pre className="overflow-x-auto border border-[#1E2F4A] bg-[#060B14] p-5 font-mono text-xs text-[#BFE6F2] leading-relaxed">
{`{
  "schema": "mom-ic-v1",
  "label": "Example initial conditions",
  "source_note": "Dataset and date information",
  "init_date": "2021-07-14",
  "dates": ["2021-07-12", "2021-07-13", "2021-07-14"],
  "doy_sincos": [sin, cos],
  "channels": ["t2m", "tp", "u10", "v10", "msl", "tcwv"],
  "grid": { "lat": [32 finite monotonic floats], "lon": [36 finite monotonic floats] },
  "init_states": [3][6][32][36],
  "static": { "land_sea_mask": [32][36] }
}`}
            </pre>
          </div>
        </section>

        {/* Chapter III — Evaluation Protocol & Benchmark Shocks */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 border-t border-[#1E2F4A] pt-8">
          <div className="lg:col-span-4 space-y-2">
            <p className="font-mono text-xs text-[#5CC8E0]">CHAPTER III</p>
            <h2 className="font-display text-2xl font-semibold text-[#E6EDF7]">
              Round 1 Evaluation Protocol &amp; Benchmark Shocks
            </h2>
            <p className="text-xs leading-relaxed text-[#93A4BD]">
              {evaluation.protocolSummary}
            </p>
          </div>

          <div className="lg:col-span-8 space-y-6">
            <dl className="divide-y divide-[#1E2F4A] border-y border-[#1E2F4A] text-sm">
              <div className="py-3 grid grid-cols-1 sm:grid-cols-12 gap-2">
                <dt className="sm:col-span-3 font-mono text-xs text-[#93A4BD]">
                  Blind windows
                </dt>
                <dd className="sm:col-span-9 text-[#E6EDF7] leading-relaxed">
                  {evaluation.blindWindows}
                </dd>
              </div>
              <div className="py-3 grid grid-cols-1 sm:grid-cols-12 gap-2">
                <dt className="sm:col-span-3 font-mono text-xs text-[#93A4BD]">
                  Scoring rubric
                </dt>
                <dd className="sm:col-span-9 text-[#E6EDF7] leading-relaxed">
                  {evaluation.scoringRubric}
                </dd>
              </div>
              <div className="py-3 grid grid-cols-1 sm:grid-cols-12 gap-2">
                <dt className="sm:col-span-3 font-mono text-xs text-[#93A4BD]">
                  Round 2 hard gate
                </dt>
                <dd className="sm:col-span-9 text-[#E6EDF7] leading-relaxed">
                  {evaluation.hardGate}
                </dd>
              </div>
              <div className="py-3 grid grid-cols-1 sm:grid-cols-12 gap-2">
                <dt className="sm:col-span-3 font-mono text-xs text-[#93A4BD]">
                  Inference target
                </dt>
                <dd className="sm:col-span-9 text-[#E6EDF7] leading-relaxed">
                  {evaluation.inferenceTarget}
                </dd>
              </div>
            </dl>

            <div className="grid grid-cols-1 md:grid-cols-3 border border-[#1E2F4A] bg-[#1E2F4A] gap-px">
              {evaluation.benchmarkShocks.map((shock) => (
                <div key={shock.id} className="bg-[#08101D] p-4 space-y-2">
                  <p className="font-mono text-xs text-[#5CC8E0]">{shock.id}</p>
                  <p className="text-xs leading-relaxed text-[#E6EDF7]">
                    {shock.summary}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Chapter IV — Limitations & Interpretation Boundaries */}
        <section
          aria-labelledby="method-limitations-heading"
          data-testid="method-limitations-section"
          className="grid grid-cols-1 lg:grid-cols-12 gap-8 border-t-2 border-[#F2A93B]/60 pt-8"
        >
          <div className="lg:col-span-4 space-y-2">
            <p className="font-mono text-xs text-[#F2A93B]">CHAPTER IV</p>
            <h2
              id="method-limitations-heading"
              className="font-display text-2xl font-semibold text-[#E6EDF7]"
            >
              Limitations &amp; Interpretation Boundaries
            </h2>
            <p className="text-xs leading-relaxed text-[#93A4BD]">
              All visualisations, sensitivity diagnostics, and threshold
              summaries produced by this frontend are strictly descriptive views
              of experimental model outputs.
            </p>
          </div>

          <div className="lg:col-span-8">
            <ul className="divide-y divide-[#1E2F4A] border-y border-[#1E2F4A] text-sm leading-relaxed text-[#E6EDF7]">
              {PROJECT_FACTS.limitations.structuralLimitations.map((item) => (
                <li key={item} className="py-3 flex items-start gap-3">
                  <span
                    className="font-mono text-xs text-[#F2A93B] mt-1"
                    aria-hidden="true"
                  >
                    —
                  </span>
                  <span>{item}</span>
                </li>
              ))}
              <li className="py-3 flex items-start gap-3">
                <span
                  className="font-mono text-xs text-[#F2A93B] mt-1"
                  aria-hidden="true"
                >
                  —
                </span>
                <span>
                  Frontend diagnostic checks on{' '}
                  <code className="font-mono text-[#BFE6F2]">/lab</code> are
                  descriptive indicators of numerical response—not scientific
                  validation or causal proof.
                </span>
              </li>
              <li className="py-3 flex items-start gap-3">
                <span
                  className="font-mono text-xs text-[#F2A93B] mt-1"
                  aria-hidden="true"
                >
                  —
                </span>
                <span>
                  Threshold counts on{' '}
                  <code className="font-mono text-[#BFE6F2]">/impact</code>{' '}
                  depend on user-editable parameters and do not represent
                  operational weather warnings, flood advisories, crop-yield
                  predictions, or economic impact estimates.
                </span>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
