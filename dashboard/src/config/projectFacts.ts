export const PLACEHOLDER_TEXT = 'TO BE PROVIDED BY TEAM';

export type FactStatus = 'verified' | 'partial' | 'unprovided';

export interface ChannelSpec {
  readonly index: number;
  readonly key: 't2m' | 'tp' | 'u10' | 'v10' | 'msl' | 'tcwv';
  readonly name: string;
  readonly shortName: string;
  readonly unit: string;
  readonly displayUnitNote: string;
  readonly dailyAggregation: string;
  readonly description: string;
}

export const CHANNELS: readonly ChannelSpec[] = [
  {
    index: 0,
    key: 't2m',
    name: '2 m temperature',
    shortName: 'Temperature',
    unit: 'K',
    displayUnitNote: 'Wire unit: K (convertible to °C via K − 273.15)',
    dailyAggregation: 'Mean of 00, 06, 12, 18 UTC samples',
    description:
      'Near-surface air temperature at 2 metres above ground, capturing land-sea thermal contrast, heatwaves, and post-rainfall evaporative cooling.',
  },
  {
    index: 1,
    key: 'tp',
    name: 'Daily total precipitation',
    shortName: 'Precipitation',
    unit: 'mm/day',
    displayUnitNote: 'Wire unit: mm/day (heavy-rain CSI threshold: 10 mm/day)',
    dailyAggregation: '24-hour accumulated sum',
    description:
      'Accumulated daily rainfall over each 1° cell, tracking monsoon onset, active/break spells, Western Ghats orographic rain, and Bay of Bengal depressions.',
  },
  {
    index: 2,
    key: 'u10',
    name: '10 m eastward wind',
    shortName: 'Zonal wind (u10)',
    unit: 'm/s',
    displayUnitNote: 'Wire unit: m/s (positive eastward)',
    dailyAggregation: 'Mean of 00, 06, 12, 18 UTC samples',
    description:
      'Zonal component of 10-metre surface wind, resolving the cross-equatorial Somali jet and Arabian Sea westerlies that transport moisture onto the subcontinent.',
  },
  {
    index: 3,
    key: 'v10',
    name: '10 m northward wind',
    shortName: 'Meridional wind (v10)',
    unit: 'm/s',
    displayUnitNote: 'Wire unit: m/s (positive northward)',
    dailyAggregation: 'Mean of 00, 06, 12, 18 UTC samples',
    description:
      'Meridional component of 10-metre surface wind, capturing northward moisture inflow across the Arabian Sea, Bay of Bengal, and Indo-Gangetic Plain.',
  },
  {
    index: 4,
    key: 'msl',
    name: 'Mean sea level pressure',
    shortName: 'Sea-level pressure',
    unit: 'Pa',
    displayUnitNote: 'Wire unit: Pa (convertible to hPa via Pa / 100)',
    dailyAggregation: 'Mean of 00, 06, 12, 18 UTC samples',
    description:
      'Atmospheric pressure reduced to mean sea level, delineating the monsoon trough, low-pressure systems, and large-scale synoptic gradients.',
  },
  {
    index: 5,
    key: 'tcwv',
    name: 'Total column water vapour',
    shortName: 'Column water vapour',
    unit: 'kg/m²',
    displayUnitNote: 'Wire unit: kg/m² (equivalent to mm precipitable water)',
    dailyAggregation: 'Mean of 00, 06, 12, 18 UTC samples',
    description:
      'Vertically integrated water vapour through the atmospheric column, indicating moisture availability feeding convective and synoptic monsoon rainfall.',
  },
] as const;

export const CHANNEL_KEYS = CHANNELS.map((c) => c.key) as [
  't2m',
  'tp',
  'u10',
  'v10',
  'msl',
  'tcwv',
];

export const GRID_SPEC = {
  rows: 32,
  cols: 36,
  resolutionDeg: 1.0,
  latMin: 6.5,
  latMax: 37.5,
  lonMin: 65.5,
  lonMax: 100.5,
  latOrderContract: 'south-to-north (6.5°N to 37.5°N)',
  lonOrderContract: 'west-to-east (65.5°E to 100.5°E)',
  historySteps: 3,
  maxForecastSteps: 10,
  channelCount: 6,
} as const;

