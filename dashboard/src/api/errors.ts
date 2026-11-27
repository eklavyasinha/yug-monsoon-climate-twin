export type ApiErrorKind =
  | 'backend_unreachable'
  | 'network_or_cors'
  | 'timeout'
  | 'http_error'
  | 'invalid_json'
  | 'schema_mismatch'
  | 'aborted';

export interface ApiClientErrorOptions {
  kind: ApiErrorKind;
  message: string;
  statusCode?: number;
  details?: string[];
  cause?: unknown;
}

export class ApiClientError extends Error {
  public readonly kind: ApiErrorKind;
  public readonly statusCode?: number;
  public readonly details?: string[];

  constructor(options: ApiClientErrorOptions) {
    super(options.message);
    this.name = 'ApiClientError';
    this.kind = options.kind;
    this.statusCode = options.statusCode;
    this.details = options.details;
  }
}

export function getApiErrorTitle(kind: ApiErrorKind): string {
  switch (kind) {
    case 'backend_unreachable':
      return 'Backend unreachable';
    case 'network_or_cors':
      return 'Network or CORS-blocked request';
    case 'timeout':
      return 'Request timed out';
    case 'http_error':
      return 'HTTP error response';
    case 'invalid_json':
      return 'Invalid JSON response';
    case 'schema_mismatch':
      return 'API contract schema mismatch';
    case 'aborted':
      return 'Request cancelled';
  }
}

/**
 * Classifies a low-level fetch failure into a distinct, user-diagnosable error state.
 * Never includes request payload contents in error messages.
 */
export function classifyFetchError(
  err: unknown,
  context: {
    targetUrl: string;
    isCrossOrigin: boolean;
    didTimeout: boolean;
    wasCallerAborted: boolean;
    timeoutMs: number;
  },
): ApiClientError {
  if (err instanceof ApiClientError) {
    return err;
  }

  if (context.didTimeout) {
    return new ApiClientError({
      kind: 'timeout',
      message: `The climate backend did not respond within ${(context.timeoutMs / 1000).toFixed(1)} s.`,
      cause: err,
    });
  }

  if (context.wasCallerAborted || (err instanceof DOMException && err.name === 'AbortError')) {
    return new ApiClientError({
      kind: 'aborted',
      message: 'The request was cancelled before completion.',
      cause: err,
    });
  }

  const rawMsg = err instanceof Error ? err.message : String(err);

  if (context.isCrossOrigin) {
    return new ApiClientError({
      kind: 'network_or_cors',
      message:
        'Browser blocked or failed a cross-origin request. FastAPI serve.py does not enable CORS by default; use the same-origin /api Vite proxy locally or configure CORS on the backend.',
      details: [rawMsg],
      cause: err,
    });
  }

  return new ApiClientError({
    kind: 'backend_unreachable',
    message:
      'Could not reach the climate backend. Confirm `python serve.py --port 8000` is running locally and reachable from the configured proxy or URL.',
    details: [rawMsg],
    cause: err,
  });
}
