import { z } from 'zod';
import { GRID_SPEC } from '../config/projectFacts';

const finiteNumber = z
  .number({ error: 'Expected finite number' })
  .refine((v) => Number.isFinite(v), {
    message: 'Must be a finite number (NaN/Inf prohibited by contract)',
  });

const row36 = z
  .array(finiteNumber)
  .length(GRID_SPEC.cols, `Expected ${GRID_SPEC.cols} longitude columns`);

const grid32x36 = z
  .array(row36)
  .length(GRID_SPEC.rows, `Expected ${GRID_SPEC.rows} latitude rows`);

const state6x32x36 = z
  .array(grid32x36)
  .length(GRID_SPEC.channelCount, `Expected ${GRID_SPEC.channelCount} atmospheric channels`);

export const healthResponseSchema = z
  .object({
    status: z.string(),
    model_name: z.string().optional(),
  })
  .passthrough();

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const simulateRequestSchema = z
  .object({
    init_states: z
      .array(state6x32x36)
      .length(GRID_SPEC.historySteps, `init_states must have ${GRID_SPEC.historySteps} frames`),
    doy_sincos: z.tuple([finiteNumber, finiteNumber]),
    steps: z
      .number()
      .int('steps must be an integer')
      .min(1, 'steps must be at least 1')
      .max(GRID_SPEC.maxForecastSteps, `steps must be at most ${GRID_SPEC.maxForecastSteps}`),
    perturbation: z.union([z.null(), state6x32x36]),
  })
  .strict();

export type SimulateRequestPayload = z.infer<typeof simulateRequestSchema>;

export function createSimulateResponseSchema(expectedSteps: number) {
  return z
    .object({
      rollout: z
        .array(state6x32x36)
        .length(expectedSteps, `rollout must contain exactly ${expectedSteps} forecast step(s)`),
      inference_ms: finiteNumber.refine((v) => v >= 0, {
        message: 'inference_ms must be a non-negative finite number',
      }),
    })
    .strict();
}

export interface SimulateResponsePayload {
  rollout: number[][][][];
  inference_ms: number;
}

export interface RolloutDiagnostics {
  shape: [number, number, number, number];
  negativePrecipitationCount: number;
  minPrecipitation: number;
  outOfContractTempCount: number;
  minTempK: number;
  maxTempK: number;
  firstStepFirstCell: [number, number, number, number, number, number];
}

/**
 * Inspects a validated rollout for contract flags (such as negative precipitation)
 * without ever clipping, repairing, or mutating the returned tensor.
 */
export function inspectRollout(rollout: number[][][][]): RolloutDiagnostics {
  const steps = rollout.length;
  let negativePrecipitationCount = 0;
  let minPrecipitation = Number.POSITIVE_INFINITY;
  let outOfContractTempCount = 0;
  let minTempK = Number.POSITIVE_INFINITY;
  let maxTempK = Number.NEGATIVE_INFINITY;

  for (let s = 0; s < steps; s += 1) {
    const t2m = rollout[s][0];
    const tp = rollout[s][1];
    for (let r = 0; r < GRID_SPEC.rows; r += 1) {
      for (let c = 0; c < GRID_SPEC.cols; c += 1) {
        const temp = t2m[r][c];
        if (temp < minTempK) minTempK = temp;
        if (temp > maxTempK) maxTempK = temp;
        if (temp < 233.15 || temp > 333.15) {
          outOfContractTempCount += 1;
        }

        const rain = tp[r][c];
        if (rain < minPrecipitation) minPrecipitation = rain;
        if (rain < 0) {
          negativePrecipitationCount += 1;
        }
      }
    }
  }

  const firstStepFirstCell: [number, number, number, number, number, number] = [
    rollout[0][0][0][0],
    rollout[0][1][0][0],
    rollout[0][2][0][0],
    rollout[0][3][0][0],
    rollout[0][4][0][0],
    rollout[0][5][0][0],
  ];

  return {
    shape: [steps, GRID_SPEC.channelCount, GRID_SPEC.rows, GRID_SPEC.cols],
    negativePrecipitationCount,
    minPrecipitation,
    outOfContractTempCount,
    minTempK,
    maxTempK,
    firstStepFirstCell,
  };
}
