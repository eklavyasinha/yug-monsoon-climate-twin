import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axe from 'axe-core';
import { AppRoutes } from '../App';
import { AppDataProvider } from '../context/AppDataContext';
import { generateDevSyntheticFixture } from '../utils/devFixture';

function srgbChannelToLinear(hexChannel: number): number {
  const c = hexChannel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

function wcagContrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const ROUTES_TO_AUDIT = [
  { path: '/', headingPattern: /Exploring India’s monsoon/i },
  { path: '/status', headingPattern: /Backend Status/i },
  { path: '/twin', headingPattern: /Climate Twin Dashboard/i },
  { path: '/lab', headingPattern: /Experiment Laboratory/i },
  { path: '/impact', headingPattern: /Impact Lens/i },
  { path: '/model', headingPattern: /Model/i },
  { path: '/method', headingPattern: /Methodology, Wire Contract/i },
  { path: '/about', headingPattern: /About|Multiverse of Monsoon/i },
] as const;

describe('Phase 3 accessibility, WCAG contrast, and reduced motion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes WCAG 2.1 AA normal-text contrast (>= 4.5:1) for all design-system text and CTA tokens', () => {
    const surfaces = ['#08101D', '#0E1829', '#142238'];
    const textTokens = [
      '#E6EDF7',
      '#93A4BD',
      '#5CC8E0',
      '#BFE6F2',
      '#F2A93B',
      '#E5646B',
      '#5FC9A0',
    ];

    for (const bg of surfaces) {
      for (const fg of textTokens) {
        const ratio = wcagContrastRatio(fg, bg);
        expect(
          ratio,
          `Expected ${fg} on ${bg} to meet WCAG AA (>= 4.5), got ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }

    // Primary button / CTA contrasts
    expect(wcagContrastRatio('#08101D', '#5CC8E0')).toBeGreaterThanOrEqual(4.5);
    expect(wcagContrastRatio('#08101D', '#BFE6F2')).toBeGreaterThanOrEqual(4.5);
    expect(wcagContrastRatio('#08101D', '#F2A93B')).toBeGreaterThanOrEqual(4.5);
  });

  it(
    'produces zero axe-core accessibility violations across all 8 routes',
    async () => {
      for (const route of ROUTES_TO_AUDIT) {
        const { container, unmount } = render(
          <AppDataProvider>
            <MemoryRouter initialEntries={[route.path]}>
              <AppRoutes />
            </MemoryRouter>
          </AppDataProvider>,
        );

        await screen.findByRole('heading', {
          level: 1,
          name: route.headingPattern,
        });

        // happy-dom does not implement CSSOM computed color geometry for canvas/pseudo elements;
        // color contrast is verified mathematically across all design tokens in the test above.
        const results = await axe.run(container, {
          rules: {
            'color-contrast': { enabled: false },
          },
        });

        expect(
          results.violations,
          `axe violations on ${route.path}: ${results.violations
            .map((v) => `${v.id}: ${v.help}`)
            .join('; ')}`,
        ).toEqual([]);

        // Verify skip link and main landmark exist on every route
        const skipLink = screen.getByRole('link', {
          name: /Skip to main content/i,
        });
        expect(skipLink).toHaveAttribute('href', '#main-content');
        expect(container.querySelector('#main-content')).not.toBeNull();

        unmount();
      }
    },
    30_000,
  );

  it('displays visible scientific limitations on /method and /model', async () => {
    const { unmount } = render(
      <AppDataProvider>
        <MemoryRouter initialEntries={['/method']}>
          <AppRoutes />
        </MemoryRouter>
      </AppDataProvider>,
    );
    expect(await screen.findByTestId('method-limitations-section')).toBeInTheDocument();
    expect(
      screen.getByText(/descriptive indicators of numerical response/i),
    ).toBeInTheDocument();
    unmount();

    const { unmount: unmountModel } = render(
      <AppDataProvider>
        <MemoryRouter initialEntries={['/model']}>
          <AppRoutes />
        </MemoryRouter>
      </AppDataProvider>,
    );
    expect(
      await screen.findByRole('heading', { name: /Limitations, Drift, Blur/i }),
    ).toBeInTheDocument();
    unmountModel();
  });

  it('blocks day playback with an accessible notice when prefers-reduced-motion: reduce is active', async () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    const ic = generateDevSyntheticFixture().icData;
    const step0 = ic.init_states[0];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/health')) {
        return new Response(
          JSON.stringify({
            status: 'ready',
            model_name: 'WeatherNet-Rollout-Baseline',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          rollout: Array.from({ length: 10 }, () => step0),
          inference_ms: 55.2,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    try {
      render(
        <AppDataProvider>
          <MemoryRouter initialEntries={['/twin']}>
            <AppRoutes />
          </MemoryRouter>
        </AppDataProvider>,
      );

      const fileInput = (await screen.findByLabelText(
        /Choose mom-ic-v1 initial-conditions JSON file/i,
      )) as HTMLInputElement;
      const file = new File([JSON.stringify(ic)], 'test.ic.json', {
        type: 'application/json',
      });
      fireEvent.change(fileInput, { target: { files: [file] } });

      const runBtns = await screen.findAllByRole('button', {
        name: /Run 10-day baseline simulation/i,
      });
      fireEvent.click(runBtns[0]);

      const playBtn = await screen.findByRole('button', { name: /^Play$/i });
      fireEvent.click(playBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Playback disabled because your system has/i),
        ).toBeInTheDocument();
      });
      expect(playBtn).toHaveAttribute('aria-pressed', 'false');
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
    }
  });
});
