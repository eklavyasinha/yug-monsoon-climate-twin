import { validateApiBaseUrl } from '../utils/urlValidation';

export type HealthHttpMethod = 'POST' | 'GET';

export const DEFAULT_API_BASE_URL = '/api';
export const DEFAULT_API_PROXY_TARGET = 'http://localhost:8000';
export const DEFAULT_HEALTH_METHOD: HealthHttpMethod = 'POST';
export const DEFAULT_API_TIMEOUT_MS = 30_000;

const STORAGE_KEY_API_BASE_URL = 'mom.apiBaseUrlOverride.v1';

export interface ApiRuntimeConfig {
  defaultBaseUrl: string;
  activeBaseUrl: string;
  overrideBaseUrl: string | null;
  proxyTarget: string;
  healthMethod: HealthHttpMethod;
  timeoutMs: number;
}

function readEnvValue(key: string): string | undefined {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  return env?.[key];
}

export function getEnvDefaultBaseUrl(): string {
  const raw = readEnvValue('VITE_API_BASE_URL');
  if (!raw) return DEFAULT_API_BASE_URL;
  const check = validateApiBaseUrl(raw);
  return check.valid && check.normalized ? check.normalized : DEFAULT_API_BASE_URL;
}

export function getEnvProxyTarget(): string {
  return readEnvValue('VITE_API_PROXY_TARGET') || DEFAULT_API_PROXY_TARGET;
}

export function getEnvHealthMethod(): HealthHttpMethod {
  const raw = (readEnvValue('VITE_HEALTH_METHOD') || DEFAULT_HEALTH_METHOD).toUpperCase();
  return raw === 'GET' ? 'GET' : 'POST';
}

export function getEnvTimeoutMs(): number {
  const raw = readEnvValue('VITE_API_TIMEOUT_MS');
  if (!raw) return DEFAULT_API_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 1000 && parsed <= 300_000
    ? parsed
    : DEFAULT_API_TIMEOUT_MS;
}

export function loadStoredBaseUrlOverride(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY_API_BASE_URL);
    if (!stored) return null;
    const check = validateApiBaseUrl(stored);
    return check.valid && check.normalized ? check.normalized : null;
  } catch {
    return null;
  }
}

export function saveBaseUrlOverride(url: string | null): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    if (url === null) {
      window.localStorage.removeItem(STORAGE_KEY_API_BASE_URL);
      return;
    }
    const check = validateApiBaseUrl(url);
    if (check.valid && check.normalized) {
      window.localStorage.setItem(STORAGE_KEY_API_BASE_URL, check.normalized);
    }
  } catch {
    // Ignore storage quota / private-mode restrictions cleanly.
  }
}

export function getApiRuntimeConfig(override?: string | null): ApiRuntimeConfig {
  const defaultBaseUrl = getEnvDefaultBaseUrl();
  const resolvedOverride =
    override !== undefined ? override : loadStoredBaseUrlOverride();
  return {
    defaultBaseUrl,
    activeBaseUrl: resolvedOverride || defaultBaseUrl,
    overrideBaseUrl: resolvedOverride,
    proxyTarget: getEnvProxyTarget(),
    healthMethod: getEnvHealthMethod(),
    timeoutMs: getEnvTimeoutMs(),
  };
}
