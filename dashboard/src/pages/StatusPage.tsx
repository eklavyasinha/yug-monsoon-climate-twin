import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Play,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { checkHealth, simulate } from '../api/client';
import { ApiClientError, getApiErrorTitle } from '../api/errors';
import { CHANNELS } from '../config/projectFacts';
import { useAppData } from '../context/AppDataContext';
import { IcFileDropzone } from '../components/IcFileDropzone';
import { WorkflowGuideStrip } from '../components/WorkflowGuideStrip';
import { kelvinToCelsius, pascalsToHpa } from '../utils/units';
import { validateHttpOrHttpsUrl } from '../utils/urlValidation';

const ENVIRONMENT_ROWS = [
  {
    context: 'AI Studio Preview',
    browserOrigin: 'Cloud preview HTTPS origin',
    canReachLocalhost8000: 'No — cannot reach your Mac/PC localhost',
    notes:
      'Use AI Studio Preview to inspect the UI, validate local mom-ic-v1 files in browser memory, and test against a public HTTPS backend if you explicitly configure one.',
  },
  {
    context: 'Local Frontend Run',
    browserOrigin: 'http://localhost:3000 (Vite dev) or :4173 (preview)',
    canReachLocalhost8000: 'Yes — via same-origin /api Vite proxy',
    notes:
      'Browser fetches /api/health and /api/simulate on the same origin; Vite forwards to VITE_API_PROXY_TARGET (default http://localhost:8000) and strips /api.',
  },
  {
    context: 'Local Backend',
    browserOrigin: 'python serve.py --port 8000 (FastAPI on 0.0.0.0:8000)',
    canReachLocalhost8000: 'Local process (no CORSMiddleware in serve.py)',
    notes:
      'Direct browser requests from another port to http://localhost:8000 will be blocked by CORS unless routed through the Vite /api proxy or CORS is configured.',
  },
  {
    context: 'Future Frontend Deployment',
    browserOrigin: 'Static build (dist/) on web server / CDN',
    canReachLocalhost8000: 'No Vite proxy at runtime',
    notes:
      'Requires either a reverse proxy forwarding /api to the backend on the same origin, or setting VITE_API_BASE_URL to an HTTPS backend with CORS enabled.',
  },
  {
    context: 'Future Backend Deployment',
    browserOrigin: 'Dedicated CPU host / container serving FastAPI',
    canReachLocalhost8000: 'Public HTTPS URL or reverse-proxied internal host',
    notes:
      'Must serve POST /health and POST /simulate with finite physical-unit JSON lists, under 5.0 s wall time for 10 steps, and appropriate CORS headers if cross-origin.',
  },
] as const;

