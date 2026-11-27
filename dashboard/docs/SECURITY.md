# Security Architecture & Hardening — Multiverse of Monsoon Frontend

> **Scope statement**: This document records the security controls implemented in the **standalone browser frontend** (`dashboard/`) and the checks performed during Phase 3. It is **not** a complete security audit of the backend, model server, host OS, or deployment infrastructure.
>
> **Important boundary**: **A browser frontend cannot secure a public backend.** Any endpoint reachable from the public internet must enforce its own server-side security controls (see Section 6).

---

## 1. Assets & Trust Boundaries

| Asset / Interface | Sensitivity | Boundary & Handling |
|---|---|---|
| Browser-loaded `mom-ic-v1` JSON files | Local scientific data (up to 5 MB) | Parsed strictly in browser memory via `parseJsonSafely` + Zod schema (`src/utils/icSchema.ts`). Never uploaded to third-party services; only transmitted to the configured `/simulate` backend. |
| Imported Shock Configuration JSON files | Untrusted local user input (up to 1 MB) | Parsed via `parseJsonSafely` + strict Zod schema (`src/utils/shockBuilder.ts`). Never merged into application state with `Object.assign` or spread of raw objects. |
| API Base URL override (`localStorage` key `mom.apiBaseUrlOverride.v1`) | Non-secret user endpoint config | Validated to allow only explicit `http://`, `https://`, or same-origin relative paths (`/api`) without embedded credentials (`src/utils/urlValidation.ts`). |
| `POST /health` and `POST /simulate` responses | Untrusted network responses | Parsed with `parseJsonSafely` and strictly validated against Zod contract schemas (`src/api/contractSchemas.ts`). Non-JSON error bodies and raw HTML error pages are never rendered. |
| Frontend environment variables (`VITE_*`) | **Public** (compiled into client bundle) | Strictly limited to public routing/timeout/dev-fixture flags. **No API keys, tokens, or secrets** exist in `.env.example` or `src/`. |

---

## 2. Threat Model & Mitigations

### 2.1 Malformed or Malicious Backend API Responses
- **Risk**: Compromised or misconfigured backend returns wrong tensor dimensions, `NaN`/`Infinity`, unexpected HTML error pages containing stack traces or scripts, or prototype-pollution keys.
- **Controls**:
  - All JSON responses are parsed through `parseJsonSafely()` (`src/utils/safeJson.ts`), which strips `__proto__`, `constructor`, and `prototype` keys at every nesting depth.
  - Response payloads are validated with strict Zod schemas requiring exact `[steps, 6, 32, 36]` finite-float arrays and finite `inference_ms`.
  - HTTP error extraction (`src/api/client.ts`) only reads structured JSON `detail` strings, strips control characters and `<`/`>` brackets, caps length at 160 characters, and discards raw HTML error pages or arbitrary non-JSON text bodies.
  - All UI text is rendered through React's escaping JSX bindings; zero `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `eval`, or `new Function` exist in `src/`.

### 2.2 Malicious Imported JSON Files (`mom-ic-v1` & Shock Definitions)
- **Risk**: Oversized files causing browser memory exhaustion, prototype pollution, NaN/Inf injection, or invalid channel/grid structure.
- **Controls**:
  - Explicit byte limits enforced before parsing: **5 MB** for `mom-ic-v1` files (`MAX_IC_FILE_BYTES`) and **1 MB** for shock JSON files (`MAX_SHOCK_FILE_BYTES`).
  - Explicit rejection of JSON containing `"__proto__"`, `"constructor"`, or `"prototype"` property keys (`containsForbiddenProtoKey`).
  - Strict Zod `.strict()` schema validation; validated fields are explicitly mapped into clean typed structures rather than merging untrusted JSON objects.

### 2.3 API Base URL Override Abuse
- **Risk**: Injection of `javascript:`, `data:`, `file:`, `ftp:`, protocol-relative `//`, or credential-bearing URLs (`http://user:pass@host`) via `/status` URL override or `localStorage`.
- **Controls**:
  - `validateApiBaseUrl()` and `validateHttpOrHttpsUrl()` (`src/utils/urlValidation.ts`) strictly permit only `http://`, `https://`, or safe same-origin relative paths (`/api`), rejecting embedded credentials and non-HTTP schemes.
  - Runtime override is re-validated on every read from `localStorage` (`src/api/config.ts`).

### 2.4 Data Leakage & Accidental Logging
- **Risk**: Large numerical tensors or raw responses leaked to browser console or third-party telemetry.
- **Controls**:
  - Zero `console.log` of `init_states`, `perturbation`, or `rollout` payloads.
  - Zero third-party analytics, telemetry SDKs, external fonts, CDN scripts, map tile requests, or AI/LLM API calls.

