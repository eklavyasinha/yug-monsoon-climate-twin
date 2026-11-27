import { describe, expect, it, vi } from 'vitest';
import { checkHealth, simulate } from '../api/client';
import { ApiClientError } from '../api/errors';
import { buildValidMomIc } from './fixtures';

function makeRollout(steps: number, tpOverride = 3.5): number[][][][] {
  const defaults = [299.15, tpOverride, 4.5, 1.8, 100820, 44.2];
  return Array.from({ length: steps }, () =>
    Array.from({ length: 6 }, (_, c) =>
      Array.from({ length: 32 }, () =>
        Array.from({ length: 36 }, () => defaults[c]),
      ),
    ),
  );
}

describe('Contract-checked API client', () => {
  it('calls POST /health by default and parses ready status + model_name', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ready',
          model_name: 'WeatherNet-Rollout-Baseline',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await checkHealth({
      baseUrl: '/api',
      fetchImpl: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('/api/health');
    expect(calledInit?.method).toBe('POST');
    expect(result.ready).toBe(true);
    expect(result.modelName).toBe('WeatherNet-Rollout-Baseline');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('calls POST /simulate with exact contract fields only and preserves returned values without clipping', async () => {
    const ic = buildValidMomIc();
    const rollout = makeRollout(1, -0.025);

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          rollout,
          inference_ms: 412.5,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const payloadWithExtra = {
      init_states: ic.init_states,
      doy_sincos: ic.doy_sincos,
      steps: 1,
      perturbation: null,
      undocumented_extra: 'must-not-be-sent',
    };

    const result = await simulate(
      payloadWithExtra as Parameters<typeof simulate>[0],
      {
        baseUrl: '/api',
        fetchImpl: fetchMock,
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('/api/simulate');
    expect(calledInit?.method).toBe('POST');

    const sentBody = JSON.parse(String(calledInit?.body)) as Record<string, unknown>;
    expect(Object.keys(sentBody).sort()).toEqual([
      'doy_sincos',
      'init_states',
      'perturbation',
      'steps',
    ]);

    expect(result.inferenceMs).toBe(412.5);
    expect(result.diagnostics.shape).toEqual([1, 6, 32, 36]);
    // Flag negative precipitation without altering returned tensor
    expect(result.diagnostics.negativePrecipitationCount).toBe(32 * 36);
    expect(result.rollout[0][1][0][0]).toBe(-0.025);
  });

  it('maps distinct error states: backend_unreachable, network_or_cors, timeout, http_error, invalid_json, schema_mismatch', async () => {
    // 1. backend_unreachable (same-origin /api fetch failure)
    const unreachableFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      checkHealth({ baseUrl: '/api', fetchImpl: unreachableFetch }),
    ).rejects.toMatchObject({ kind: 'backend_unreachable' });

    // 2. network_or_cors (cross-origin fetch failure)
    const corsFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      checkHealth({
        baseUrl: 'https://cross-origin.example.invalid',
        fetchImpl: corsFetch,
      }),
    ).rejects.toMatchObject({ kind: 'network_or_cors' });

    // 3. http_error (HTTP 400/500)
    const httpErrFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'steps must be between 1 and 10' }), {
        status: 400,
        statusText: 'Bad Request',
      }),
    );
    await expect(
      checkHealth({ baseUrl: '/api', fetchImpl: httpErrFetch }),
    ).rejects.toMatchObject({ kind: 'http_error', statusCode: 400 });

    // 4. invalid_json (malformed JSON / NaN token)
    const invalidJsonFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"rollout": [NaN], "inference_ms": 10}', { status: 200 }),
    );
    const ic = buildValidMomIc();
    await expect(
      simulate(
        {
          init_states: ic.init_states,
          doy_sincos: ic.doy_sincos,
          steps: 1,
          perturbation: null,
        },
        { baseUrl: '/api', fetchImpl: invalidJsonFetch },
      ),
    ).rejects.toMatchObject({ kind: 'invalid_json' });

    // 5. schema_mismatch (wrong rollout step count)
    const wrongShapeFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          rollout: makeRollout(2),
          inference_ms: 150,
        }),
        { status: 200 },
      ),
    );
    await expect(
      simulate(
        {
          init_states: ic.init_states,
          doy_sincos: ic.doy_sincos,
          steps: 1,
          perturbation: null,
        },
        { baseUrl: '/api', fetchImpl: wrongShapeFetch },
      ),
    ).rejects.toMatchObject({ kind: 'schema_mismatch' });

    // 6. timeout
    const slowFetch = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    await expect(
      checkHealth({ baseUrl: '/api', timeoutMs: 25, fetchImpl: slowFetch }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('supports explicit AbortController cancellation', async () => {
    const controller = new AbortController();
    const pendingFetch = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );

    const promise = checkHealth({
      baseUrl: '/api',
      timeoutMs: 5000,
      signal: controller.signal,
      fetchImpl: pendingFetch,
    });
    controller.abort();

    try {
      await promise;
      expect.unreachable('Expected aborted error');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).kind).toBe('aborted');
    }
  });
});
