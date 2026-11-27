import { inspectRollout, type RolloutDiagnostics } from '../api/contractSchemas';
import { GRID_SPEC } from '../config/projectFacts';
import { validateMomIcObject, type IcValidationSummary, type MomIcV1 } from './icSchema';
import { packRollout, type PackedRollout } from './rolloutStore';

/**
 * Sentinel string tested in build verification to guarantee this module is
 * completely tree-shaken out of production builds when VITE_ENABLE_FIXTURE !== 'true'.
 */
export const SYNTHETIC_FIXTURE_BUILD_SENTINEL =
  'MOM_SYNTHETIC_DEV_FIXTURE_GENERATOR_V1_DO_NOT_SHIP_IN_PROD';

export const SYNTHETIC_FIXTURE_BANNER = 'SYNTHETIC FIXTURE — NOT MODEL OUTPUT';

export interface DevSyntheticFixtureBundle {
  icData: MomIcV1;
  icSummary: IcValidationSummary;
  packedRollout: PackedRollout;
  diagnostics: RolloutDiagnostics;
  inferenceMs: number;
  roundTripMs: number;
  modelName: string;
}

/**
 * Generates a deterministic, clearly labeled synthetic 10-step rollout bundle
 * strictly for local UI development when `VITE_ENABLE_FIXTURE=true`.
 * Never invoked automatically and never substituted for a failed backend call.
 */
export function generateDevSyntheticFixture(): DevSyntheticFixtureBundle {
  const lat = Array.from({ length: GRID_SPEC.rows }, (_, i) => GRID_SPEC.latMin + i);
  const lon = Array.from({ length: GRID_SPEC.cols }, (_, i) => GRID_SPEC.lonMin + i);

  const landSeaMask = Array.from({ length: GRID_SPEC.rows }, (_, r) => {
    const la = lat[r];
    return Array.from({ length: GRID_SPEC.cols }, (_, c) => {
      const lo = lon[c];
      // Simple synthetic geometric land indicator for dev testing only (not real geography).
      const inNorthernBlock = la >= 22.5 && lo >= 68.5 && lo <= 97.5;
      const inPeninsula = la >= 8.5 && la < 22.5 && lo >= 74.5 && lo <= 80.5 + (la - 8.5) * 0.45;
      return inNorthernBlock || inPeninsula ? 1 : 0;
    });
  });

  const makeState = (dayOffset: number): number[][][] => {
    const t2m: number[][] = [];
    const tp: number[][] = [];
    const u10: number[][] = [];
    const v10: number[][] = [];
    const msl: number[][] = [];
    const tcwv: number[][] = [];

    for (let r = 0; r < GRID_SPEC.rows; r += 1) {
      const la = lat[r];
      const t2mRow: number[] = [];
      const tpRow: number[] = [];
      const u10Row: number[] = [];
      const v10Row: number[] = [];
      const mslRow: number[] = [];
      const tcwvRow: number[] = [];

      for (let c = 0; c < GRID_SPEC.cols; c += 1) {
        const lo = lon[c];
        const wave = Math.sin((lo - 65) * 0.14 + dayOffset * 0.45);
        const bobCore = Math.exp(
          -(((la - (15.5 + dayOffset * 0.55)) / 5.5) ** 2 + ((lo - (88.5 - dayOffset * 0.65)) / 6.5) ** 2),
        );
        const ghatBand = Math.exp(
          -(((la - 14.5) / 5.0) ** 2 + ((lo - 74.5) / 2.2) ** 2),
        );

        const tempK = 304.5 - Math.max(0, la - 24) * 0.72 + (landSeaMask[r][c] ? 1.8 : -1.2) - bobCore * 3.1 + wave * 0.6;
        const rainMm = Math.max(0, 1.2 + bobCore * 42.0 + ghatBand * 24.0 + Math.max(0, wave) * 3.5);
        const uVal = 6.2 * Math.exp(-(((la - 14.0) / 8.0) ** 2)) + wave * 1.4 - bobCore * 2.5;
        const vVal = 3.1 * Math.exp(-(((la - 16.0) / 9.0) ** 2)) + bobCore * 4.2 + Math.cos(dayOffset * 0.35) * 0.8;
        const mslPa = 100950 - bobCore * 920 - Math.max(0, 26 - Math.abs(la - 23)) * 18;
        const tcwvKg = 34.0 + bobCore * 26.0 + ghatBand * 12.0 + (1 - Math.max(0, la - 25) / 15) * 14.0;

        t2mRow.push(Number(tempK.toFixed(3)));
        tpRow.push(Number(rainMm.toFixed(3)));
        u10Row.push(Number(uVal.toFixed(3)));
        v10Row.push(Number(vVal.toFixed(3)));
        mslRow.push(Number(mslPa.toFixed(1)));
        tcwvRow.push(Number(tcwvKg.toFixed(2)));
      }

      t2m.push(t2mRow);
      tp.push(tpRow);
      u10.push(u10Row);
      v10.push(v10Row);
      msl.push(mslRow);
      tcwv.push(tcwvRow);
    }

    return [t2m, tp, u10, v10, msl, tcwv];
  };

  const icData: MomIcV1 = {
    schema: 'mom-ic-v1',
    label: SYNTHETIC_FIXTURE_BANNER,
    source_note: `Dev-only synthetic fixture (${SYNTHETIC_FIXTURE_BUILD_SENTINEL}) — not real ERA5 data or model output`,
    doy_sincos: [0.2225, -0.9749],
    channels: ['t2m', 'tp', 'u10', 'v10', 'msl', 'tcwv'],
    grid: { lat, lon },
    init_states: [makeState(-2), makeState(-1), makeState(0)],
    static: { land_sea_mask: landSeaMask },
  };

  const validated = validateMomIcObject(icData, {
    fileName: 'SYNTHETIC-DEV-FIXTURE.mom-ic-v1.json',
    fileSizeBytes: 0,
  });

  if (!validated.ok) {
    throw new Error(`Internal dev fixture failed validation: ${validated.errors.join('; ')}`);
  }

  const rolloutNested = Array.from({ length: GRID_SPEC.maxForecastSteps }, (_, step) =>
    makeState(step + 1),
  );

  return {
    icData: validated.data,
    icSummary: validated.summary,
    packedRollout: packRollout(rolloutNested),
    diagnostics: inspectRollout(rolloutNested),
    inferenceMs: 0,
    roundTripMs: 0,
    modelName: SYNTHETIC_FIXTURE_BANNER,
  };
}
