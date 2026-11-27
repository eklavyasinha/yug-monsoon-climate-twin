import type { MomIcV1 } from '../utils/icSchema';

export function buildValidMomIc(overrides?: {
  latDescending?: boolean;
  t2mValue?: number;
  tpValue?: number;
  includeMask?: boolean;
}): MomIcV1 {
  const lat = Array.from({ length: 32 }, (_, i) =>
    overrides?.latDescending ? 37.5 - i : 6.5 + i,
  );
  const lon = Array.from({ length: 36 }, (_, i) => 65.5 + i);

  const channelDefaults = [
    overrides?.t2mValue ?? 300.15,
    overrides?.tpValue ?? 4.2,
    5.1,
    2.4,
    100650.0,
    48.5,
  ];

  const init_states = Array.from({ length: 3 }, (_, t) =>
    Array.from({ length: 6 }, (_, c) =>
      Array.from({ length: 32 }, () =>
        Array.from({ length: 36 }, () => channelDefaults[c] + t * 0.01),
      ),
    ),
  );

  const ic: MomIcV1 = {
    schema: 'mom-ic-v1',
    label: 'Test monsoon window',
    source_note: 'Synthetic unit-test fixture for schema verification only',
    doy_sincos: [0.0, 1.0],
    channels: ['t2m', 'tp', 'u10', 'v10', 'msl', 'tcwv'],
    grid: { lat, lon },
    init_states,
  };

  if (overrides?.includeMask) {
    ic.static = {
      land_sea_mask: Array.from({ length: 32 }, () =>
        Array.from({ length: 36 }, () => 1),
      ),
    };
  }

  return ic;
}

export function makeDummyRollout(steps: number): number[][][][] {
  const channelDefaults = [300.15, 4.2, 5.1, 2.4, 100650.0, 48.5];
  return Array.from({ length: steps }, (_, s) =>
    Array.from({ length: 6 }, (_, c) =>
      Array.from({ length: 32 }, (_, r) =>
        Array.from(
          { length: 36 },
          (_, col) => channelDefaults[c] + s * 0.1 + r * 0.01 + col * 0.005,
        ),
      ),
    ),
  );
}
