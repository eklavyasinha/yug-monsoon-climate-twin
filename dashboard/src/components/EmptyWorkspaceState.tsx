import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, FileJson, Server } from 'lucide-react';
import { useAppData } from '../context/AppDataContext';

interface EmptyWorkspaceStateProps {
  title: string;
  subtitle: string;
  phaseNote: string;
  plannedCapabilities: readonly string[];
}

export function EmptyWorkspaceState({
  title,
  subtitle,
  phaseNote,
  plannedCapabilities,
}: EmptyWorkspaceStateProps) {
  const { apiConfig, loadedIc, lastHealth } = useAppData();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <header className="space-y-3 border-b border-[#1E2F4A] pb-6">
        <p className="font-mono text-xs text-[#5CC8E0]">
          Workspace empty state · No fabricated forecast displayed
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#E6EDF7]">
          {title}
        </h1>
        <p className="text-base text-[#93A4BD] max-w-2xl leading-relaxed">
          {subtitle}
        </p>
      </header>

      <section
        aria-label="Prerequisites to run simulations"
        className="mt-8 rounded-xs border border-[#1E2F4A] bg-[#08101D] p-6 space-y-6"
      >
        <div className="space-y-2">
          <h2 className="font-display text-xl font-semibold text-[#E6EDF7]">
            Connected backend and validated initial conditions required
          </h2>
          <p className="text-sm text-[#93A4BD] leading-relaxed">
            This workspace never renders synthetic or placeholder climate forecasts.
            To inspect real rollouts, connect a running Round 1 FastAPI climate backend
            and load a local <code className="text-[#BFE6F2]">mom-ic-v1</code> initial-conditions
            file on the Status page.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xs border border-[#1E2F4A] bg-[#060B14] p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-[#E6EDF7]">
              <Server className="h-4 w-4 text-[#5CC8E0] shrink-0" aria-hidden="true" />
              <span>1. Climate backend connection</span>
            </div>
            <p className="font-mono text-xs text-[#93A4BD] break-all">
              Configured URL: <span className="text-[#E6EDF7]">{apiConfig.activeBaseUrl}</span>
            </p>
            <p className="font-mono text-xs">
              {lastHealth?.ready ? (
                <span className="text-[#5FC9A0]">
                  ● Ready ({lastHealth.modelName ?? 'model name omitted'})
                </span>
              ) : (
                <span className="text-[#93A4BD]">
                  Not yet verified in this session
                </span>
              )}
            </p>
          </div>

          <div className="rounded-xs border border-[#1E2F4A] bg-[#060B14] p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-[#E6EDF7]">
              <FileJson className="h-4 w-4 text-[#5CC8E0] shrink-0" aria-hidden="true" />
              <span>2. Local initial-conditions file</span>
            </div>
            {loadedIc ? (
              <div className="space-y-1 font-mono text-xs">
                <p className="text-[#5FC9A0] flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Loaded: {loadedIc.summary.label}</span>
                </p>
                <p className="text-[#93A4BD]">
                  {loadedIc.summary.fileName} · shape [3, 6, 32, 36]
                </p>
              </div>
            ) : (
              <p className="font-mono text-xs text-[#93A4BD]">
                No mom-ic-v1 file loaded in browser memory
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <Link
            to="/status"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xs bg-[#5CC8E0] px-5 py-2.5 text-sm font-semibold text-[#08101D] hover:bg-[#BFE6F2] transition-colors duration-200 whitespace-nowrap"
          >
            <span>Open Backend Status &amp; IC Loader</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            to="/method"
            className="inline-flex min-h-[44px] items-center rounded-xs border border-[#1E2F4A] bg-[#060B14] px-4 py-2.5 text-sm font-medium text-[#E6EDF7] hover:border-[#5CC8E0] transition-colors duration-200 whitespace-nowrap"
          >
            Review API contract
          </Link>
        </div>
      </section>

      <section
        aria-label="Planned workspace scope"
        className="mt-8 rounded-xs border border-[#1E2F4A] bg-[#08101D] p-6 space-y-3"
      >
        <h2 className="font-display text-lg font-semibold text-[#E6EDF7]">
          Implementation status
        </h2>
        <p className="text-sm text-[#93A4BD] leading-relaxed">{phaseNote}</p>
        <ul className="space-y-2 pt-1 text-sm text-[#E6EDF7]">
          {plannedCapabilities.map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <span className="font-mono text-xs text-[#5CC8E0] mt-1" aria-hidden="true">
                —
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
