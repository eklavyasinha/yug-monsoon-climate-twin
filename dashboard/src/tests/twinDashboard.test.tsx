import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppDataProvider } from '../context/AppDataContext';
import { AppRoutes } from '../App';
import { buildValidMomIc, makeDummyRollout } from './fixtures';

function renderTwin() {
  return render(
    <AppDataProvider>
      <MemoryRouter initialEntries={['/twin']}>
        <AppRoutes />
      </MemoryRouter>
    </AppDataProvider>,
  );
}

function createIcFile() {
  const ic = buildValidMomIc({ includeMask: true });
  const json = JSON.stringify(ic);
  return new File([json], 'monsoon-2024-07-15.json', {
    type: 'application/json',
  });
}

describe('Phase 2A Climate Twin Dashboard (/twin)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not expose synthetic fixture button by default and shows honest empty state', async () => {
    renderTwin();

    expect(
      await screen.findByText(/Connected backend and validated initial conditions required/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Load synthetic dev fixture/i }),
    ).not.toBeInTheDocument();
  });

  it('runs a 10-day baseline simulation against mocked API, caches it, and supports interactive controls', async () => {
    const rollout10 = makeDummyRollout(10);
    // Give Day 1 and Day 5 distinct temperatures so day stepping & diff mode reflect actual values
    for (let r = 0; r < 32; r += 1) {
      for (let c = 0; c < 36; c += 1) {
        rollout10[0][0][r][c] = 298.15; // 25.0 °C
        rollout10[1][0][r][c] = 301.15; // 28.0 °C
        rollout10[4][0][r][c] = 304.15; // 31.0 °C
      }
    }

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(
          JSON.stringify({
            status: 'ready',
            model_name: 'WeatherNet-Rollout-Baseline',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/simulate')) {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body.steps).toBe(10);
        expect(body.perturbation).toBeNull();
        return new Response(
          JSON.stringify({
            rollout: rollout10,
            inference_ms: 5420.5, // Intentionally > 5000 ms to test neutral warning
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    renderTwin();

    // 1. Load a valid mom-ic-v1 file directly on /twin
    const fileInput = await screen.findByLabelText(
      /Choose mom-ic-v1 initial-conditions JSON file/i,
    );
    fireEvent.change(fileInput, { target: { files: [createIcFile()] } });

    await waitFor(() => {
      expect(
        screen.getByText(/Initial conditions validated — ready to run baseline forecast/i),
      ).toBeInTheDocument();
    });

    // 2. Run 10-day baseline simulation
    const runButtons = screen.getAllByRole('button', {
      name: /Run 10-day baseline simulation/i,
    });
    fireEvent.click(runButtons[0]);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /2 m temperature \(t2m\) — Forecast Day 1 of 10/i,
        }),
      ).toBeInTheDocument();
    });

    // Verify model name, backend inference ms, domain disclosure, and >5s neutral warning
    expect(screen.getByText(/Model: WeatherNet-Rollout-Baseline/i)).toBeInTheDocument();
    expect(screen.getByText(/Backend inference: 5420.5 ms/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getAllByText(/includes ocean and neighboring land/i).length,
      ).toBeGreaterThanOrEqual(2);
    });
    expect(
      screen.getByText(/above the Round 1 challenge target of 5.0 s/i),
    ).toBeInTheDocument();

    // 3. Step to Day 2 and confirm summary updates
    fireEvent.click(screen.getByRole('button', { name: /Next forecast day/i }));
    expect(
      screen.getByRole('heading', {
        name: /2 m temperature \(t2m\) — Forecast Day 2 of 10/i,
      }),
    ).toBeInTheDocument();

    // 4. Switch variable to precipitation and verify log1p legend note
    fireEvent.click(screen.getByRole('button', { name: /Precipitation \(mm\/day\)/i }));
    expect(
      screen.getByText(/log1p\(mm\/day\) transform/i),
    ).toBeInTheDocument();

    // 5. Toggle Per-day range and confirm caveat notice appears
    fireEvent.click(screen.getByRole('button', { name: /Per-day range/i }));
    expect(
      screen.getByText(/rescales color limits independently for each forecast day/i),
    ).toBeInTheDocument();

    // 6. Toggle Day A vs Day B comparison mode
    fireEvent.click(
      screen.getByRole('button', { name: /Compare Day A vs Day B/i }),
    );
    expect(
      screen.getByText(/RdBu \(diverging, 0-centred\)/i),
    ).toBeInTheDocument();

    // 7. Toggle chart to accessible data table (chart is lazy-loaded)
    fireEvent.click(await screen.findByRole('button', { name: /^Table$/i }));
    expect(screen.getByTestId('timeseries-data-table')).toBeInTheDocument();

    // 8. Test map zoom buttons & keyboard cell inspection
    fireEvent.click(screen.getByRole('button', { name: /Zoom in map/i }));
    expect(screen.getByText(/Reset \(1\.3×\)/i)).toBeInTheDocument();

    const canvas = screen.getByTestId('twin-grid-canvas');
    const beforeReadout = screen.getByTestId('map-cell-readout').textContent;
    fireEvent.keyDown(canvas, { key: 'ArrowUp' });
    const afterReadout = screen.getByTestId('map-cell-readout').textContent;
    expect(afterReadout).not.toBe(beforeReadout);
  });

  it('cancels an in-flight simulation cleanly via AbortController', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: 'ready',
              model_name: 'WeatherNet-Rollout-Baseline',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    vi.stubGlobal('fetch', fetchMock);
    renderTwin();

    const fileInput = await screen.findByLabelText(
      /Choose mom-ic-v1 initial-conditions JSON file/i,
    );
    fireEvent.change(fileInput, { target: { files: [createIcFile()] } });

    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: /Run 10-day baseline simulation/i })
          .length,
      ).toBeGreaterThan(0);
    });

    fireEvent.click(
      screen.getAllByRole('button', { name: /Run 10-day baseline simulation/i })[0],
    );

    await waitFor(() => {
      expect(screen.getByTestId('simulation-loading-banner')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Cancel request/i }));

    await waitFor(() => {
      expect(
        screen.getByTestId('simulation-cancelled-banner'),
      ).toBeInTheDocument();
    });
  });

  it('shows honest backend error without substituting synthetic data when backend fails', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);

    renderTwin();

    const fileInput = await screen.findByLabelText(
      /Choose mom-ic-v1 initial-conditions JSON file/i,
    );
    fireEvent.change(fileInput, { target: { files: [createIcFile()] } });

    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: /Run 10-day baseline simulation/i })
          .length,
      ).toBeGreaterThan(0);
    });

    fireEvent.click(
      screen.getAllByRole('button', { name: /Run 10-day baseline simulation/i })[0],
    );

    await waitFor(() => {
      expect(screen.getByTestId('simulation-error-banner')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('twin-grid-canvas')).not.toBeInTheDocument();
  });

  it('caches baseline runs per IC file and cancels in-flight requests on route change', async () => {
    const rollout10 = makeDummyRollout(10);
    let simulateCalls = 0;
    let routeAborted = false;

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: 'ready',
              model_name: 'WeatherNet-Rollout-Baseline',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      simulateCalls += 1;
      if (simulateCalls === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ rollout: rollout10, inference_ms: 350.0 }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      // Second call hangs until aborted by route navigation
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          routeAborted = true;
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    vi.stubGlobal('fetch', fetchMock);
    renderTwin();

    // Load IC and run baseline (call #1)
    fireEvent.change(
      await screen.findByLabelText(
        /Choose mom-ic-v1 initial-conditions JSON file/i,
      ),
      { target: { files: [createIcFile()] } },
    );
    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: /Run 10-day baseline simulation/i })
          .length,
      ).toBeGreaterThan(0);
    });
    fireEvent.click(
      screen.getAllByRole('button', { name: /Run 10-day baseline simulation/i })[0],
    );
    await waitFor(() => {
      expect(screen.getByText(/Fresh rollout/i)).toBeInTheDocument();
    });
    expect(simulateCalls).toBe(1);

    // Unload IC and reload exact same IC -> baseline run hits cache without calling /simulate again
    fireEvent.click(screen.getByRole('button', { name: /Unload IC/i }));
    fireEvent.change(
      screen.getByLabelText(/Choose mom-ic-v1 initial-conditions JSON file/i),
      { target: { files: [createIcFile()] } },
    );
    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: /Run 10-day baseline simulation/i })
          .length,
      ).toBeGreaterThan(0);
    });
    fireEvent.click(
      screen.getAllByRole('button', { name: /Run 10-day baseline simulation/i })[0],
    );
    await waitFor(() => {
      expect(screen.getByText(/Cached baseline run/i)).toBeInTheDocument();
    });
    expect(simulateCalls).toBe(1);

    // Trigger forceRefresh (call #2, hangs) then navigate away to /model -> aborts cleanly
    fireEvent.click(
      screen.getByRole('button', { name: /Re-run 10-day baseline/i }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('simulation-loading-banner')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('link', { name: /^Model$/i })[0]);
    await waitFor(() => {
      expect(routeAborted).toBe(true);
    });
  });

  it('derives and renders accurate calendar forecast dates from IC init_date on /twin', async () => {
    const rollout10 = makeDummyRollout(10);
    const angle = (194 / 365) * 2 * Math.PI;
    const datedIc = buildValidMomIc({ includeMask: true });
    datedIc.label = 'ERA5 Monsoon Window';
    datedIc.init_date = '2021-07-14';
    datedIc.doy_sincos = [Math.sin(angle), Math.cos(angle)];
    const datedFile = new File([JSON.stringify(datedIc)], 'era5-2021-07-14.json', {
      type: 'application/json',
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(
          JSON.stringify({
            status: 'ready',
            model_name: 'WeatherNet-Rollout-Baseline',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({ rollout: rollout10, inference_ms: 410.0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderTwin();

    const fileInput = await screen.findByLabelText(
      /Choose mom-ic-v1 initial-conditions JSON file/i,
    );
    fireEvent.change(fileInput, { target: { files: [datedFile] } });

    await waitFor(() => {
      expect(screen.getByText(/Jul 14, 2021 \(2021-07-14\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Jul 15 – Jul 24, 2021/i)).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getAllByRole('button', { name: /Run 10-day baseline simulation/i })[0],
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /2 m temperature \(t2m\) — Forecast Day 1 of 10 \(Jul 15, 2021\)/i,
        }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Next forecast day/i }));
    expect(
      screen.getByRole('heading', {
        name: /2 m temperature \(t2m\) — Forecast Day 2 of 10 \(Jul 16, 2021\)/i,
      }),
    ).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: /^Table$/i }));
    const table = screen.getByTestId('timeseries-data-table');
    expect(table).toHaveTextContent(/Valid Date/i);
    expect(table).toHaveTextContent(/2021-07-15/);
    expect(table).toHaveTextContent(/2021-07-24/);
  });
});
