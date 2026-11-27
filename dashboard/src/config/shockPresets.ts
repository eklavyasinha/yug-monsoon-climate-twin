import { CHANNELS, type ChannelSpec } from './projectFacts';

export type ChannelKey = ChannelSpec['key'];
export type ShockFootprintType = 'box' | 'gaussian';
export type ShockPresetId =
  | 'control_zero'
  | 'warm_bay_of_bengal'
  | 'weaker_arabian_sea_wind'
  | 'custom';

export const CHANNEL_KEYS_ORDERED: readonly ChannelKey[] = CHANNELS.map(
  (c) => c.key,
);

export interface ShockBoxConfig {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

export interface ShockGaussianConfig {
  centerLat: number;
  centerLon: number;
  radiusDeg: number;
  cutoffSigmas: number;
}

export interface ShockChannelEntry {
  channel: ChannelKey;
  enabled: boolean;
  peakDelta: number;
}

export interface ShockConfig {
  schema: 'mom-shock-v1';
  presetId: ShockPresetId;
  name: string;
  notes: string;
  footprintType: ShockFootprintType;
  box: ShockBoxConfig;
  gaussian: ShockGaussianConfig;
  channels: ShockChannelEntry[];
}

export interface ShockPresetMeta {
  readonly id: Exclude<ShockPresetId, 'custom'>;
  readonly label: string;
  readonly shortSummary: string;
  readonly scientificDisclaimer: string;
  readonly windNote?: string;
  readonly config: ShockConfig;
}

function makeDefaultChannelEntries(
  overrides: Partial<Record<ChannelKey, { enabled: boolean; peakDelta: number }>>,
): ShockChannelEntry[] {
  return CHANNEL_KEYS_ORDERED.map((ch) => ({
    channel: ch,
    enabled: overrides[ch]?.enabled ?? false,
    peakDelta: overrides[ch]?.peakDelta ?? 0,
  }));
}

export const SHOCK_PRESETS: readonly ShockPresetMeta[] = [
  {
    id: 'control_zero',
    label: 'Control — Zero Shock',
    shortSummary:
      'All-zero [6, 32, 36] perturbation tensor (determinism & null-shock check).',
    scientificDisclaimer:
      'Sends an exact all-zero [6, 32, 36] perturbation per the Round 1 contract null-shock check. Under deterministic inference, output must match the unperturbed (perturbation: null) baseline.',
    config: {
      schema: 'mom-shock-v1',
      presetId: 'control_zero',
      name: 'Control — Zero Shock',
      notes:
        'Exact all-zero [6, 32, 36] perturbation tensor for null-shock verification.',
      footprintType: 'box',
      box: { latMin: 8.0, latMax: 20.0, lonMin: 82.0, lonMax: 94.0 },
      gaussian: {
        centerLat: 14.0,
        centerLon: 88.0,
        radiusDeg: 4.0,
        cutoffSigmas: 3,
      },
      channels: makeDefaultChannelEntries({}),
    },
  },
  {
    id: 'warm_bay_of_bengal',
    label: 'Warm Bay of Bengal',
    shortSummary:
      'Editable Bay of Bengal box starting at +2.0 K on 2 m temperature (t2m).',
    scientificDisclaimer:
      'Exploratory starting value (+2.0 K on t2m) chosen for live UI demonstration — not an official challenge value, scientific recommendation, or validated climate scenario. Adjust magnitude and footprint freely.',
    config: {
      schema: 'mom-shock-v1',
      presetId: 'warm_bay_of_bengal',
      name: 'Warm Bay of Bengal (Exploratory)',
      notes:
        'Exploratory UI preset (+2.0 K on t2m over editable Bay of Bengal box); not an official challenge hidden shock.',
      footprintType: 'box',
      box: { latMin: 8.0, latMax: 20.0, lonMin: 82.0, lonMax: 94.0 },
      gaussian: {
        centerLat: 14.0,
        centerLon: 88.0,
        radiusDeg: 4.0,
        cutoffSigmas: 3,
      },
      channels: makeDefaultChannelEntries({
        t2m: { enabled: true, peakDelta: 2.0 },
      }),
    },
  },
  {
    id: 'weaker_arabian_sea_wind',
    label: 'Weaker Arabian Sea Wind',
    shortSummary:
      'Editable Arabian Sea box starting at −2.0 m/s on eastward wind (u10).',
    scientificDisclaimer:
      'Exploratory starting value (−2.0 m/s on u10) chosen for live UI demonstration — not an official challenge value, scientific recommendation, or validated climate scenario. Adjust magnitude and footprint freely.',
    windNote:
      'Subtracting from u10 (eastward wind component) is not equivalent to proportionally weakening total wind speed hypot(u10, v10) or preserving wind direction — where u10 is negative or v10 is nonzero, an additive u10 delta alters both speed and heading.',
    config: {
      schema: 'mom-shock-v1',
      presetId: 'weaker_arabian_sea_wind',
      name: 'Weaker Arabian Sea Wind (Exploratory)',
      notes:
        'Exploratory UI preset (-2.0 m/s additive delta on u10 over editable Arabian Sea box); not an official challenge hidden shock.',
      footprintType: 'box',
      box: { latMin: 8.0, latMax: 20.0, lonMin: 65.5, lonMax: 75.5 },
      gaussian: {
        centerLat: 14.0,
        centerLon: 70.5,
        radiusDeg: 4.0,
        cutoffSigmas: 3,
      },
      channels: makeDefaultChannelEntries({
        u10: { enabled: true, peakDelta: -2.0 },
      }),
    },
  },
] as const;

export function getShockPresetById(id: ShockPresetId): ShockPresetMeta | null {
  return SHOCK_PRESETS.find((p) => p.id === id) ?? null;
}

export function cloneShockConfig(config: ShockConfig): ShockConfig {
  return {
    ...config,
    box: { ...config.box },
    gaussian: { ...config.gaussian },
    channels: config.channels.map((c) => ({ ...c })),
  };
}
