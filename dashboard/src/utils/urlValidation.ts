export interface UrlValidationResult {
  valid: boolean;
  normalized: string | null;
  error: string | null;
}

/**
 * Validates a user-provided API base URL override.
 * Accepts:
 *  - Explicit `http://` or `https://` URLs (without embedded credentials)
 *  - Same-origin relative paths starting with `/` (e.g. `/api`), excluding protocol-relative `//...`
 * Rejects all other schemes (`javascript:`, `data:`, `file:`, `ftp:`, etc.).
 */
export function validateApiBaseUrl(rawInput: string): UrlValidationResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      valid: false,
      normalized: null,
      error: 'API base URL cannot be empty. Use /api or an http:// or https:// URL.',
    };
  }

  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//')) {
      return {
        valid: false,
        normalized: null,
        error: 'Protocol-relative URLs (//...) are not allowed. Use /api or an explicit http:// or https:// URL.',
      };
    }
    if (/\s/.test(trimmed)) {
      return {
        valid: false,
        normalized: null,
        error: 'Relative API path must not contain whitespace.',
      };
    }
    const normalized = trimmed.length > 1 ? trimmed.replace(/\/+$/, '') : '/';
    return { valid: true, normalized, error: null };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      normalized: null,
      error: 'Enter a valid http:// or https:// URL (or a same-origin path such as /api).',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      normalized: null,
      error: `Unsupported protocol "${parsed.protocol}". Only http:// and https:// URLs are accepted.`,
    };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      normalized: null,
      error: 'API base URL must not contain embedded credentials.',
    };
  }

  const normalized = parsed.toString().replace(/\/+$/, '');
  return { valid: true, normalized, error: null };
}

/**
 * Strictly validates an explicit HTTP or HTTPS URL (used when user supplies an external override).
 */
export function validateHttpOrHttpsUrl(rawInput: string): UrlValidationResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      valid: false,
      normalized: null,
      error: 'URL cannot be empty.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      normalized: null,
      error: 'Enter a valid http:// or https:// URL.',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      normalized: null,
      error: `Only http:// and https:// URLs are permitted (received ${parsed.protocol}).`,
    };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      normalized: null,
      error: 'URL must not contain embedded credentials.',
    };
  }

  return {
    valid: true,
    normalized: parsed.toString().replace(/\/+$/, ''),
    error: null,
  };
}