export interface ProjectFacts {
  projectTitle: string;
  projectSubtitle: string;
  teamName: string | null;
  repositoryUrl: string | null;
  datasetAttribution: string | null;
  licence: string | null;
  model: {
    reportedModelName: string;
    architectureSummary: string;
    architectureDetails: string | null;
    checkpointPath: string;
    runtimeHardwareTarget: string;
    inputContract: string;
    outputContract: string;
    internalNormalization: string;
    outputConstraints: string;
    servePipelineAudit: {
      verifiedFromServePy: readonly string[];
      unverifiedExternalCodeNotice: string;
    };
  };
  training: {
    datasetFile: string;
    datasetConstruction: string;
    staticChannels: readonly string[];
    trainingPeriod: string | null;
    procedureAndLoss: string | null;
  };
  evaluation: {
    protocolSummary: string;
    blindWindows: string;
    benchmarkShocks: readonly {
      readonly id: string;
      readonly summary: string;
    }[];
    scoringRubric: string;
    hardGate: string;
    inferenceTarget: string;
    locallyMeasuredMetrics: {
      rmseSkillDay1: number | null;
      rmseSkillDay4: number | null;
      rmseSkillDay8: number | null;
      heavyRainCsiDay1: number | null;
      heavyRainCsiDay4: number | null;
      heavyRainCsiDay8: number | null;
      antiBlurVarianceRatioDay8: number | null;
      perturbationCausalityScore: number | null;
      measured10StepInferenceMs: number | null;
    };
  };
  limitations: {
    structuralLimitations: readonly string[];
    teamSpecificLimitations: string | null;
    driftBlurStabilityObservations: string | null;
  };
}

/**
 * Centralized source of truth for verified contract/server facts and unprovided team facts.
 * Every unverified or unmeasured field is explicitly set to `null` and must render
 * `PLACEHOLDER_TEXT` ("TO BE PROVIDED BY TEAM"). Never fabricate metrics or metadata.
 */
