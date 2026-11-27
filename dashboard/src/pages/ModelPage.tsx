import { PROJECT_FACTS } from '../config/projectFacts';
import { FactValue } from '../components/FactValue';

export function ModelPage() {
  const { model, training, evaluation, limitations } = PROJECT_FACTS;
  const metrics = evaluation.locallyMeasuredMetrics;

  return (
    <div className="workstation-canvas">
      <div className="mx-auto max-w-[1360px] px-4 py-10 sm:px-6 lg:px-8 space-y-10">
        {/* Monograph Header */}
        <header className="border-b border-[#1E2F4A] pb-7 grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
          <div className="lg:col-span-8 space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#5CC8E0]">
              Technical Specification Monograph · src/config/projectFacts.ts
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight text-[#E6EDF7]">
              Model Specification &amp; Evaluation Record
            </h1>
          </div>
          <p className="lg:col-span-4 text-sm text-[#93A4BD] leading-relaxed">
            Every factual statement below originates strictly from the verified
            Round 1 contract and attached{' '}
            <code className="font-mono text-[#BFE6F2]">serve.py</code>. Unprovided
            or unmeasured details are explicitly labeled{' '}
            <code className="font-mono text-[#F2A93B]">
              TO BE PROVIDED BY TEAM
            </code>
            .
          </p>
        </header>

        {/* Asymmetric Monograph Split: Sticky 4-col Index & Wire Quick-Card | 8-col Hairline Spec Sheets */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <aside className="lg:col-span-4 lg:sticky lg:top-20 space-y-6">
            <nav
              aria-label="Specification sections"
              className="border-t border-[#1E2F4A] pt-4 space-y-2 font-mono text-xs"
            >
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#93A4BD] pb-1">
                Document Index
              </p>
              <a
                href="#model-architecture"
                className="flex items-center justify-between py-1.5 text-[#E6EDF7] hover:text-[#5CC8E0] border-b border-[#1E2F4A]/60"
              >
                <span>01 · Architecture &amp; Runtime</span>
                <span className="text-[#93A4BD]">→</span>
              </a>
              <a
                href="#model-training"
                className="flex items-center justify-between py-1.5 text-[#E6EDF7] hover:text-[#5CC8E0] border-b border-[#1E2F4A]/60"
              >
                <span>02 · Training Dataset &amp; Procedure</span>
                <span className="text-[#93A4BD]">→</span>
              </a>
              <a
                href="#model-evaluation"
                className="flex items-center justify-between py-1.5 text-[#E6EDF7] hover:text-[#5CC8E0] border-b border-[#1E2F4A]/60"
              >
                <span>03 · Local Evaluation Metrics</span>
                <span className="text-[#93A4BD]">→</span>
              </a>
              <a
                href="#model-limitations"
                className="flex items-center justify-between py-1.5 text-[#E6EDF7] hover:text-[#5CC8E0]"
              >
                <span>04 · Limitations, Drift &amp; Stability</span>
                <span className="text-[#93A4BD]">→</span>
              </a>
            </nav>

            <div className="border border-[#1E2F4A] bg-[#08101D] p-4 space-y-3 font-mono text-xs">
              <p className="text-[11px] uppercase tracking-[0.12em] text-[#5CC8E0]">
                Verified Wire Summary
              </p>
              <dl className="space-y-2 tabular-nums">
                <div className="flex justify-between gap-2 border-b border-[#1E2F4A]/70 pb-2">
                  <dt className="text-[#93A4BD]">Spatial grid</dt>
                  <dd className="text-[#E6EDF7] text-right">
                    1° · 32 × 36
                  </dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-[#1E2F4A]/70 pb-2">
                  <dt className="text-[#93A4BD]">Input tensor</dt>
                  <dd className="text-[#BFE6F2]">[3, 6, 32, 36]</dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-[#1E2F4A]/70 pb-2">
                  <dt className="text-[#93A4BD]">Output tensor</dt>
                  <dd className="text-[#BFE6F2]">[steps, 6, 32, 36]</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#93A4BD]">Target latency</dt>
                  <dd className="text-[#E6EDF7]">CPU ≤ 5.0 s (10 steps)</dd>
                </div>
              </dl>
            </div>
          </aside>

          <div className="lg:col-span-8 space-y-12">
            <section
              id="model-architecture"
              className="border-t-2 border-[#5CC8E0] pt-5 space-y-4"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-display text-2xl font-semibold text-[#E6EDF7]">
                  Architecture &amp; Runtime Interface
                </h2>
                <span className="font-mono text-xs text-[#5CC8E0]">01</span>
              </div>

              <dl className="divide-y divide-[#1E2F4A] border-y border-[#1E2F4A] text-sm">
                <div className="py-3.5 grid grid-cols-1 gap-1 sm:grid-cols-12">
                  <dt className="sm:col-span-4 font-mono text-xs text-[#93A4BD]">
                    Reported model_name
                  </dt>
                  <dd className="sm:col-span-8">
                    <FactValue value={model.reportedModelName} mono />
                  </dd>
                </div>
                <div className="py-3.5 grid grid-cols-1 gap-1 sm:grid-cols-12">
                  <dt className="sm:col-span-4 font-mono text-xs text-[#93A4BD]">
                    Observed server architecture
                  </dt>
                  <dd className="sm:col-span-8 text-[#E6EDF7] leading-relaxed">
                    {model.architectureSummary}
                  </dd>
                </div>
                <div className="py-3.5 grid grid-cols-1 gap-1 sm:grid-cols-12">
                  <dt className="sm:col-span-4 font-mono text-xs text-[#93A4BD]">
                    Internal layer &amp; parameter specs
                  </dt>
                  <dd className="sm:col-span-8">
                    <FactValue value={model.architectureDetails} />
                  </dd>
                </div>
                <div className="py-3.5 grid grid-cols-1 gap-1 sm:grid-cols-12">
                  <dt className="sm:col-span-4 font-mono text-xs text-[#93A4BD]">
                    Checkpoint path (serve.py)
                  </dt>
                  <dd className="sm:col-span-8">
                    <FactValue value={model.checkpointPath} mono />
                  </dd>
                </div>
                <div className="py-3.5 grid grid-cols-1 gap-1 sm:grid-cols-12">
                  <dt className="sm:col-span-4 font-mono text-xs text-[#93A4BD]">
                    Hardware &amp; runtime target
                  </dt>
                  <dd className="sm:col-span-8 text-[#E6EDF7]">
                    {model.runtimeHardwareTarget}
                  </dd>
                </div>
                <div className="py-3.5 grid grid-cols-1 gap-1 sm:grid-cols-12">
                  <dt className="sm:col-span-4 font-mono text-xs text-[#93A4BD]">
                    Input contract
                  </dt>
                  <dd className="sm:col-span-8 text-[#E6EDF7] leading-relaxed">
                    {model.inputContract}
                  </dd>
                </div>
                <div className="py-3.5 grid grid-cols-1 gap-1 sm:grid-cols-12">
                  <dt className="sm:col-span-4 font-mono text-xs text-[#93A4BD]">
                    Output contract
                  </dt>
                  <dd className="sm:col-span-8 text-[#E6EDF7] leading-relaxed">
                    {model.outputContract}
                  </dd>
                </div>
                <div className="py-3.5 grid grid-cols-1 gap-1 sm:grid-cols-12">
                  <dt className="sm:col-span-4 font-mono text-xs text-[#93A4BD]">
                    Internal normalisation
                  </dt>
                  <dd className="sm:col-span-8 text-[#E6EDF7] leading-relaxed">
                    {model.internalNormalization}
                  </dd>
                </div>
                <div className="py-3.5 grid grid-cols-1 gap-1 sm:grid-cols-12">
                  <dt className="sm:col-span-4 font-mono text-xs text-[#93A4BD]">
                    Server-side output clamps
                  </dt>
                  <dd className="sm:col-span-8 text-[#E6EDF7] leading-relaxed">
                    {model.outputConstraints}
                  </dd>
                </div>
                <div className="py-3.5 grid grid-cols-1 gap-1 sm:grid-cols-12">
                  <dt className="sm:col-span-4 font-mono text-xs text-[#93A4BD]">
                    Audited serve.py pipeline
                  </dt>
                  <dd className="sm:col-span-8 space-y-2.5 text-[#E6EDF7] leading-relaxed">
                    <ul className="space-y-1.5 text-xs">
                      {model.servePipelineAudit.verifiedFromServePy.map(
                        (item) => (
                          <li key={item} className="flex items-start gap-2">
                            <span
                              className="font-mono text-[#5CC8E0] shrink-0"
                              aria-hidden="true"
                            >
                              ·
                            </span>
                            <span>{item}</span>
                          </li>
                        ),
                      )}
                    </ul>
                    <p className="border-l-2 border-[#F2A93B]/60 pl-3 text-xs text-[#93A4BD]">
                      {model.servePipelineAudit.unverifiedExternalCodeNotice}
                    </p>
                  </dd>
                </div>
              </dl>
            </section>

            <section
              id="model-training"
              className="border-t border-[#1E2F4A] pt-5 space-y-4"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-display text-2xl font-semibold text-[#E6EDF7]">
                  Training Dataset &amp; Procedure
                </h2>
                <span className="font-mono text-xs text-[#5CC8E0]">02</span>
              </div>

              <dl className="divide-y divide-[#1E2F4A] border-y border-[#1E2F4A] text-sm">
                <div className="py-3.5 grid grid-cols-1 gap-1 sm:grid-cols-12">
                  <dt className="sm:col-span-4 font-mono text-xs text-[#93A4BD]">
                    Training dataset file
                  </dt>
                  <dd className="sm:col-span-8">
                    <FactValue value={training.datasetFile} mono />
                  </dd>
                </div>
                <div className="py-3.5 grid grid-cols-1 gap-1 sm:grid-cols-12">
                  <dt className="sm:col-span-4 font-mono text-xs text-[#93A4BD]">
                    Grid &amp; aggregation construction
                  </dt>
                  <dd className="sm:col-span-8 text-[#E6EDF7] leading-relaxed">
                    {training.datasetConstruction}
                  </dd>
                </div>
                <div className="py-3.5 grid grid-cols-1 gap-1 sm:grid-cols-12">
                  <dt className="sm:col-span-4 font-mono text-xs text-[#93A4BD]">
                    Bundled static channels
                  </dt>
                  <dd className="sm:col-span-8 font-mono text-xs text-[#BFE6F2]">
                    {training.staticChannels.join(', ')} (not sent over API wire)
                  </dd>
                </div>
                <div className="py-3.5 grid grid-cols-1 gap-1 sm:grid-cols-12">
                  <dt className="sm:col-span-4 font-mono text-xs text-[#93A4BD]">
                    Training period
                  </dt>
                  <dd className="sm:col-span-8">
                    <FactValue value={training.trainingPeriod} />
                  </dd>
                </div>
                <div className="py-3.5 grid grid-cols-1 gap-1 sm:grid-cols-12">
                  <dt className="sm:col-span-4 font-mono text-xs text-[#93A4BD]">
                    Training procedure &amp; loss
                  </dt>
                  <dd className="sm:col-span-8">
                    <FactValue value={training.procedureAndLoss} />
                  </dd>
                </div>
              </dl>
            </section>

            <section
              id="model-evaluation"
              className="border-t border-[#1E2F4A] pt-5 space-y-4"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-display text-2xl font-semibold text-[#E6EDF7]">
                  Locally Measured Evaluation Metrics
                </h2>
                <span className="font-mono text-xs text-[#5CC8E0]">03</span>
              </div>
              <p className="text-xs text-[#93A4BD]">
                No evaluation metrics have been supplied by the team yet. Fields
                remain null until populated from verified local benchmark runs.
              </p>
              <div className="overflow-x-auto border border-[#1E2F4A] bg-[#08101D]">
                <table className="w-full text-left font-mono text-xs tabular-nums border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E2F4A] bg-[#060B14] text-[#93A4BD]">
                      <th className="px-4 py-3 font-medium">Metric</th>
                      <th className="px-4 py-3 font-medium">
                        Locally measured value
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2F4A]">
                    <tr>
                      <td className="px-4 py-3 text-[#E6EDF7]">
                        Lat-weighted RMSE skill (Day 1 / 4 / 8)
                      </td>
                      <td className="px-4 py-3">
                        <FactValue value={metrics.rmseSkillDay1} /> /{' '}
                        <FactValue value={metrics.rmseSkillDay4} /> /{' '}
                        <FactValue value={metrics.rmseSkillDay8} />
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-[#E6EDF7]">
                        Heavy-rain CSI @ 10 mm/day (Day 1 / 4 / 8)
                      </td>
                      <td className="px-4 py-3">
                        <FactValue value={metrics.heavyRainCsiDay1} /> /{' '}
                        <FactValue value={metrics.heavyRainCsiDay4} /> /{' '}
                        <FactValue value={metrics.heavyRainCsiDay8} />
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-[#E6EDF7]">
                        Anti-blur spatial variance ratio (Day 8)
                      </td>
                      <td className="px-4 py-3">
                        <FactValue value={metrics.antiBlurVarianceRatioDay8} />
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-[#E6EDF7]">
                        Perturbation causality score
                      </td>
                      <td className="px-4 py-3">
                        <FactValue value={metrics.perturbationCausalityScore} />
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-[#E6EDF7]">
                        Measured 10-step CPU inference time
                      </td>
                      <td className="px-4 py-3">
                        <FactValue
                          value={metrics.measured10StepInferenceMs}
                          unit="ms"
                          mono
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section
              id="model-limitations"
              className="border border-[#F2A93B]/45 bg-[#08101D] p-6 space-y-5"
            >
              <div className="flex items-baseline justify-between gap-2 border-b border-[#1E2F4A] pb-3">
                <h2 className="font-display text-2xl font-semibold text-[#E6EDF7]">
                  Limitations, Drift, Blur &amp; Stability Observations
                </h2>
                <span className="font-mono text-xs text-[#F2A93B]">04</span>
              </div>
              <ul className="space-y-2.5 text-sm text-[#E6EDF7]">
                {limitations.structuralLimitations.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span
                      className="font-mono text-xs text-[#F2A93B] mt-1"
                      aria-hidden="true"
                    >
                      —
                    </span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
              <dl className="divide-y divide-[#1E2F4A] border-t border-[#1E2F4A] pt-2 text-sm">
                <div className="py-3.5 grid grid-cols-1 gap-1 sm:grid-cols-12">
                  <dt className="sm:col-span-4 font-mono text-xs text-[#93A4BD]">
                    Team-documented model limitations
                  </dt>
                  <dd className="sm:col-span-8">
                    <FactValue value={limitations.teamSpecificLimitations} />
                  </dd>
                </div>
                <div className="py-3.5 grid grid-cols-1 gap-1 sm:grid-cols-12">
                  <dt className="sm:col-span-4 font-mono text-xs text-[#93A4BD]">
                    Measured drift, blur &amp; stability
                  </dt>
                  <dd className="sm:col-span-8">
                    <FactValue
                      value={limitations.driftBlurStabilityObservations}
                    />
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