export function StatusPage() {
  const {
    apiConfig,
    setApiBaseUrlOverride,
    loadedIc,
    lastHealth,
    setLastHealth,
    lastContractTest,
    setLastContractTest,
  } = useAppData();

  const [overrideInput, setOverrideInput] = useState(
    apiConfig.overrideBaseUrl ?? '',
  );
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [overrideNotice, setOverrideNotice] = useState<string | null>(null);

  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<ApiClientError | null>(null);
  const healthAbortRef = useRef<AbortController | null>(null);

  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState<ApiClientError | null>(null);
  const testAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      healthAbortRef.current?.abort();
      testAbortRef.current?.abort();
    };
  }, []);

  const handleSaveOverride = (event: FormEvent) => {
    event.preventDefault();
    setOverrideError(null);
    setOverrideNotice(null);

    const trimmed = overrideInput.trim();
    if (!trimmed) {
      setApiBaseUrlOverride(null);
      setOverrideNotice('Cleared override. Reverted to default /api.');
      setLastHealth(null);
      setLastContractTest(null);
      return;
    }

    const validation = validateHttpOrHttpsUrl(trimmed);
    if (!validation.valid || !validation.normalized) {
      setOverrideError(validation.error);
      return;
    }

    setApiBaseUrlOverride(validation.normalized);
    setOverrideInput(validation.normalized);
    setOverrideNotice(`Saved override: ${validation.normalized}`);
    setLastHealth(null);
    setLastContractTest(null);
  };

  const handleResetOverride = () => {
    setApiBaseUrlOverride(null);
    setOverrideInput('');
    setOverrideError(null);
    setOverrideNotice(
      `Reset to environment default (${apiConfig.defaultBaseUrl}).`,
    );
    setLastHealth(null);
    setLastContractTest(null);
  };

  const handleCheckHealth = async () => {
    healthAbortRef.current?.abort();
    const controller = new AbortController();
    healthAbortRef.current = controller;

    setHealthLoading(true);
    setHealthError(null);

    try {
      const result = await checkHealth({
        baseUrl: apiConfig.activeBaseUrl,
        method: apiConfig.healthMethod,
        timeoutMs: apiConfig.timeoutMs,
        signal: controller.signal,
      });
      setLastHealth(result);
    } catch (err) {
      setLastHealth(null);
      setHealthError(
        err instanceof ApiClientError
          ? err
          : new ApiClientError({
              kind: 'backend_unreachable',
              message:
                err instanceof Error
                  ? err.message
                  : 'Unexpected health check failure',
            }),
      );
    } finally {
      setHealthLoading(false);
      if (healthAbortRef.current === controller) {
        healthAbortRef.current = null;
      }
    }
  };

  const handleCancelHealth = () => {
    healthAbortRef.current?.abort();
  };

  const handleRunContractTest = async () => {
    if (!loadedIc) return;

    testAbortRef.current?.abort();
    const controller = new AbortController();
    testAbortRef.current = controller;

    setTestLoading(true);
    setTestError(null);

    try {
      const result = await simulate(
        {
          init_states: loadedIc.data.init_states,
          doy_sincos: loadedIc.data.doy_sincos,
          steps: 1,
          perturbation: null,
        },
        {
          baseUrl: apiConfig.activeBaseUrl,
          timeoutMs: apiConfig.timeoutMs,
          signal: controller.signal,
        },
      );
      setLastContractTest(result);
    } catch (err) {
      setLastContractTest(null);
      setTestError(
        err instanceof ApiClientError
          ? err
          : new ApiClientError({
              kind: 'backend_unreachable',
              message:
                err instanceof Error
                  ? err.message
                  : 'Unexpected contract test failure',
            }),
      );
    } finally {
      setTestLoading(false);
      if (testAbortRef.current === controller) {
        testAbortRef.current = null;
      }
    }
  };

  const handleCancelContractTest = () => {
    testAbortRef.current?.abort();
  };

  const readyToProceed = Boolean(
    loadedIc && !loadedIc.isSyntheticFixture && lastHealth?.ready,
  );

  return (
    <div className="workstation-canvas">
      <WorkflowGuideStrip currentRoute="/status" />

      {/* Compact Diagnostic Console Masthead */}
      <header className="border-b border-[#1E2F4A] bg-[#08101D]">
        <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#5CC8E0]">
              Backend Diagnostics · Round 1 Wire Contract Probe
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#E6EDF7]">
              Backend Status &amp; Contract Test
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-[#93A4BD] max-w-2xl">
            Configure the FastAPI endpoint, probe{' '}
            <code className="font-mono text-[#BFE6F2]">POST /health</code>,
            validate a local{' '}
            <code className="font-mono text-[#BFE6F2]">mom-ic-v1</code> file,
            and run a strict 1-step{' '}
            <code className="font-mono text-[#BFE6F2]">POST /simulate</code>{' '}
            verification.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {readyToProceed && (
          <div
            role="status"
            className="border border-[#5FC9A0]/55 bg-[#0E1829] px-5 py-3.5 flex flex-wrap items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3 text-sm text-[#E6EDF7]">
              <CheckCircle2
                className="h-4 w-4 text-[#5FC9A0] shrink-0"
                aria-hidden="true"
              />
              <span>
                Backend verified and{' '}
                <code className="font-mono text-[#BFE6F2]">mom-ic-v1</code>{' '}
                loaded. Ready to run 10-day forecasts and experiments.
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/twin"
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xs bg-[#5CC8E0] px-4 py-1.5 text-xs font-semibold text-[#08101D] hover:bg-[#BFE6F2] transition-colors whitespace-nowrap"
              >
                <span>Open Climate Twin</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <Link
                to="/lab"
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xs border border-[#2B4264] bg-[#060B14] px-3.5 py-1.5 text-xs font-mono text-[#E6EDF7] hover:border-[#5CC8E0] transition-colors whitespace-nowrap"
              >
                <span>Open Lab</span>
              </Link>
            </div>
          </div>
        )}

        {/* PRIMARY 2-PANE DIAGNOSTIC CONSOLE: Left 5 cols Endpoint & Health | Right 7 cols IC Loader & 1-Step Wire Probe */}
        <div className="grid grid-cols-1 lg:grid-cols-12 border border-[#1E2F4A] bg-[#08101D] divide-y lg:divide-y-0 lg:divide-x divide-[#1E2F4A]">
          {/* Left 5 cols: Endpoint Config + Live Health Probe */}
          <div className="lg:col-span-5 divide-y divide-[#1E2F4A]">
            <section
              aria-labelledby="api-config-heading"
              className="p-5 sm:p-6 space-y-4"
            >
              <div className="space-y-1">
                <h2
                  id="api-config-heading"
                  className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]"
                >
                  01 · Endpoint &amp; Proxy Configuration
                </h2>
                <p className="text-xs text-[#93A4BD]">
                  Only non-secret base URLs (HTTP or HTTPS) are stored locally
                  in browser preferences.
                </p>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 border border-[#1E2F4A] bg-[#1E2F4A] gap-px font-mono text-xs tabular-nums">
                <div className="bg-[#060B14] p-3 space-y-0.5">
                  <dt className="text-[11px] text-[#93A4BD]">
                    Active API base URL
                  </dt>
                  <dd
                    className="text-[#5CC8E0] break-all"
                    data-testid="active-api-base-url"
                  >
                    {apiConfig.activeBaseUrl}
                  </dd>
                </div>
                <div className="bg-[#060B14] p-3 space-y-0.5">
                  <dt className="text-[11px] text-[#93A4BD]">
                    Vite dev/preview proxy
                  </dt>
                  <dd className="text-[#E6EDF7] break-all">
                    {apiConfig.proxyTarget}
                  </dd>
                </div>
                <div className="bg-[#060B14] p-3 space-y-0.5">
                  <dt className="text-[11px] text-[#93A4BD]">
                    Verified health method
                  </dt>
                  <dd className="text-[#E6EDF7]">
                    {apiConfig.healthMethod} /health
                  </dd>
                </div>
                <div className="bg-[#060B14] p-3 space-y-0.5">
                  <dt className="text-[11px] text-[#93A4BD]">Default timeout</dt>
                  <dd className="text-[#E6EDF7]">
                    {(apiConfig.timeoutMs / 1000).toFixed(1)} s
                  </dd>
                </div>
              </dl>

              <form
                onSubmit={handleSaveOverride}
                className="space-y-3"
                noValidate
              >
                <div className="space-y-1.5">
                  <label
                    htmlFor="api-base-url-override"
                    className="block text-xs font-medium text-[#E6EDF7]"
                  >
                    Override API base URL (HTTP or HTTPS only)
                  </label>
                  <input
                    id="api-base-url-override"
                    type="url"
                    value={overrideInput}
                    onChange={(e) => setOverrideInput(e.target.value)}
                    placeholder="https://your-climate-backend.example"
                    className="w-full min-h-[40px] rounded-xs border border-[#1E2F4A] bg-[#060B14] px-3 py-2 font-mono text-xs text-[#E6EDF7] placeholder:text-[#93A4BD]/60 focus:border-[#5CC8E0] focus:outline-none"
                  />
                  <p className="text-[11px] text-[#93A4BD]">
                    Leave empty or click reset to use the same-origin Vite proxy
                    (<code className="font-mono text-[#BFE6F2]">/api</code>).
                  </p>
                </div>

                {overrideError && (
                  <p role="alert" className="text-xs font-mono text-[#E5646B]">
                    {overrideError}
                  </p>
                )}
                {overrideNotice && (
                  <p role="status" className="text-xs font-mono text-[#5FC9A0]">
                    {overrideNotice}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    className="inline-flex min-h-[38px] items-center rounded-xs bg-[#142238] border border-[#5CC8E0] px-3.5 py-1.5 text-xs font-mono font-medium text-[#BFE6F2] hover:bg-[#5CC8E0] hover:text-[#08101D] transition-colors duration-150 whitespace-nowrap"
                  >
                    Save URL override
                  </button>
                  <button
                    type="button"
                    onClick={handleResetOverride}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xs border border-[#1E2F4A] bg-[#060B14] px-3.5 py-1.5 text-xs font-mono text-[#93A4BD] hover:border-[#5CC8E0] hover:text-[#E6EDF7] transition-colors duration-150 whitespace-nowrap"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Reset to {apiConfig.defaultBaseUrl}</span>
                  </button>
                </div>
              </form>
            </section>

            {/* Health Probe Section */}
            <section
              aria-labelledby="health-check-heading"
              className="p-5 sm:p-6 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2
                    id="health-check-heading"
                    className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]"
                  >
                    02 · Backend Health Check
                  </h2>
                  <p className="text-xs text-[#93A4BD]">
                    Sends{' '}
                    <code className="font-mono text-[#BFE6F2]">
                      {apiConfig.healthMethod} {apiConfig.activeBaseUrl}/health
                    </code>{' '}
                    without silently switching HTTP methods.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCheckHealth}
                    disabled={healthLoading}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xs bg-[#5CC8E0] px-3.5 py-1.5 text-xs font-semibold text-[#08101D] hover:bg-[#BFE6F2] disabled:opacity-60 transition-colors duration-150 whitespace-nowrap"
                  >
                    <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {healthLoading ? 'Checking…' : 'Check backend health'}
                    </span>
                  </button>
                  {healthLoading && (
                    <button
                      type="button"
                      onClick={handleCancelHealth}
                      className="inline-flex min-h-[38px] items-center rounded-xs border border-[#E5646B] px-3 py-1.5 text-xs font-mono text-[#E5646B] hover:bg-[#E5646B]/10"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {!lastHealth && !healthError && !healthLoading && (
                <div className="border border-[#1E2F4A] bg-[#060B14] px-4 py-3 text-xs text-[#93A4BD]">
                  No health check executed yet in this session. Click{' '}
                  <strong className="text-[#E6EDF7]">
                    Check backend health
                  </strong>{' '}
                  to probe your configured server.
                </div>
              )}

              {lastHealth && (
                <div className="border border-[#5FC9A0]/45 bg-[#0E1829] p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-mono font-semibold">
                    {lastHealth.ready ? (
                      <>
                        <CheckCircle2
                          className="h-4 w-4 text-[#5FC9A0]"
                          aria-hidden="true"
                        />
                        <span className="text-[#5FC9A0]">Backend ready</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle
                          className="h-4 w-4 text-[#F2A93B]"
                          aria-hidden="true"
                        />
                        <span className="text-[#F2A93B]">
                          Backend responded, status: {lastHealth.status}
                        </span>
                      </>
                    )}
                  </div>

                  <dl className="grid grid-cols-2 gap-3 font-mono text-xs tabular-nums">
                    <div>
                      <dt className="text-[11px] text-[#93A4BD]">Status field</dt>
                      <dd className="text-[#E6EDF7]">{lastHealth.status}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[#93A4BD]">Model name</dt>
                      <dd className="text-[#E6EDF7]">
                        {lastHealth.modelName ?? 'Not returned by server'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[#93A4BD]">
                        Round-trip latency
                      </dt>
                      <dd className="text-[#E6EDF7]">
                        {lastHealth.latencyMs.toFixed(1)} ms
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[#93A4BD]">
                        Verified request
                      </dt>
                      <dd className="text-[#E6EDF7] break-all">
                        {lastHealth.methodUsed} {lastHealth.endpointUrl}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}

              {healthError && (
                <div
                  role="alert"
                  className="border border-[#E5646B] bg-[#142238] p-4 space-y-2"
                >
                  <div className="flex items-center gap-2 text-xs font-mono font-semibold text-[#E5646B]">
                    <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{getApiErrorTitle(healthError.kind)}</span>
                    {healthError.statusCode && (
                      <span>· HTTP {healthError.statusCode}</span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-[#E6EDF7]">
                    {healthError.message}
                  </p>
                  {healthError.details && healthError.details.length > 0 && (
                    <ul className="list-disc pl-5 font-mono text-xs text-[#93A4BD]">
                      {healthError.details.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="border-t border-[#1E2F4A] pt-3.5 space-y-1.5">
                <div className="flex items-center gap-2 text-[11px] font-mono text-[#BFE6F2]">
                  <ShieldCheck
                    className="h-3.5 w-3.5 text-[#5CC8E0]"
                    aria-hidden="true"
                  />
                  <span>Contract verification state (docs/API_CONTRACT.md)</span>
                </div>
                <ul className="space-y-1 text-xs text-[#93A4BD]">
                  <li>
                    <strong className="text-[#E6EDF7]">Verified:</strong>{' '}
                    <code>POST /health</code>, <code>POST /simulate</code>,
                    shape <code>[3, 6, 32, 36]</code> →{' '}
                    <code>[steps, 6, 32, 36]</code>, physical units, 6 exact
                    channels.
                  </li>
                  <li>
                    <strong className="text-[#E6EDF7]">CORS note:</strong>{' '}
                    Attached <code>serve.py</code> omits{' '}
                    <code>CORSMiddleware</code>; use Vite <code>/api</code>{' '}
                    proxy locally or configure CORS for cross-origin hosts.
                  </li>
                </ul>
              </div>
            </section>
          </div>

          {/* Right 7 cols: Initial Conditions Loader & 1-Step Wire Contract Inspector */}
          <section
            aria-labelledby="ic-contract-test-heading"
            className="lg:col-span-7 p-5 sm:p-6 space-y-5 bg-[#070E1A]"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1E2F4A] pb-4">
              <div className="space-y-1 max-w-xl">
                <h2
                  id="ic-contract-test-heading"
                  className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]"
                >
                  03 · Initial-Conditions Loader &amp; 1-Step Contract Test
                </h2>
                <p className="text-xs text-[#93A4BD] leading-relaxed">
                  Load a local{' '}
                  <code className="font-mono text-[#BFE6F2]">mom-ic-v1</code>{' '}
                  file and execute a real 1-step simulation (
                  <code className="font-mono text-[#BFE6F2]">
                    steps: 1, perturbation: null
                  </code>
                  ) to inspect wire dimensions, finite floats, and raw physical
                  units.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleRunContractTest}
                  disabled={!loadedIc || testLoading}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-xs bg-[#5CC8E0] px-4 py-2 text-xs font-semibold text-[#08101D] hover:bg-[#BFE6F2] disabled:bg-[#142238] disabled:text-[#93A4BD] disabled:border disabled:border-[#1E2F4A] disabled:cursor-not-allowed transition-colors duration-150 whitespace-nowrap"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {testLoading ? 'Running 1-step test…' : 'Run contract test'}
                  </span>
                </button>
                {testLoading && (
                  <button
                    type="button"
                    onClick={handleCancelContractTest}
                    className="inline-flex min-h-[40px] items-center rounded-xs border border-[#E5646B] px-3 py-1.5 text-xs font-mono text-[#E5646B] hover:bg-[#E5646B]/10"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            <IcFileDropzone />

            {!loadedIc && (
              <p className="text-xs font-mono text-[#93A4BD]">
                Load a valid mom-ic-v1 JSON file above to enable “Run contract
                test”.
              </p>
            )}

            {testError && (
              <div
                role="alert"
                className="border border-[#E5646B] bg-[#142238] p-4 space-y-2"
              >
                <div className="flex items-center gap-2 text-xs font-mono font-semibold text-[#E5646B]">
                  <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    Contract test failed — {getApiErrorTitle(testError.kind)}
                  </span>
                  {testError.statusCode && (
                    <span>· HTTP {testError.statusCode}</span>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-[#E6EDF7]">
                  {testError.message}
                </p>
                {testError.details && testError.details.length > 0 && (
                  <ul className="list-disc pl-5 font-mono text-xs text-[#93A4BD]">
                    {testError.details.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {lastContractTest && (
              <div
                className="border border-[#5FC9A0]/55 bg-[#08101D] divide-y divide-[#1E2F4A]"
                data-testid="contract-test-result"
              >
                <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-mono font-semibold text-[#5FC9A0]">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    <span>
                      Contract validation PASSED (1-step simulation, null
                      perturbation)
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-[#93A4BD]">
                    POST {lastContractTest.endpointUrl}
                  </span>
                </div>

                <dl className="grid grid-cols-2 lg:grid-cols-4 bg-[#1E2F4A] gap-px font-mono text-xs tabular-nums">
                  <div className="bg-[#08101D] p-3.5 space-y-0.5">
                    <dt className="text-[11px] text-[#93A4BD]">
                      Validated shape
                    </dt>
                    <dd className="text-base font-semibold text-[#E6EDF7]">
                      [{lastContractTest.diagnostics.shape.join(', ')}]
                    </dd>
                  </div>
                  <div className="bg-[#08101D] p-3.5 space-y-0.5">
                    <dt className="text-[11px] text-[#93A4BD]">
                      Reported inference_ms
                    </dt>
                    <dd className="text-base font-semibold text-[#E6EDF7]">
                      {lastContractTest.inferenceMs.toFixed(2)} ms
                    </dd>
                  </div>
                  <div className="bg-[#08101D] p-3.5 space-y-0.5">
                    <dt className="text-[11px] text-[#93A4BD]">
                      Actual round-trip
                    </dt>
                    <dd className="text-base font-semibold text-[#E6EDF7]">
                      {lastContractTest.roundTripMs.toFixed(1)} ms
                    </dd>
                  </div>
                  <div className="bg-[#08101D] p-3.5 space-y-0.5">
                    <dt className="text-[11px] text-[#93A4BD]">
                      Negative precip cells
                    </dt>
                    <dd
                      className={`text-base font-semibold ${
                        lastContractTest.diagnostics
                          .negativePrecipitationCount > 0
                          ? 'text-[#F2A93B]'
                          : 'text-[#5FC9A0]'
                      }`}
                    >
                      {lastContractTest.diagnostics.negativePrecipitationCount}
                    </dd>
                  </div>
                </dl>

                {lastContractTest.diagnostics.negativePrecipitationCount >
                  0 && (
                  <div
                    role="status"
                    className="bg-[#0E1829] px-4 py-2.5 text-xs text-[#F2A93B]"
                  >
                    Flagged{' '}
                    {lastContractTest.diagnostics.negativePrecipitationCount}{' '}
                    negative precipitation cell(s) (minimum{' '}
                    {lastContractTest.diagnostics.minPrecipitation.toFixed(4)}{' '}
                    mm/day). Values were preserved exactly as received without
                    clipping.
                  </div>
                )}

                <div className="p-4 space-y-2">
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#93A4BD]">
                    First cell [step=0, lat_idx=0, lon_idx=0] exactly as received
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono text-xs tabular-nums border-collapse">
                      <thead>
                        <tr className="border-b border-[#1E2F4A] text-[#93A4BD]">
                          <th className="py-2 pr-4 font-medium">Idx</th>
                          <th className="py-2 pr-4 font-medium">Channel</th>
                          <th className="py-2 pr-4 font-medium">
                            Raw wire value
                          </th>
                          <th className="py-2 pr-4 font-medium">Wire unit</th>
                          <th className="py-2 font-medium">
                            Derived conversion
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1E2F4A]/70">
                        {CHANNELS.map((ch) => {
                          const raw =
                            lastContractTest.diagnostics.firstStepFirstCell[
                              ch.index
                            ];
                          let derived = '—';
                          if (ch.key === 't2m') {
                            derived = `${kelvinToCelsius(raw).toFixed(2)} °C`;
                          } else if (ch.key === 'msl') {
                            derived = `${pascalsToHpa(raw).toFixed(2)} hPa`;
                          }
                          return (
                            <tr key={ch.key}>
                              <td className="py-2 pr-4 text-[#93A4BD]">
                                {ch.index}
                              </td>
                              <td className="py-2 pr-4 text-[#5CC8E0]">
                                {ch.key}
                              </td>
                              <td className="py-2 pr-4 text-[#E6EDF7]">
                                {String(raw)}
                              </td>
                              <td className="py-2 pr-4 text-[#93A4BD]">
                                {ch.unit}
                              </td>
                              <td className="py-2 text-[#BFE6F2]">{derived}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Bottom Matrix: Runtime Environments + Connection Troubleshooting */}
        <section
          aria-labelledby="env-matrix-heading"
          className="instrument-plane rounded-xs divide-y divide-[#1E2F4A]"
        >
          <div className="px-5 py-3.5 bg-[#08101D] flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id="env-matrix-heading"
              className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]"
            >
              Runtime Environments &amp; Localhost Boundary
            </h2>
            <p className="text-xs text-[#93A4BD]">
              Cloud preview cannot reach{' '}
              <code className="font-mono text-[#BFE6F2]">localhost:8000</code>;
              run frontend locally alongside{' '}
              <code className="font-mono text-[#BFE6F2]">serve.py</code>.
            </p>
          </div>

          <div className="overflow-x-auto bg-[#08101D]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#1E2F4A] bg-[#060B14] font-mono text-[#93A4BD]">
                  <th className="px-4 py-3 font-medium">Environment</th>
                  <th className="px-4 py-3 font-medium">Origin / Process</th>
                  <th className="px-4 py-3 font-medium">
                    Localhost :8000 access
                  </th>
                  <th className="px-4 py-3 font-medium">
                    Operational behavior
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2F4A]">
                {ENVIRONMENT_ROWS.map((row) => (
                  <tr key={row.context} className="align-top">
                    <td className="px-4 py-3 font-medium text-[#E6EDF7] whitespace-nowrap">
                      {row.context}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#BFE6F2]">
                      {row.browserOrigin}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#E6EDF7]">
                      {row.canReachLocalhost8000}
                    </td>
                    <td className="px-4 py-3 leading-relaxed text-[#93A4BD]">
                      {row.notes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section
          aria-labelledby="troubleshooting-heading"
          className="instrument-plane rounded-xs divide-y divide-[#1E2F4A]"
        >
          <div className="px-5 py-3.5 bg-[#08101D]">
            <h2
              id="troubleshooting-heading"
              className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]"
            >
              Connection Troubleshooting
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 bg-[#1E2F4A] gap-px text-xs">
            <div className="bg-[#08101D] p-5 space-y-1.5">
              <h3 className="font-mono font-semibold text-[#E6EDF7]">
                Backend unreachable / Proxy 502
              </h3>
              <p className="leading-relaxed text-[#93A4BD]">
                Confirm{' '}
                <code className="font-mono text-[#BFE6F2]">
                  python serve.py --port 8000
                </code>{' '}
                is running on your local machine and that{' '}
                <code className="font-mono text-[#BFE6F2]">
                  VITE_API_PROXY_TARGET
                </code>{' '}
                matches the port.
              </p>
            </div>
            <div className="bg-[#08101D] p-5 space-y-1.5">
              <h3 className="font-mono font-semibold text-[#E6EDF7]">
                Network or CORS-blocked request
              </h3>
              <p className="leading-relaxed text-[#93A4BD]">
                The attached{' '}
                <code className="font-mono text-[#BFE6F2]">serve.py</code> does
                not enable FastAPI{' '}
                <code className="font-mono text-[#BFE6F2]">CORSMiddleware</code>
                . When running locally, use the default{' '}
                <code className="font-mono text-[#BFE6F2]">/api</code> proxy
                rather than entering{' '}
                <code className="font-mono text-[#BFE6F2]">
                  http://localhost:8000
                </code>{' '}
                directly.
              </p>
            </div>
            <div className="bg-[#08101D] p-5 space-y-1.5">
              <h3 className="font-mono font-semibold text-[#E6EDF7]">
                HTTP 405 Method Not Allowed on /health
              </h3>
              <p className="leading-relaxed text-[#93A4BD]">
                Round 1 contract specifies{' '}
                <code className="font-mono text-[#BFE6F2]">POST /health</code>.
                If a custom server uses GET, explicitly configure{' '}
                <code className="font-mono text-[#BFE6F2]">
                  VITE_HEALTH_METHOD=GET
                </code>
                ; this client never switches HTTP verbs silently.
              </p>
            </div>
            <div className="bg-[#08101D] p-5 space-y-1.5">
              <h3 className="font-mono font-semibold text-[#E6EDF7]">
                Schema mismatch or invalid JSON
              </h3>
              <p className="leading-relaxed text-[#93A4BD]">
                Verify your server returns plain nested JSON float arrays (never{' '}
                <code className="font-mono text-[#BFE6F2]">NaN</code> or{' '}
                <code className="font-mono text-[#BFE6F2]">Infinity</code>) with
                exact shape{' '}
                <code className="font-mono text-[#BFE6F2]">
                  [steps, 6, 32, 36]
                </code>{' '}
                and a finite{' '}
                <code className="font-mono text-[#BFE6F2]">inference_ms</code>.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