export const PROJECT_FACTS: ProjectFacts = {
  projectTitle: 'Multiverse of Monsoon',
  projectSubtitle: "India's Climate Digital Twin",
  teamName: null,
  repositoryUrl: null,
  datasetAttribution: null,
  licence: null,
  model: {
    reportedModelName: 'WeatherNet-Rollout-Baseline',
    architectureSummary:
      'Autoregressive neural atmospheric forecaster (WeatherNet in PyTorch, invoked via predict_next in serve.py) operating on a 3-day context window plus normalised latitude, longitude, and day-of-year inputs.',
    architectureDetails: null,
    checkpointPath: 'models/weather_rollout_best.pt',
    runtimeHardwareTarget: 'CPU-only inference (4 threads, 6 GB RAM limit, offline execution)',
    inputContract:
      'Three consecutive daily frames [3, 6, 32, 36] (oldest first) in raw physical units, doy_sincos [sin, cos] for the last input day (init_states[-1]), integer steps (1–10), and optional physical-unit perturbation [6, 32, 36] added to init_states[-1].',
    outputContract:
      'Autoregressive daily rollout [steps, 6, 32, 36] in raw physical units (rollout[k] is day k + 1 after the last input day) plus server-measured inference_ms float.',
    internalNormalization:
      'Channel-wise z-score normalisation inside serve.py using checkpoint mean and std; de-normalised back to physical units before returning over HTTP.',
    outputConstraints:
      'In serve.py, predicted tp is clamped to >= 0 mm/day and t2m is clamped to [233.15 K, 333.15 K] (−40 °C to +60 °C). The frontend API client never clips or alters returned values.',
    servePipelineAudit: {
      verifiedFromServePy: [
        'Model instantiation loads WeatherNet(width=ckpt["width"]) and helper predict_next from external models.weather_model using checkpoint models/weather_rollout_best.pt.',
        'Coordinate conditioning: serves fixed normalized tensors LAT = linspace(-1, 1, 32) and LON = linspace(-1, 1, 36) directly to predict_next(MODEL, context, doy_tensor, LAT, LON).',
        'Autoregressive 3-day window: extracts scalar DOY from doy_sincos via atan2(sin, cos) / (2π) × 365, adds physical perturbation to init_states[-1], normalizes with checkpoint MEAN/STD, and advances step = 0..steps−1 via sliding context = cat([context[:, 1:], pred.unsqueeze(1)], dim=1) with future_doy = (doy + step + 1) % 365.',
        'Static channels (land_sea_mask, orography_m) are not passed into serve.py’s predict_next(...) wire call.',
        '365-day circular DOY stepping does not track leap-year (366-day) or calendar dates inside serve.py; calendar forecast dates are computed cleanly on the frontend from IC metadata using UTC arithmetic.',
      ],
      unverifiedExternalCodeNotice:
        'models/weather_model.py, checkpoint weights, stats.json, and training scripts reside outside this frontend workspace; whether WeatherNet uses Conv2D, U-Net, ResNet, or transformer blocks remains unverified here and is honestly marked TO BE PROVIDED BY TEAM.',
    },
  },
  training: {
    datasetFile: 'india_climate_train.nc',
    datasetConstruction:
      '32 × 36 grid of 1° cells (centres 6.5–37.5°N, 65.5–100.5°E), each cell computed as the mean of the 4 surrounding 1° ERA5 points. Daily t2m, u10, v10, msl, tcwv are means of 00, 06, 12, 18 UTC samples; tp is the 24-hour sum.',
    staticChannels: ['land_sea_mask', 'orography_m'],
    trainingPeriod: null,
    procedureAndLoss: null,
  },
  evaluation: {
    protocolSummary:
      'Round 1 automated evaluation runs 8 blind /simulate calls after POST /health reports ready, with a 5.0 s wall-time cap per 10-step rollout and zero retries.',
    blindWindows:
      '5 real windows from hidden dates after 2023-01-10 (no date metadata transmitted; state grids and doy_sincos only) plus 3 perturbation tests on a real window.',
    benchmarkShocks: [
      {
        id: 'warm_ocean',
        summary:
          '+3.0 K on t2m and +15% of current tcwv over the Bay of Bengal box (lat 8..20°N, lon 82..94°E).',
      },
      {
        id: 'monsoon_stall',
        summary:
          '−40% of current u10 and v10 over the Arabian Sea box (lat 8..20°N, lon 65..75°E).',
      },
      {
        id: 'null',
        summary:
          'All-zero perturbation tensor; output must match the unperturbed rollout within 1e-3 of channel standard deviation.',
      },
    ],
    scoringRubric:
      '100 points total: Forecast skill 45 (30 lat-weighted RMSE skill vs better of persistence/climatology at lead days 1, 4, 8 + 15 heavy-rain CSI at 10 mm/day) + Dynamics 25 (10 anti-blur day-8 spatial variance 40–250% of truth + 15 perturbation causality) + Repo 15 + Brief 15.',
    hardGate:
      'Round 2 gate requires beating persistence at day 4, passing the validity gate on all 8 cases (finite values, tp >= 0, t2m within −40 °C to +60 °C), and producing a non-zero localised response to at least one shock.',
    inferenceTarget: 'Under 5.0 seconds wall time for a 10-step rollout on CPU (4 cores, 6 GB RAM).',
    locallyMeasuredMetrics: {
      rmseSkillDay1: null,
      rmseSkillDay4: null,
      rmseSkillDay8: null,
      heavyRainCsiDay1: null,
      heavyRainCsiDay4: null,
      heavyRainCsiDay8: null,
      antiBlurVarianceRatioDay8: null,
      perturbationCausalityScore: null,
      measured10StepInferenceMs: null,
    },
  },
  limitations: {
    structuralLimitations: [
      'Coarse 1° (~110 km) horizontal grid cannot resolve local convective storms, urban microclimates, or fine topographic rainfall gradients.',
      'Forecast horizon is bounded to 1–10 daily steps; outputs represent short-to-medium-range synoptic evolution rather than seasonal or decadal climate projections.',
      'Experimental perturbations inject synthetic physical deltas into the final initial-condition frame (init_states[-1]) and are NOT validated climate projections or operational weather advisories.',
      'Static fields (land_sea_mask, orography_m) are bundled server-side and are not transmitted over the /simulate HTTP wire.',
      'Autoregressive rollouts can accumulate forecast error, spatial smoothing (blur), or drift across lead days 1–10.',
    ],
    teamSpecificLimitations: null,
    driftBlurStabilityObservations: null,
  },
};

export function formatFactOrPlaceholder(value: string | number | null | undefined, unit?: string): {
  text: string;
  isPlaceholder: boolean;
} {
  if (value === null || value === undefined || value === '') {
    return { text: PLACEHOLDER_TEXT, isPlaceholder: true };
  }
  return {
    text: unit ? `${value} ${unit}` : String(value),
    isPlaceholder: false,
  };
}
