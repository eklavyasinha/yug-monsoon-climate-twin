const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Safely parses untrusted JSON text while stripping prototype-pollution keys
 * (`__proto__`, `constructor`, `prototype`) at every object nesting level.
 */
export function parseJsonSafely(rawText: string): unknown {
  return JSON.parse(rawText, (key, value: unknown) => {
    if (FORBIDDEN_KEYS.has(key)) {
      return undefined;
    }
    return value;
  });
}

/**
 * Checks whether a raw JSON string contains explicit forbidden prototype keys
 * as property names (for defensive telemetry-free rejection in tests/validators).
 */
export function containsForbiddenProtoKey(rawText: string): boolean {
  return /"(?:__proto__|constructor|prototype)"\s*:/.test(rawText);
}
