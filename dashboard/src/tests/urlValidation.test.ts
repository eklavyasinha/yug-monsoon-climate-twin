import { describe, expect, it } from 'vitest';
import {
  validateApiBaseUrl,
  validateHttpOrHttpsUrl,
} from '../utils/urlValidation';

describe('API URL validation', () => {
  it('accepts valid http and https URLs and normalizes trailing slashes', () => {
    expect(validateHttpOrHttpsUrl('http://localhost:8000/')).toEqual({
      valid: true,
      normalized: 'http://localhost:8000',
      error: null,
    });

    expect(validateHttpOrHttpsUrl('https://monsoon.example.org/api/v1///')).toEqual({
      valid: true,
      normalized: 'https://monsoon.example.org/api/v1',
      error: null,
    });
  });

  it('accepts same-origin relative /api path in validateApiBaseUrl', () => {
    expect(validateApiBaseUrl('/api/')).toEqual({
      valid: true,
      normalized: '/api',
      error: null,
    });
  });

  it('rejects non-HTTP/HTTPS protocols, protocol-relative URLs, credentials, and malformed inputs', () => {
    expect(validateHttpOrHttpsUrl('javascript:alert(1)').valid).toBe(false);
    expect(validateHttpOrHttpsUrl('ftp://example.com').valid).toBe(false);
    expect(validateHttpOrHttpsUrl('file:///etc/passwd').valid).toBe(false);
    expect(validateHttpOrHttpsUrl('https://user:pass@example.com').valid).toBe(false);
    expect(validateHttpOrHttpsUrl('not a url').valid).toBe(false);
    expect(validateHttpOrHttpsUrl('').valid).toBe(false);
    expect(validateApiBaseUrl('//evil.example.com').valid).toBe(false);
    expect(validateApiBaseUrl('/api with space').valid).toBe(false);
  });
});
