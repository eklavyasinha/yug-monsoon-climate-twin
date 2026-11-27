import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

function clearTestStorage(): void {
  try {
    window.localStorage?.clear();
  } catch {
    // Ignore restricted storage in custom environments.
  }
}

beforeEach(() => clearTestStorage());
afterEach(() => {
  cleanup();
  clearTestStorage();
});
