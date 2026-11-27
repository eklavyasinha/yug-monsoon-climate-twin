import {
  DEFAULT_API_TIMEOUT_MS,
  getApiRuntimeConfig,
  type HealthHttpMethod,
} from './config';
import {
  createSimulateResponseSchema,
  healthResponseSchema,
  inspectRollout,
  simulateRequestSchema,
  type HealthResponse,
  type RolloutDiagnostics,
  type SimulateRequestPayload,
  type SimulateResponsePayload,
} from './contractSchemas';
import { ApiClientError, classifyFetchError } from './errors';
import { parseJsonSafely } from '../utils/safeJson';
import { validateApiBaseUrl } from '../utils/urlValidation';

function sanitizeErrorDetail(raw: string): string | undefined {
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return undefined;
  return cleaned.length > 160 ? `${cleaned.slice(0, 157)}...` : cleaned;
}

export interface RequestOptions {
  baseUrl?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface HealthCheckOptions extends RequestOptions {
  method?: HealthHttpMethod;
}

export interface HealthCheckResult {
  ready: boolean;
  status: string;
  modelName: string | null;
  latencyMs: number;
  methodUsed: HealthHttpMethod;
  endpointUrl: string;
  raw: HealthResponse;
}

export interface SimulateResult {
  rollout: number[][][][];
  inferenceMs: number;
  roundTripMs: number;
  endpointUrl: string;
  diagnostics: RolloutDiagnostics;
}

function buildEndpointUrl(baseUrl: string, path: string): string {
  const check = validateApiBaseUrl(baseUrl);
  if (!check.valid || !check.normalized) {
    throw new ApiClientError({
      kind: 'schema_mismatch',
      message: check.error ?? 'Invalid API base URL configuration.',
    });
  }
  const cleanBase = check.normalized === '/' ? '' : check.normalized;
  return `${cleanBase}${path}`;
}

function detectCrossOrigin(targetUrl: string): boolean {
  if (targetUrl.startsWith('/')) {
    return false;
  }
  try {
    if (typeof window === 'undefined' || !window.location?.origin) {
      return false;
    }
    const parsed = new URL(targetUrl, window.location.origin);
    return parsed.origin !== window.location.origin;
  } catch {
    return false;
  }
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
  fetchImpl: typeof fetch,
): Promise<{ json: unknown; roundTripMs: number; status: number }> {
  const controller = new AbortController();
  let didTimeout = false;
  let wasCallerAborted = Boolean(callerSignal?.aborted);

  const onCallerAbort = () => {
    wasCallerAborted = true;
    controller.abort();
  };

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
  }

  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  const start = performance.now();

  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
    const roundTripMs = performance.now() - start;

    const rawText = await response.text();

    if (!response.ok) {
      let detailSnippet: string | undefined;
      try {
        const parsedErr = parseJsonSafely(rawText) as { detail?: unknown } | null;
        if (parsedErr && typeof parsedErr === 'object' && typeof parsedErr.detail === 'string') {
          detailSnippet = sanitizeErrorDetail(parsedErr.detail);
        }
      } catch {
        // Never surface raw non-JSON response bodies, HTML error pages, or stack traces.
      }

      // 502/503/504 from the local Vite proxy when the backend is not listening.
      if (
        (response.status === 502 || response.status === 503 || response.status === 504) &&
        !detectCrossOrigin(url) &&
        (!detailSnippet || /ECONNREFUSED|proxy|Bad Gateway/i.test(rawText))
      ) {
        throw new ApiClientError({
          kind: 'backend_unreachable',
          statusCode: response.status,
          message:
            `Local proxy returned HTTP ${response.status} while forwarding to the climate backend. Ensure \`python serve.py --port 8000\` is running.`,
          details: detailSnippet ? [detailSnippet] : undefined,
        });
      }

      throw new ApiClientError({
        kind: 'http_error',
        statusCode: response.status,
        message: `Backend returned HTTP ${response.status} ${response.statusText || ''}`.trim(),
        details: detailSnippet ? [detailSnippet] : undefined,
      });
    }

    let parsedJson: unknown;
    try {
      parsedJson = parseJsonSafely(rawText);
    } catch {
      throw new ApiClientError({
        kind: 'invalid_json',
        statusCode: response.status,
        message: 'Backend returned a non-JSON body or invalid JSON syntax (e.g. NaN/Infinity tokens).',
      });
    }

