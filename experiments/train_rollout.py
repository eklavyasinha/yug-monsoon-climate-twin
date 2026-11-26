import os
os.environ.setdefault("OMP_NUM_THREADS", "4")

import numpy as np
import xarray as xr
import torch
import torch.nn.functional as F

from models.weather_model import WeatherNet, predict_next

DATA_PATH = "india_climate_train.nc"
BEST = "models/weather_rollout_rain_best.pt"

torch.manual_seed(42)
np.random.seed(42)


def make_windows(years, first_year, last_year, horizon=10, stride=5):
    indices = []
    for t in range(3, len(years) - horizon + 1, stride):
        if years[t] >= first_year and years[t+horizon-1] <= last_year:
            indices.append(t)
    return np.asarray(indices, dtype=np.int64)


def run_rollout(model, context, start_days, normalized, raw, doy,
                lat, lon, horizon, rain_floor):

    step_losses = []

    for step in range(horizon):
        days = torch.tensor(
            doy[start_days + step], device=context.device
        )

        pred = predict_next(model, context, days, lat, lon)

        # Rainfall physical floor: zero mm/day.
        pred = torch.cat([
            pred[:, :1],
            pred[:, 1:2].clamp(min=rain_floor),
            pred[:, 2:]
        ], dim=1)

        target = torch.from_numpy(
            normalized[start_days + step]
        ).to(context.device)

        target_raw = torch.from_numpy(
            raw[start_days + step]
        ).to(context.device)

        # Base loss across all six weather channels.
        base_loss = F.mse_loss(pred, target)

        # Intensity-weighted rainfall loss.
        rain_pred = pred[:, 1]
        rain_target = target[:, 1]

        weights = torch.ones_like(rain_target)
        weights = weights + 1.5 * (target_raw[:, 1] >= 10)
        weights = weights + 2.0 * (target_raw[:, 1] >= 20)

        rain_loss = (
            weights * (rain_pred - rain_target) ** 2
        ).mean()

        # Match rainfall spatial variance per sample.
        pred_var = rain_pred.var(dim=(1, 2), unbiased=False)
        true_var = rain_target.var(dim=(1, 2), unbiased=False)

        variance_loss = F.mse_loss(
            pred_var, true_var
        )

        loss = base_loss + 0.30 * rain_loss + 0.15 * variance_loss
        step_losses.append(loss)

        context = torch.cat(
            [context[:, 1:], pred.unsqueeze(1)], dim=1
        )

    return step_losses


def main():
    device = torch.device(
        "mps" if torch.backends.mps.is_available() else "cpu"
    )
    print("Training device:", device)

    ds = xr.open_dataset(DATA_PATH)
    raw = ds["data"].values.astype(np.float32)
    years = ds.time.dt.year.values
    doy = ds.time.dt.dayofyear.values
    ds.close()

    train_raw = raw[years <= 2019]
    mean = train_raw.mean(axis=(0, 2, 3), keepdims=True)
    std = np.maximum(
        train_raw.std(axis=(0, 2, 3), keepdims=True), 1e-6
    )

    normalized = ((raw - mean) / std).astype(np.float32)

    rain_floor = float(-mean.reshape(6)[1] / std.reshape(6)[1])

    train_windows = make_windows(years, 2005, 2019, 10, 5)
    val_windows = make_windows(years, 2020, 2020, 10, 5)

    lat = torch.linspace(-1, 1, 32, device=device).view(1, 1, 32, 1)
    lon = torch.linspace(-1, 1, 36, device=device).view(1, 1, 1, 36)

    model = WeatherNet(width=48).to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=0.00035, weight_decay=1e-4
    )

    batch_size = 8
    epochs = 10
    best_val = float("inf")

    print("Training windows:", len(train_windows))
    print("Validation windows:", len(val_windows))
    print("Rain normalized floor:", rain_floor)

    for epoch in range(epochs):
        model.train()
        np.random.shuffle(train_windows)
        losses = []

        for start in range(0, len(train_windows), batch_size):
            batch = train_windows[start:start+batch_size]
            if len(batch) == 0:
                continue

            context_np = np.stack([
                normalized[t-3:t] for t in batch
            ])

            context = torch.from_numpy(context_np).to(device)

            step_losses = run_rollout(
                model, context, batch, normalized, raw, doy,
                lat, lon, 10, rain_floor
            )

            loss = torch.stack(step_losses).mean()

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            losses.append(loss.item())

        model.eval()
        val_losses = []

        with torch.no_grad():
            for start in range(0, len(val_windows), batch_size):
                batch = val_windows[start:start+batch_size]

                context_np = np.stack([
                    normalized[t-3:t] for t in batch
                ])

                context = torch.from_numpy(context_np).to(device)

                step_losses = run_rollout(
                    model, context, batch, normalized, raw, doy,
                    lat, lon, 10, rain_floor
                )

                val_losses.append(
                    torch.stack(step_losses).mean().item()
                )

        train_mean = np.mean(losses)
        val_mean = np.mean(val_losses)

        print(
            f"Epoch {epoch+1}/{epochs} | "
            f"Train: {train_mean:.5f} | "
            f"Validation: {val_mean:.5f}"
        )

        if val_mean < best_val:
            best_val = val_mean

            torch.save(
                {
                    "model_state": model.cpu().state_dict(),
                    "mean": mean.reshape(6).tolist(),
                    "std": std.reshape(6).tolist(),
                    "width": 48,
                    "horizon": 10,
                },
                BEST,
            )

            model.to(device)
            print(" -> Best rainfall-aware checkpoint saved")

    print("Best validation loss:", best_val)
    print("Saved:", BEST)


if __name__ == "__main__":
    main()
