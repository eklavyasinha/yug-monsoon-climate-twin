import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppDataProvider } from '../context/AppDataContext';
import { AppRoutes } from '../App';

function renderAt(initialRoute: string) {
  return render(
    <AppDataProvider>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AppRoutes />
      </MemoryRouter>
    </AppDataProvider>,
  );
}

describe('Phase 1 UI routes and accessibility', () => {
  it('renders the Landing page with conceptual schematic disclaimer and primary CTAs', () => {
    renderAt('/');

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /Exploring India’s monsoon through a contract-checked digital twin/i,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getAllByText(/Conceptual schematic\. Not model output\./i).length,
    ).toBeGreaterThanOrEqual(1);

    expect(
      screen.getByRole('link', { name: /Start Climate Forecast/i }),
    ).toHaveAttribute('href', '/twin');

    expect(
      screen.getByRole('link', { name: /Explore Experiments/i }),
    ).toHaveAttribute('href', '/lab');
  });

  it('renders honest empty states on /twin, /lab, and /impact with navigation to /status', async () => {
    for (const route of ['/twin', '/lab', '/impact']) {
      const { unmount } = renderAt(route);
      expect(
        await screen.findByText(
          /Connected backend and validated initial conditions required/i,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /Open Backend Status & IC Loader/i }),
      ).toHaveAttribute('href', '/status');
      unmount();
    }
  });

  it('validates API base URL override on /status and rejects non-HTTP schemes', async () => {
    renderAt('/status');

    const input = await screen.findByLabelText(/Override API base URL/i);
    fireEvent.change(input, { target: { value: 'ftp://invalid.example' } });
    fireEvent.click(screen.getByRole('button', { name: /Save URL override/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      /Only http:\/\/ and https:\/\/ URLs are permitted/i,
    );

    // Run contract test must stay disabled until a valid IC file is loaded
    expect(
      screen.getByRole('button', { name: /Run contract test/i }),
    ).toBeDisabled();
  });

  it('renders explicit TO BE PROVIDED BY TEAM placeholders for unprovided model facts on /model', async () => {
    renderAt('/model');

    expect(
      await screen.findByText('WeatherNet-Rollout-Baseline'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText('TO BE PROVIDED BY TEAM').length,
    ).toBeGreaterThan(3);
  });
});
