import { PROJECT_FACTS } from '../config/projectFacts';
import { FactValue } from '../components/FactValue';

const OFFLINE_COMMITMENTS = [
  'Self-hosted typography (Fraunces, IBM Plex Sans, IBM Plex Mono via Fontsource).',
  'Zero CDN requests, zero Google Fonts network calls, zero external map tile servers, zero political border libraries.',
  'Zero analytics, trackers, or third-party scripts.',
  'Only runtime network requests go to the explicitly configured climate backend.',
] as const;

const INTEGRITY_COMMITMENTS = [
  'Zero AI/LLM API calls and zero client-side secret keys.',
  'Initial-condition files remain strictly in browser memory until explicitly sent to your configured backend.',
  'Request payloads and simulation tensors are never logged to the browser console or persisted in storage.',
  'Returned physical tensors are validated strictly with Zod and never silently clipped or fabricated.',
] as const;

export function AboutPage() {
  return (
    <div className="workstation-canvas">
      <div className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 lg:px-8 space-y-12">
        {/* Institutional Colophon Masthead */}
        <header className="border-b border-[#1E2F4A] pb-8 space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#5CC8E0]">
            Project Colophon · Offline-First Scientific Architecture
          </p>
          <h1 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight text-[#E6EDF7]">
            About {PROJECT_FACTS.projectTitle}
          </h1>
          <p className="text-base text-[#93A4BD] max-w-3xl leading-relaxed">
            {PROJECT_FACTS.projectTitle} ({PROJECT_FACTS.projectSubtitle}) is a
            standalone, offline-first frontend designed to live inside the{' '}
            <code className="font-mono text-[#BFE6F2]">dashboard/</code>{' '}
            directory of the climate-model repository and communicate strictly
            with the FastAPI forecasting backend.
          </p>
        </header>

        {/* Asymmetric 2-Column Institutional Spread */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Left 5 cols: Team & Attribution Ledger */}
          <section
            aria-labelledby="about-provenance-heading"
            className="lg:col-span-5 space-y-4"
          >
            <h2
              id="about-provenance-heading"
              className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[#5CC8E0]"
            >
              Team, Repository &amp; Attribution
            </h2>
            <dl className="divide-y divide-[#1E2F4A] border-y border-[#1E2F4A] text-sm">
              <div className="py-3.5 space-y-1">
                <dt className="font-mono text-[11px] uppercase tracking-wider text-[#93A4BD]">
                  Team name
                </dt>
                <dd>
                  <FactValue value={PROJECT_FACTS.teamName} />
                </dd>
              </div>
              <div className="py-3.5 space-y-1">
                <dt className="font-mono text-[11px] uppercase tracking-wider text-[#93A4BD]">
                  Repository URL
                </dt>
                <dd>
                  <FactValue value={PROJECT_FACTS.repositoryUrl} mono />
                </dd>
              </div>
              <div className="py-3.5 space-y-1">
                <dt className="font-mono text-[11px] uppercase tracking-wider text-[#93A4BD]">
                  Dataset attribution
                </dt>
                <dd>
                  <FactValue value={PROJECT_FACTS.datasetAttribution} />
                </dd>
              </div>
              <div className="py-3.5 space-y-1">
                <dt className="font-mono text-[11px] uppercase tracking-wider text-[#93A4BD]">
                  Licence
                </dt>
                <dd>
                  <FactValue value={PROJECT_FACTS.licence} />
                </dd>
              </div>
            </dl>
          </section>

          {/* Right 7 cols: Offline-First & Scientific Integrity Manifesto */}
          <div className="lg:col-span-7 space-y-10">
            <section
              aria-labelledby="about-offline-heading"
              className="border-t border-[#1E2F4A] pt-5 space-y-4"
            >
              <h2
                id="about-offline-heading"
                className="font-display text-2xl font-semibold text-[#E6EDF7]"
              >
                Offline-First Commitments
              </h2>
              <ol className="divide-y divide-[#1E2F4A] border-y border-[#1E2F4A]">
                {OFFLINE_COMMITMENTS.map((item, idx) => (
                  <li
                    key={item}
                    className="py-3 flex items-baseline gap-4 text-sm text-[#93A4BD] leading-relaxed"
                  >
                    <span className="font-mono text-xs text-[#5CC8E0] shrink-0">
                      0{idx + 1}
                    </span>
                    <span className="text-[#E6EDF7]">{item}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section
              aria-labelledby="about-integrity-heading"
              className="border-t border-[#1E2F4A] pt-5 space-y-4"
            >
              <h2
                id="about-integrity-heading"
                className="font-display text-2xl font-semibold text-[#E6EDF7]"
              >
                Security &amp; Scientific Integrity
              </h2>
              <ol className="divide-y divide-[#1E2F4A] border-y border-[#1E2F4A]">
                {INTEGRITY_COMMITMENTS.map((item, idx) => (
                  <li
                    key={item}
                    className="py-3 flex items-baseline gap-4 text-sm text-[#93A4BD] leading-relaxed"
                  >
                    <span className="font-mono text-xs text-[#5CC8E0] shrink-0">
                      0{idx + 5}
                    </span>
                    <span className="text-[#E6EDF7]">{item}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
