import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

function extractOrigin(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('/')) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.origin;
    }
  } catch {
    return null;
  }
  return null;
}

function buildProductionCsp(apiBaseUrl: string | undefined): string {
  const connectSources = new Set<string>([
    "'self'",
    'http://localhost:8000',
    'http://127.0.0.1:8000',
  ]);
  const configuredOrigin = extractOrigin(apiBaseUrl);
  if (configuredOrigin) {
    connectSources.add(configuredOrigin);
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${Array.from(connectSources).join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8000';
  const productionCsp = buildProductionCsp(env.VITE_API_BASE_URL);

  const apiProxy = {
    '/api': {
      target: apiProxyTarget,
      changeOrigin: true,
      rewrite: (requestPath: string) => requestPath.replace(/^\/api/, ''),
    },
  };

  return {
    plugins: [
      react(),
      tailwindcss(),
      // Injects a strict static Content-Security-Policy meta tag in production builds.
      // Development mode uses Vite's dev script loader; preview/production enforce CSP.
      {
        name: 'inject-production-csp',
        apply: 'build',
        transformIndexHtml() {
          return [
            {
              tag: 'meta',
              attrs: {
                'http-equiv': 'Content-Security-Policy',
                content: productionCsp,
              },
              injectTo: 'head-prepend',
            },
          ];
        },
      },
      // Copies src/assets into dist/ so root-relative URLs still resolve in production builds.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(import.meta.dirname, 'dist');
          const srcAssets = path.resolve(import.meta.dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, { recursive: true, force: true });
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      proxy: apiProxy,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      proxy: apiProxy,
    },
  };
});