### 2.5 Synthetic Fixture Separation
- **Risk**: Synthetic test data accidentally shipping in production or being presented as model output.
- **Controls**:
  - `VITE_ENABLE_FIXTURE` defaults to `false`. The synthetic generator (`src/utils/devFixture.ts`) is dynamically imported only when `import.meta.env.VITE_ENABLE_FIXTURE === 'true'`, allowing Vite/Rollup to eliminate it from production bundles (verified by searching `dist/` for `MOM_SYNTHETIC_DEV_FIXTURE_GENERATOR_V1_DO_NOT_SHIP_IN_PROD`).

---

## 3. Content Security Policy (CSP)

Production builds (`npm run build`) automatically inject a `<meta http-equiv="Content-Security-Policy">` tag via `vite.config.ts` (`inject-production-csp` plugin):

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' http://localhost:8000 http://127.0.0.1:8000 [<configured VITE_API_BASE_URL origin>];
object-src 'none';
base-uri 'self';
form-action 'self'
```

### Directive Justifications
- **`default-src 'self'`**: Blocks all external network loads by default (offline-first).
- **`script-src 'self'`**: Strictly prohibits inline scripts, `eval`, and external script hosts.
- **`style-src 'self' 'unsafe-inline'`**: Required solely because `src/components/twin/ColorScaleLegend.tsx` applies two dynamic inline `style` attributes for the runtime colourbar CSS `linear-gradient(...)` and percentage tick positions (`left: ...%`). All other styling uses compiled Tailwind CSS from `'self'`.
- **`img-src 'self' data: blob:`**: Allows client-side canvas PNG export data URLs (`canvas.toDataURL('image/png')`) and local `blob:` downloads without permitting external image hosts.
- **`font-src 'self'`**: All typography (`Fraunces`, `IBM Plex Sans`, `IBM Plex Mono`) is self-hosted via `@fontsource/*` inside `dist/assets/`.
- **`connect-src 'self' http://localhost:8000 http://127.0.0.1:8000 ...`**: Permits API calls only to the same-origin `/api` proxy, local FastAPI default ports, and (if set at build time) the explicit `VITE_API_BASE_URL` origin. If a user configures a different cross-origin backend at runtime via `/status` in a static deployment, the hosting reverse proxy should set the HTTP `Content-Security-Policy` header with that approved backend origin.
- **`object-src 'none'; base-uri 'self'; form-action 'self'`**: Blocks legacy plugins, `<base>` tag hijacking, and off-origin form submissions.

> Note: Meta-tag CSP cannot enforce `frame-ancestors`; set `frame-ancestors 'none'` (or your approved parent frame) via HTTP response headers at the reverse proxy when deploying publicly.

---

## 4. Residual Risks & Frontend Limitations

- Browser `localStorage` is readable by any script executing on the same origin; therefore `localStorage` stores **only** the optional non-secret API base URL override, never tokens or credentials.
- In a static build, overriding the API base URL on `/status` to an origin not listed in `connect-src` will be blocked by the browser's CSP until the build or reverse proxy explicitly allows that origin.
- Static security scans and package audits (`bun audit --prod`) reduce known risks but **do not prove the absence of vulnerabilities**.

---

## 5. Public Backend Deployment Requirements (Mandatory Before Public Exposure)

Because **the frontend cannot secure a public backend**, do **not** expose `serve.py` directly to the internet without implementing all of the following server-side controls:

1. **Authentication / Access Control**: Require authentication (e.g., signed session cookies, short-lived bearer tokens behind a backend-for-frontend proxy, or VPN/private-network access) before allowing `POST /simulate` compute calls.
2. **Strict CORS Allowlist**: Replace wildcard or permissive origins with an explicit `allow_origins` allowlist matching only the exact deployed frontend origin(s), and restrict `allow_methods` to `POST` (and `GET` if enabled on `/health`).
3. **Request Rate Limiting**: Enforce per-IP / per-user rate limits on `POST /simulate` (e.g., via reverse proxy or FastAPI middleware) to protect CPU inference from denial-of-service floods.
4. **Concurrency & Compute Caps**: Cap concurrent model rollouts (worker queue / semaphore) and enforce server-side execution timeouts so simultaneous 10-step requests cannot exhaust CPU/RAM.
5. **Request Body Size Limits**: Enforce strict maximum HTTP body size at both the reverse proxy (e.g., Nginx `client_max_body_size 5m`) and ASGI server to reject oversized payloads before JSON parsing.
6. **HTTPS / TLS Termination**: Terminate TLS 1.2+ at the reverse proxy (`https://`) with HSTS enabled so payloads and error details cannot be intercepted or modified in transit.
7. **Server-Side Input Validation & Sanitized Errors**: Validate tensor shapes, `steps` bounds (`1–10`), and finite numbers server-side, and return generic sanitized error messages in production (never raw Python tracebacks or filesystem paths).
8. **HTTP Security Headers & Structured Logging**: Set `Content-Security-Policy` (including `frame-ancestors`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and log only request metadata/latencies (never raw scientific payloads or secrets).
