import os
os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("MKL_NUM_THREADS", "4")

import time
import argparse
import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

from models.weather_model import WeatherNet, predict_next
from monsoon_r1 import contract as C

torch.set_num_threads(4)

ROOT = os.path.dirname(os.path.abspath(__file__))
CHECKPOINT = os.path.join(ROOT, "models", "weather_rollout_best.pt")
DEVICE = torch.device("cpu")

ckpt = torch.load(CHECKPOINT, map_location="cpu", weights_only=False)

MEAN = np.asarray(ckpt["mean"], dtype=np.float32).reshape(1, 6, 1, 1)
STD = np.asarray(ckpt["std"], dtype=np.float32).reshape(1, 6, 1, 1)

MODEL = WeatherNet(width=ckpt["width"])
MODEL.load_state_dict(ckpt["model_state"])
MODEL.to(DEVICE)
MODEL.eval()

LAT = torch.linspace(-1, 1, 32).view(1, 1, 32, 1)
LON = torch.linspace(-1, 1, 36).view(1, 1, 1, 36)

RAIN_FLOOR_NORM = float(-MEAN.reshape(6)[1] / STD.reshape(6)[1])

T_NORM_MIN = float((233.15 - MEAN[0, 0, 0, 0]) / STD[0, 0, 0, 0])
T_NORM_MAX = float((333.15 - MEAN[0, 0, 0, 0]) / STD[0, 0, 0, 0])

app = FastAPI(title="Multiverse of Monsoon")


class SimulateRequest(BaseModel):
    init_states: object
    doy_sincos: list
    steps: int = 10
    perturbation: object | None = None


def decode_input(value, expected_shape, name):
    try:
        arr = C.decode_array(value, expected_shape)
        arr = np.asarray(arr, dtype=np.float32)
    except Exception as e:
        raise HTTPException(400, f"Invalid {name}: {str(e)[:150]}")

    if not np.isfinite(arr).all():
        raise HTTPException(400, f"{name} contains NaN or Inf")

    return arr


@app.post("/health")
def health():
    return {
        "status": "ready",
        "model_name": "WeatherNet-Rollout-Baseline"
    }


@app.post("/simulate")
def simulate(req: SimulateRequest):
    start = time.perf_counter()

    if req.steps < 1 or req.steps > 10:
        raise HTTPException(400, "steps must be between 1 and 10")

    states = decode_input(
        req.init_states, (3, 6, 32, 36), "init_states"
    )

    if len(req.doy_sincos) != 2:
        raise HTTPException(400, "doy_sincos must contain [sin, cos]")

    try:
        sin_val, cos_val = map(float, req.doy_sincos)
    except Exception:
        raise HTTPException(400, "Invalid doy_sincos")

    if not np.isfinite([sin_val, cos_val]).all():
        raise HTTPException(400, "doy_sincos contains NaN or Inf")

    if req.perturbation is not None:
        perturbation = decode_input(
            req.perturbation, (6, 32, 36), "perturbation"
        )
        states[-1] += perturbation

    context_np = (states - MEAN) / STD
    context = torch.from_numpy(context_np).unsqueeze(0)

    angle = np.arctan2(sin_val, cos_val)
    doy = float((angle / (2 * np.pi) * 365.0) % 365.0)

    outputs = []

    with torch.no_grad():
        for step in range(req.steps):
            future_doy = (doy + step + 1) % 365.0

            doy_tensor = torch.tensor(
                [future_doy], dtype=torch.float32
            )

            pred = predict_next(
                MODEL, context, doy_tensor, LAT, LON
            )

            # Enforce nonnegative precipitation.
            pred[:, 1:2] = pred[:, 1:2].clamp(
                min=RAIN_FLOOR_NORM
            )

            # Keep temperature within the contract bounds.
            pred[:, 0:1] = pred[:, 0:1].clamp(
                min=T_NORM_MIN, max=T_NORM_MAX
            )

            pred_raw = pred.cpu().numpy() * STD + MEAN
            outputs.append(pred_raw[0].tolist())

            # Autoregressive context update.
            context = torch.cat(
                [context[:, 1:], pred.unsqueeze(1)], dim=1
            )

    elapsed_ms = (time.perf_counter() - start) * 1000.0

    return {
        "rollout": outputs,
        "inference_ms": float(elapsed_ms)
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    uvicorn.run(app, host="0.0.0.0", port=args.port)
