import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppDataProvider } from '../context/AppDataContext';
import { AppRoutes } from '../App';
import { buildValidMomIc, makeDummyRollout } from './fixtures';

function renderAt(initialRoute: '/lab' | '/impact') {
  return render(
    <AppDataProvider>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AppRoutes />
      </MemoryRouter>
    </AppDataProvider>,
  );
}

function createIcFile() {
  const angle = (194 / 365) * 2 * Math.PI;
  const ic = buildValidMomIc({ includeMask: true });
  ic.init_date = '2021-07-14';
  ic.doy_sincos = [Math.sin(angle), Math.cos(angle)];
  return new File([JSON.stringify(ic)], 'monsoon-2021-07-14.json', {
    type: 'application/json',
  });
}

describe('Phase 2B Experiment Lab (/lab) & Impact Lens (/impact) UI Integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('runs sequential baseline + scenario on /lab, renders synchronized maps + descriptive diagnostics, and carries actual runs into /impact', async () => {
    const baseRollout = makeDummyRollout(10);
    const scenRollout = makeDummyRollout(10);

    // Apply a deterministic, testable shift to scenario (warmer Bay of Bengal + heavier rainfall)
    for (let s = 0; s < 10; s += 1) {
      for (let r = 0; r < 32; r += 1) {
        for (let c = 0; c < 36; c += 1) {
          baseRollout[s][0][r][c] = 307.15; // 34.0 °C (< 35 °C)
          scenRollout[s][0][r][c] = 307.15;
          baseRollout[s][1][r][c] = 4.0; // 10-day accum = 40 mm
          scenRollout[s][1][r][c] = 6.5; // 10-day accum = 65 mm (+25 mm)
        }
      }
      // Perturb Bay of Bengal region inside box (8..20°N -> r=2..13, 82..94°E -> c=17..28)
      for (let r = 2; r <= 13; r += 1) {
        for (let c = 17; c <= 28; c += 1) {
          scenRollout[s][0][r][c] = 309.65; // 36.5 °C (+2.5 °C, >= 35 °C)
        }
      }
    }

    const requestLog: Array<{ url: string; perturbationNull: boolean }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(
          JSON.stringify({
            status: 'ready',
            model_name: 'WeatherNet-Rollout-Test',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/simulate')) {
        const body = JSON.parse(String(init?.body ?? '{}'));
        const isNull = body.perturbation === null;
        requestLog.push({ url, perturbationNull: isNull });
        expect(body.steps).toBe(10);
        if (!isNull) {
          expect(body.perturbation.length).toBe(6);
          expect(body.perturbation[0].length).toBe(32);
          expect(body.perturbation[0][0].length).toBe(36);
        }
        return new Response(
          JSON.stringify({
            rollout: isNull ? baseRollout : scenRollout,
            inference_ms: isNull ? 310.4 : 325.8,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);
    renderAt('/lab');

    // Empty state preserved before IC load
    expect(
      await screen.findByText(
        /Connected backend and validated initial conditions required/i,
      ),
    ).toBeInTheDocument();

    // Load validated IC directly on /lab
    const fileInput = screen.getByLabelText(
      /Choose mom-ic-v1 initial-conditions JSON file/i,
    );
    fireEvent.change(fileInput, { target: { files: [createIcFile()] } });

    await waitFor(() => {
      expect(screen.getByTestId('lab-workspace')).toBeInTheDocument();
    });

    // Live Shock Builder preview map & preset buttons are visible
    expect(screen.getByTestId('shock-preview-canvas')).toBeInTheDocument();

    // Switch to Gaussian footprint and verify documented equirectangular formula note appears
    fireEvent.click(screen.getByRole('button', { name: /^Gaussian$/i }));
    expect(screen.getByText(/equirectangular cosine-corrected distance/i)).toBeInTheDocument();

    // Switch back to Warm Bay of Bengal preset (Box) and execute baseline + scenario
    fireEvent.click(screen.getByRole('button', { name: /Warm Bay of Bengal/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /Run baseline \+ scenario \(10 days\)/i }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('lab-comparison-stage')).toBeInTheDocument();
    });

    // Sequential order: baseline (perturbation: null) first, then scenario (perturbation: [6][32][36])
    expect(requestLog).toHaveLength(2);
    expect(requestLog[0].perturbationNull).toBe(true);
    expect(requestLog[1].perturbationNull).toBe(false);

    // Three synchronized maps rendered with accurate valid calendar date
    expect(screen.getByTestId('lab-comparison-stage')).toHaveTextContent(
      /Day 1 of 10 \(Jul 15, 2021\)/i,
    );
    expect(screen.getByTestId('lab-baseline-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('lab-scenario-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('lab-diff-canvas')).toBeInTheDocument();

    // Integrity panel exact mandatory title + finite + nonnegative checks
    const integrityPanel = screen.getByTestId('lab-integrity-panel');
    expect(integrityPanel).toHaveTextContent(
      /Descriptive diagnostics — not scientific validation/i,
    );
    expect(integrityPanel).toHaveTextContent(
      /does not prove physical causality or scientific validity/i,
    );
    expect(integrityPanel).toHaveTextContent(/Yes \(0 non-finite\)/i);
    expect(integrityPanel).toHaveTextContent(/Yes \(min 4\.000 mm\/day\)/i);

    // Now navigate to /impact via navbar link — actual baseline + scenario runs persist!
    fireEvent.click(screen.getAllByRole('link', { name: /^Impact$/i })[0]);

    await waitFor(() => {
      expect(screen.getByTestId('impact-workspace')).toBeInTheDocument();
    });

    expect(screen.getByTestId('impact-workspace')).toHaveTextContent(
      /Jul 15 – Jul 24, 2021/,
    );

    // Accumulated rainfall baseline/scenario/diff maps + regional summary table + heat map rendered
    expect(screen.getByTestId('impact-baseline-rain-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('impact-scenario-rain-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('impact-diff-rain-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('impact-heat-baseline-canvas')).toBeInTheDocument();

    const summaryTable = screen.getByTestId('impact-regional-summary-table');
    expect(summaryTable).toHaveTextContent('40.00 mm');
    expect(summaryTable).toHaveTextContent('65.00 mm');
    expect(summaryTable).toHaveTextContent('+25.00 mm');

    // Editing heavy-rain threshold from 10 to 5 mm/day updates scenario heavy-rain days (6.5 >= 5 -> 10 days)
    const heavyInput = screen.getByLabelText(/Heavy-rain threshold in mm\/day/i);
    fireEvent.change(heavyInput, { target: { value: '5' } });
    expect(summaryTable).toHaveTextContent('10.00 days');

    // Verify all 7 explicit scientific limitations are rendered
    const limitations = screen.getByTestId('impact-scientific-limitations');
    expect(limitations).toHaveTextContent(/Coarse spatial resolution/i);
    expect(limitations).toHaveTextContent(/Daily temporal output/i);
    expect(limitations).toHaveTextContent(/Experimental model/i);
    expect(limitations).toHaveTextContent(/Descriptive calculations only/i);
    expect(limitations).toHaveTextContent(/No downstream socio-economic claims/i);
    expect(limitations).toHaveTextContent(/No ground-truth observation implied/i);
    expect(limitations).toHaveTextContent(/Regional averaging caveat/i);
  });

  it('rejects invalid imported shock JSON and cancels an in-flight /lab experiment cleanly', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ status: 'ready', model_name: 'WeatherNet-Test' }),
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
    renderAt('/lab');

    fireEvent.change(
      await screen.findByLabelText(
        /Choose mom-ic-v1 initial-conditions JSON file/i,
      ),
      { target: { files: [createIcFile()] } },
    );

    await waitFor(() => {
      expect(screen.getByTestId('lab-workspace')).toBeInTheDocument();
    });

    // Import malformed shock JSON -> displays validation alert without mutating state
    const shockInput = screen.getByLabelText(
      /Import shock configuration JSON file/i,
    );
    const badFile = new File(['{"schema":"wrong-schema"}'], 'bad-shock.json', {
      type: 'application/json',
    });
    fireEvent.change(shockInput, { target: { files: [badFile] } });

    await waitFor(() => {
      expect(screen.getByTestId('shock-validation-errors')).toBeInTheDocument();
    });

    // Trigger hanging /simulate and click Cancel request
    fireEvent.click(
      screen.getByRole('button', { name: /Run baseline \+ scenario \(10 days\)/i }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('lab-loading-banner')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Cancel request/i }));
    await waitFor(() => {
      expect(screen.getByTestId('lab-cancelled-banner')).toBeInTheDocument();
    });
  });

  it('sends an all-zero [6][32][36] tensor for Control — Zero Shock and reports exact 0 max abs diff', async () => {
    const rollout = makeDummyRollout(10);
    let capturedPerturbation: number[][][] | null | undefined;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(
          JSON.stringify({ status: 'ready', model_name: 'WeatherNet-Test' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      const body = JSON.parse(String(init?.body ?? '{}'));
      if (body.perturbation !== null) {
        capturedPerturbation = body.perturbation as number[][][];
      }
      return new Response(
        JSON.stringify({ rollout, inference_ms: 210.0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    vi.stubGlobal('fetch', fetchMock);
    renderAt('/lab');

    fireEvent.change(
      await screen.findByLabelText(
        /Choose mom-ic-v1 initial-conditions JSON file/i,
      ),
      { target: { files: [createIcFile()] } },
    );

    await waitFor(() => {
      expect(screen.getByTestId('lab-workspace')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Control — Zero Shock/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /Run baseline \+ scenario \(10 days\)/i }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('lab-integrity-panel')).toBeInTheDocument();
    });

    expect(capturedPerturbation).toBeDefined();
    expect(capturedPerturbation?.length).toBe(6);
    expect(capturedPerturbation?.[0]?.[0]?.[0]).toBe(0);
    expect(screen.getByTestId('lab-integrity-panel')).toHaveTextContent(
      /0\.000e\+0/i,
    );
  });
});
