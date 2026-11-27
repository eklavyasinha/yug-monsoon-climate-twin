import { Link } from 'react-router-dom';
import { useAppData } from '../context/AppDataContext';

interface WorkflowGuideStripProps {
  currentRoute: '/status' | '/twin' | '/lab' | '/impact';
}

interface StepItem {
  num: string;
  label: string;
  to: '/status' | '/twin' | '/lab' | '/impact';
  statusText: string;
  complete: boolean;
}

/**
 * Compact single-row horizontal telemetry ribbon placed flush at the top of
 * operational workspaces. Reclaims vertical viewport space so climate maps
 * sit prominently above the fold while honestly tracking session readiness.
 */
export function WorkflowGuideStrip({ currentRoute }: WorkflowGuideStripProps) {
  const { loadedIc, lastHealth, baselineRun, scenarioRun } = useAppData();

  const hasRealIc = Boolean(loadedIc && !loadedIc.isSyntheticFixture);
  const hasRealBaseline = Boolean(
    baselineRun && !baselineRun.isSyntheticFixture,
  );
  const hasRealScenario = Boolean(
    scenarioRun && !scenarioRun.isSyntheticFixture,
  );
  const backendReady = Boolean(lastHealth?.ready);

  const steps: readonly StepItem[] = [
    {
      num: '01',
      label: 'Initial State',
      to: '/status',
      statusText: hasRealIc
        ? 'Loaded'
        : loadedIc?.isSyntheticFixture
          ? 'Fixture'
          : 'Unloaded',
      complete: hasRealIc,
    },
    {
      num: '02',
      label: 'Backend',
      to: '/status',
      statusText: backendReady
        ? 'Ready'
        : lastHealth
          ? lastHealth.status
          : 'Unverified',
      complete: backendReady,
    },
    {
      num: '03',
      label: 'Twin',
      to: '/twin',
      statusText: hasRealBaseline ? `${baselineRun!.steps}d run` : 'Awaiting',
      complete: hasRealBaseline,
    },
    {
      num: '04',
      label: 'Lab',
      to: '/lab',
      statusText: hasRealScenario ? 'Active' : 'Idle',
      complete: hasRealScenario,
    },
    {
      num: '05',
      label: 'Impact',
      to: '/impact',
      statusText: hasRealBaseline ? 'Active' : 'Needs run',
      complete: hasRealBaseline,
    },
  ];

  const completedCount = steps.filter((s) => s.complete).length;
  const progressPct = Math.round((completedCount / steps.length) * 100);

  let nextHint = 'Explore rainfall and heat threshold metrics on Impact Lens.';
  if (!hasRealIc && !backendReady) {
    nextHint = 'Next: Verify backend health and load mom-ic-v1 on /status.';
  } else if (!hasRealIc) {
    nextHint = 'Next: Load a validated mom-ic-v1 initial-conditions file.';
  } else if (!hasRealBaseline) {
    nextHint = 'Next: Execute a 10-day baseline forecast in Climate Twin.';
  } else if (!hasRealScenario) {
    nextHint =
      'Baseline active. Inspect fields or launch a shock in Experiment Lab.';
  }

  return (
    <nav
      aria-label="Session workflow progress"
      className="border-b border-[#1E2F4A] bg-[#08101D]"
    >
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 sm:px-6 lg:px-8">
        <ol className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums">
          {steps.map((step, idx) => {
            const isCurrent =
              step.to === currentRoute &&
              (step.num !== '02' || currentRoute === '/status');
            return (
              <li key={step.num} className="inline-flex items-center gap-4">
                <Link
                  to={step.to}
                  className={`inline-flex items-center gap-1.5 py-1 transition-colors whitespace-nowrap ${
                    isCurrent
                      ? 'text-[#E6EDF7] font-medium'
                      : 'text-[#93A4BD] hover:text-[#E6EDF7]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={
                      step.complete
                        ? 'text-[#5FC9A0]'
                        : isCurrent
                          ? 'text-[#5CC8E0]'
                          : 'text-[#93A4BD]/50'
                    }
                  >
                    {step.complete ? '●' : '○'}
                  </span>
                  <span className="text-[#93A4BD]">{step.num}</span>
                  <span>{step.label}</span>
                  <span
                    className={
                      step.complete
                        ? 'text-[#5FC9A0]'
                        : isCurrent
                          ? 'text-[#5CC8E0]'
                          : 'text-[#93A4BD]/80'
                    }
                  >
                    ({step.statusText})
                  </span>
                </Link>
                {idx < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="hidden sm:inline text-[#1E2F4A]"
                  >
                    /
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums">
          <span className="hidden xl:inline text-[#93A4BD]">{nextHint}</span>
          <span className="text-[#5CC8E0] whitespace-nowrap">
            {completedCount}/{steps.length} ready
          </span>
        </div>
      </div>

      {/* 2px precision session readiness rail */}
      <div className="h-[2px] w-full bg-[#0E1829]" aria-hidden="true">
        <div
          className="h-full bg-[#5CC8E0] transition-all duration-300 ease-out"
          style={{ width: `${Math.max(2, progressPct)}%` }}
        />
      </div>
    </nav>
  );
}
