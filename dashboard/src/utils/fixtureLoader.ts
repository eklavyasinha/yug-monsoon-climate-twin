import type { DevSyntheticFixtureBundle } from './devFixture';

/**
 * Compile-time feature flag for the development-only synthetic fixture.
 * Vite statically replaces `import.meta.env.VITE_ENABLE_FIXTURE` at build time,
 * guaranteeing `devFixture.ts` is completely excluded from production bundles
 * whenever `VITE_ENABLE_FIXTURE !== 'true'`.
 */
export function isSyntheticFixtureEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_FIXTURE === 'true';
}

export async function loadDevSyntheticFixture(): Promise<DevSyntheticFixtureBundle> {
  if (import.meta.env.VITE_ENABLE_FIXTURE === 'true') {
    const mod = await import('./devFixture');
    return mod.generateDevSyntheticFixture();
  }
  throw new Error(
    'Synthetic test fixture is disabled. Set VITE_ENABLE_FIXTURE=true in local development only.',
  );
}
