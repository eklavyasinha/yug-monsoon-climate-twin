# Multiverse of Monsoon — India's Climate Digital Twin

A locally trained, autoregressive weather forecasting model designed for 10-day climate-state prediction and localized perturbation / shock simulation over the India grid.

## Overview

Multiverse of Monsoon explores short-range climate forecasting over India using a compact convolutional neural network. The system predicts future climate states from recent atmospheric observations and supports controlled perturbations to study model response.

## Forecast Variables

The model predicts six climate variables:

- `t2m` — 2-metre temperature (K)
- `tp` — precipitation (mm/day)
- `u10` — 10-metre zonal wind (m/s)
- `v10` — 10-metre meridional wind (m/s)
- `msl` — mean sea-level pressure (Pa)
- `tcwv` — total column water vapour (kg/m²)

The spatial domain is a 32 × 36 India grid.

## Model Architecture

- Convolutional neural network
- Residual convolution blocks
- Width: 48
- Multi-frame temporal context
- Seasonal features (day-of-year sin/cos)
- Spatial latitude/longitude features
- Autoregressive 10-day rollout

The model predicts normalized state deltas, which are added to the latest input state. Predicted states are fed back into the model during rollout.

## Forecasting & Shock Simulation

The inference pipeline supports:

- 10-day autoregressive forecasts
- Warm-ocean perturbation experiments
- Monsoon-stall perturbation experiments
- Null perturbation checks
- Physical-unit input and output
- Nonnegative precipitation output enforcement

Perturbation tests are experimental sensitivity diagnostics and are not proof of physically validated causal climate responses.

## Local Evaluation

The model was evaluated locally against persistence forecasting on 2021 evaluation windows.

In one 10-day rollout evaluation, the baseline model showed positive RMSE improvement against persistence across all six variables.

Reported Day-10 RMSE improvement in that evaluation:

| Variable | Improvement vs Persistence |
|---|---:|
| t2m | +6.23% |
| tp | +30.08% |
| u10 | +25.73% |
| v10 | +24.00% |
| msl | +21.01% |
| tcwv | +24.14% |

These are locally measured experimental results, not official hackathon scores or blind-test results.

Additional local diagnostics included rainfall CSI, precipitation variance, autoregressive rollout evaluation and perturbation-response checks.

## API

The inference server exposes:

- `GET /health`
- `POST /simulate`

The `/simulate` endpoint accepts initial climate states, seasonal features, rollout steps and an optional perturbation.

Expected rollout length: 10 steps.

## Running Locally

Create and activate a Python virtual environment, install the project dependencies, and run:

```bash
python serve.py --port 8000
