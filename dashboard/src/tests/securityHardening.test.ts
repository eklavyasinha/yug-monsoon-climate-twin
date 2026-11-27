import { afterEach, describe, expect, it, vi } from 'vitest';
import { simulate } from '../api/client';
import { ApiClientError } from '../api/errors';
import { generateDevSyntheticFixture } from '../utils/devFixture';
import { MAX_IC_FILE_BYTES, parseAndValidateMomIcJson } from '../utils/icSchema';
import { containsForbiddenProtoKey, parseJsonSafely } from '../utils/safeJson';
import {
  MAX_SHOCK_FILE_BYTES,
  parseAndValidateShockConfigJson,
  SHOCK_PRESETS,
} from '../utils/shockBuilder';
import { validateApiBaseUrl } from '../utils/urlValidation';

describe('Phase 3 security hardening', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('strips prototype-pollution keys (__proto__, constructor, prototype) in parseJsonSafely', () => {
    const malicious =
      '{"__proto__":{"polluted":true},"nested":{"constructor":{"prototype":{"x":1}}},"safe":"ok"}';
    expect(containsForbiddenProtoKey(malicious)).toBe(true);

    const parsed = parseJsonSafely(malicious) as Record<string, unknown>;
    expect(parsed.safe).toBe('ok');
    expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(false);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    const nested = parsed.nested as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(nested, 'constructor')).toBe(false);
  });

  it('rejects IC JSON files containing forbidden prototype-pollution keys', () => {
    const validIc = generateDevSyntheticFixture().icData;
    const rawWithProto = JSON.stringify(validIc).replace(
      '{',
      '{"__proto__":{"polluted":true},',
    );
    const result = parseAndValidateMomIcJson(rawWithProto, {
      fileName: 'malicious.ic.json',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /forbidden/i.test(e))).toBe(true);
    }
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('rejects Shock Config JSON files containing forbidden prototype-pollution keys', () => {
    const presetJson = JSON.stringify(SHOCK_PRESETS[0]).replace(
      '{',
      '{"constructor":{"prototype":{"admin":true}},',
    );
    const result = parseAndValidateShockConfigJson(presetJson);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /forbidden/i.test(e))).toBe(true);
    }
    expect(({} as { admin?: boolean }).admin).toBeUndefined();
  });

  it('enforces explicit size limits (5 MB IC, 1 MB shock config)', () => {
    expect(MAX_IC_FILE_BYTES).toBe(5 * 1024 * 1024);
    expect(MAX_SHOCK_FILE_BYTES).toBe(1024 * 1024);

    const oversizedIc = parseAndValidateMomIcJson('{}', {
      fileName: 'huge.ic.json',
      fileSizeBytes: MAX_IC_FILE_BYTES + 1,
    });
    expect(oversizedIc.ok).toBe(false);

    const oversizedShock = parseAndValidateShockConfigJson(
      '{}',
      MAX_SHOCK_FILE_BYTES + 1,
    );
    expect(oversizedShock.ok).toBe(false);
  });

  it('sanitizes HTTP error responses and never exposes raw HTML error pages or stack traces', async () => {
    const htmlErrorPage =
      '<html><body><h1>500 Internal Server Error</h1><script>alert(1)</script><pre>Traceback (most recent call last): File "/secret/app/serve.py"</pre></body></html>';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(htmlErrorPage, {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'content-type': 'text/html' },
      }),
    );

    const ic = generateDevSyntheticFixture().icData;
    let caught: unknown = null;
    try {
      await simulate(
        {
          init_states: ic.init_states,
          doy_sincos: ic.doy_sincos,
          steps: 1,
          perturbation: null,
        },
        { baseUrl: 'http://localhost:8000', timeoutMs: 5000 },
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiClientError);
    const apiErr = caught as ApiClientError;
    expect(apiErr.kind).toBe('http_error');
    expect(apiErr.statusCode).toBe(500);
    // Must not reflect raw HTML, script tags, or server traceback paths
    expect(apiErr.message).not.toContain('<script>');
    expect(apiErr.message).not.toContain('Traceback');
    expect(apiErr.message).not.toContain('/secret/app/serve.py');
    expect(apiErr.details?.join(' ') ?? '').not.toContain('Traceback');
  });

  it('extracts sanitized FastAPI JSON detail strings while stripping HTML angle brackets and control chars', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: 'Invalid <script>steps</script>\u0000 parameter',
        }),
        {
          status: 422,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const ic = generateDevSyntheticFixture().icData;
    let caught: unknown = null;
    try {
      await simulate(
        {
          init_states: ic.init_states,
          doy_sincos: ic.doy_sincos,
          steps: 1,
          perturbation: null,
        },
        { baseUrl: 'http://localhost:8000', timeoutMs: 5000 },
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiClientError);
    const apiErr = caught as ApiClientError;
    expect(apiErr.kind).toBe('http_error');
    expect(apiErr.statusCode).toBe(422);
    expect(apiErr.details?.[0]).not.toContain('<');
    expect(apiErr.details?.[0]).not.toContain('>');
    expect(apiErr.details?.[0]).toContain('Invalid scriptsteps/script parameter');
  });

  it('rejects non-HTTP(S) schemes, protocol-relative URLs, and embedded credentials in API base URL validation', () => {
    expect(validateApiBaseUrl('javascript:alert(1)').valid).toBe(false);
    expect(validateApiBaseUrl('data:text/html,hi').valid).toBe(false);
    expect(validateApiBaseUrl('file:///etc/passwd').valid).toBe(false);
    expect(validateApiBaseUrl('ftp://invalid.example').valid).toBe(false);
    expect(validateApiBaseUrl('//evil.example/api').valid).toBe(false);
    expect(validateApiBaseUrl('http://user:pass@localhost:8000').valid).toBe(false);
    expect(validateApiBaseUrl('http://localhost:8000/').valid).toBe(true);
    expect(validateApiBaseUrl('/api').valid).toBe(true);
  });

  it('strips unsupported fields before sending POST /simulate payloads', async () => {
    const ic = generateDevSyntheticFixture().icData;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          rollout: [ic.init_states[0]],
          inference_ms: 42.5,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const requestWithExtras = {
      init_states: ic.init_states,
      doy_sincos: ic.doy_sincos,
      steps: 1,
      perturbation: null,
      unsupported_field: 'should-not-be-sent',
      api_key: 'never-send',
    } as unknown as Parameters<typeof simulate>[0];

    await simulate(requestWithExtras, {
      baseUrl: 'http://localhost:8000',
      timeoutMs: 5000,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const bodyText = String(fetchSpy.mock.calls[0][1]?.body ?? '');
    const sent = JSON.parse(bodyText) as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual([
      'doy_sincos',
      'init_states',
      'perturbation',
      'steps',
    ]);
  });
});
