import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GridMapCanvas } from '../components/twin/GridMapCanvas';
import { SyncFieldCanvas } from '../components/lab/SyncFieldCanvas';
import { PRESET_REGIONS } from '../utils/aggregation';
import { createDashboardColorScale } from '../utils/colorScales';
import { ROLLOUT_COLS, ROLLOUT_ROWS } from '../utils/rolloutStore';

function makeAxes() {
  const lat = Array.from({ length: ROLLOUT_ROWS }, (_, r) => 6.5 + r);
  const lon = Array.from({ length: ROLLOUT_COLS }, (_, c) => 65.5 + c);
  return { lat, lon };
}

function makeField(offset: number): Float32Array {
  const arr = new Float32Array(ROLLOUT_ROWS * ROLLOUT_COLS);
  for (let i = 0; i < arr.length; i += 1) {
    arr[i] = offset + (i % 17) * 0.5;
  }
  return arr;
}

describe('Phase 3 canvas hover performance (zero React rerenders on pointer hover)', () => {
  it('updates GridMapCanvas cell readout imperatively on pointerMove without triggering React rerenders', () => {
    const { lat, lon } = makeAxes();
    const rawGrid = makeField(298);
    const u10Grid = makeField(3);
    const v10Grid = makeField(2);
    const colorScale = createDashboardColorScale('t2m', [20, 35]);

    let parentRenders = 0;
    function InstrumentedTwinMap() {
      parentRenders += 1;
      return (
        <GridMapCanvas
          rawGrid={rawGrid}
          u10Grid={u10Grid}
          v10Grid={v10Grid}
          lat={lat}
          lon={lon}
          variable="t2m"
          isDifferenceMode={false}
          colorScale={colorScale}
          selectedRegion={PRESET_REGIONS[0]}
          showWindVectors={false}
          onToggleWindVectors={vi.fn()}
          windStride={3}
          onWindStrideChange={vi.fn()}
        />
      );
    }

    render(<InstrumentedTwinMap />);
    expect(parentRenders).toBe(1);

    const canvas = screen.getByTestId('twin-grid-canvas') as HTMLCanvasElement;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 650,
      bottom: 578,
      width: 650,
      height: 578,
      toJSON: () => ({}),
    });

    const readout = screen.getByTestId('map-cell-readout');
    const initialText = readout.textContent;

    // Simulate rapid hover movement across 10 cells
    for (let step = 0; step < 10; step += 1) {
      fireEvent.pointerMove(canvas, {
        clientX: 80 + step * 35,
        clientY: 60 + step * 30,
      });
    }

    expect(readout.textContent).not.toBe(initialText);
    expect(readout.textContent).toMatch(/°N,.*°E/);
    // Zero React rerenders occurred during hover inspection
    expect(parentRenders).toBe(1);
  });

  it('updates SyncFieldCanvas cell readout imperatively on pointerMove without triggering React rerenders', () => {
    const { lat, lon } = makeAxes();
    const displayGrid = makeField(24);
    const colorScale = createDashboardColorScale('t2m', [20, 35]);

    let parentRenders = 0;
    function InstrumentedSyncMap() {
      parentRenders += 1;
      return (
        <SyncFieldCanvas
          displayGrid={displayGrid}
          lat={lat}
          lon={lon}
          colorScale={colorScale}
          unitLabel="°C"
          decimals={2}
          title="Baseline Field"
          ariaLabel="Baseline Field Canvas"
          testId="sync-perf-canvas"
          selectedRegion={PRESET_REGIONS[0]}
        />
      );
    }

    render(<InstrumentedSyncMap />);
    expect(parentRenders).toBe(1);

    const canvas = screen.getByTestId('sync-perf-canvas') as HTMLCanvasElement;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 562,
      bottom: 494,
      width: 562,
      height: 494,
      toJSON: () => ({}),
    });

    const readout = screen.getByTestId('sync-perf-canvas-readout');
    const initialText = readout.textContent;

    for (let step = 0; step < 10; step += 1) {
      fireEvent.pointerMove(canvas, {
        clientX: 70 + step * 32,
        clientY: 45 + step * 28,
      });
    }

    expect(readout.textContent).not.toBe(initialText);
    expect(readout.textContent).toMatch(/°N,.*°E/);
    expect(parentRenders).toBe(1);
  });
});