    return { json: parsedJson, roundTripMs, status: response.status };
  } catch (err) {
    if (err instanceof ApiClientError) {
      throw err;
    }
    throw classifyFetchError(err, {
      targetUrl: url,
      isCrossOrigin: detectCrossOrigin(url),
      didTimeout,
      wasCallerAborted,
      timeoutMs,
    });
  } finally {
    clearTimeout(timer);
    if (callerSignal) {
      callerSignal.removeEventListener('abort', onCallerAbort);
    }
  }
}

/**
 * Calls the verified health endpoint (`POST /health` by contract default).
 * Never switches HTTP method silently.
 * Retries are intentionally disabled because the user triggers explicit checks on `/status`
 * and silent retries can mask connection or method mismatches.
 */
export async function checkHealth(
  options: HealthCheckOptions = {},
): Promise<HealthCheckResult> {
  const runtime = getApiRuntimeConfig(options.baseUrl);
  const method = options.method ?? runtime.healthMethod;
  const timeoutMs = options.timeoutMs ?? runtime.timeoutMs ?? DEFAULT_API_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const endpointUrl = buildEndpointUrl(runtime.activeBaseUrl, '/health');

  const { json, roundTripMs } = await fetchJsonWithTimeout(
    endpointUrl,
    {
      method,
      headers: {
        Accept: 'application/json',
      },
    },
    timeoutMs,
    options.signal,
    fetchImpl,
  );

  const parsed = healthResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiClientError({
      kind: 'schema_mismatch',
      message: 'Health response did not match the expected contract (`{ "status": "ready", "model_name": "..." }`).',
      details: parsed.error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`),
    });
  }

  return {
    ready: parsed.data.status === 'ready',
    status: parsed.data.status,
    modelName: parsed.data.model_name ?? null,
    latencyMs: roundTripMs,
    methodUsed: method,
    endpointUrl,
    raw: parsed.data,
  };
}

/**
 * Sends a strictly contract-checked `POST /simulate` request.
 * - Never sends undocumented fields.
 * - Never logs `init_states`, `perturbation`, or response payloads.
 * - Never clips, repairs, or silently alters returned values.
 * - No automatic retries: per docs/API_CONTRACT.md, `/simulate` calls are run once without hidden retries.
 */
export async function simulate(
  payload: SimulateRequestPayload,
  options: RequestOptions = {},
): Promise<SimulateResult> {
  // Construct an explicit contract-only object so undocumented keys are never transmitted.
  const strictPayload: SimulateRequestPayload = {
    init_states: payload.init_states,
    doy_sincos: payload.doy_sincos,
    steps: payload.steps,
    perturbation: payload.perturbation,
  };

  const requestCheck = simulateRequestSchema.safeParse(strictPayload);
  if (!requestCheck.success) {
    throw new ApiClientError({
      kind: 'schema_mismatch',
      message: 'Simulation request failed client-side contract validation before transmission.',
      details: requestCheck.error.issues.slice(0, 8).map(
        (i) => `${i.path.join('.') || 'root'}: ${i.message}`,
      ),
    });
  }

  const runtime = getApiRuntimeConfig(options.baseUrl);
  const timeoutMs = options.timeoutMs ?? runtime.timeoutMs ?? DEFAULT_API_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const endpointUrl = buildEndpointUrl(runtime.activeBaseUrl, '/simulate');

  const { json, roundTripMs } = await fetchJsonWithTimeout(
    endpointUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(requestCheck.data),
    },
    timeoutMs,
    options.signal,
    fetchImpl,
  );

  const responseSchema = createSimulateResponseSchema(requestCheck.data.steps);
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiClientError({
      kind: 'schema_mismatch',
      message: `Simulation response failed contract validation for expected shape [${requestCheck.data.steps}, 6, 32, 36] and finite inference_ms.`,
      details: parsed.error.issues.slice(0, 8).map(
        (i) => `${i.path.join('.') || 'root'}: ${i.message}`,
      ),
    });
  }

  const data: SimulateResponsePayload = parsed.data;
  const diagnostics = inspectRollout(data.rollout);

  return {
    rollout: data.rollout,
    inferenceMs: data.inference_ms,
    roundTripMs,
    endpointUrl,
    diagnostics,
  };
}
