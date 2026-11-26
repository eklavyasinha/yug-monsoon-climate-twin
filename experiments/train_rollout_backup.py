import os
os.environ.setdefault("OMP_NUM_THREADS", "4")

import numpy as np
import xarray as xr
import torch
import torch.nn.functional as F

from models.weather_model import WeatherNet, predict_next

DATA_PATH = "india_climate_train.nc"
BEST = "models/weather_rollout_best.pt"

torch.manual_seed(42)
np.random.seed(42)


def make_windows(years, first_year, last_year, horizon=10, stride=5):
    indices = []
    for t in range(3, len(years) - horizon + 1, stride):
        if years[t] >= first_year and years[t+horizon-1] <= last_year:
            indices.append(t)
    return np.asarray(indices, dtype=np.int64)


def run_rollout(model, context, start_days, normalized, doy, lat, lon, horizon):
    predictions = []
    loss_list = []

    for step in range(horizon):
        current_day = torch.tensor(
            doy[start_days + step], device=context.device
        )

        pred = predict_next(model, context, current_day, lat, lon)
        target = torch.from_numpy(
            normalized[start_days + step]
        ).to(context.device)

        loss_list.append(F.mse_loss(pred, target))
        predictions.append(pred)

        context = torch.cat([context[:, 1:], pred.unsqueeze(1)], dim=1)

    return predictions, loss_list


def main():
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    print("Training device:", device)

    ds = xr.open_dataset(DATA_PATH)
    raw = ds["data"].values.astype(np.float32)
    years = ds.time.dt.year.values
    doy = ds.time.dt.dayofyear.values
    ds.close()

    train_raw = raw[years <= 2019]
    mean = train_raw.mean(axis=(0, 2, 3), keepdims=True)
    std = np.maximum(train_raw.std(axis=(0, 2, 3), keepdims=True), 1e-6)
    normalized = ((raw - mean) / std).astype(np.float32)

    train_windows = make_windows(years, 2005, 2019, 10, 5)
    val_windows = make_windows(years, 2020, 2020, 10, 5)

    lat = torch.linspace(-1, 1, 32, device=device).view(1, 1, 32, 1)
    lon = torch.linspace(-1, 1, 36, device=device).view(1, 1, 1, 36)

    model = WeatherNet(width=48).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.0005, weight_decay=1e-4)

    batch_size = 8
    epochs = 8
    best_val = float("inf")

    print("Training windows:", len(train_windows))
    print("Validation windows:", len(val_windows))

    for epoch in range(epochs):
        model.train()
        np.random.shuffle(train_windows)
        losses = []

        for start in range(0, len(train_windows), batch_size):
            batch = train_windows[start:start+batch_size]
            if len(batch) == 0:
                continue

            context_np = np.stack([normalized[t-3:t] for t in batch])
            context = torch.from_numpy(context_np).to(device)

            _, step_losses = run_rollout(
                model, context, batch, normalized, doy, lat, lon, 10
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
                context_np = np.stack([normalized[t-3:t] for t in batch])
                context = torch.from_numpy(context_np).to(device)

                _, step_losses = run_rollout(
                    model, context, batch, normalized, doy, lat, lon, 10
                )
                val_losses.append(torch.stack(step_losses).mean().item())

        train_mean = np.mean(losses)
        val_mean = np.mean(val_losses)

        print(
            f"Epoch {epoch+1}/{epochs} | "
            f"Train: {train_mean:.5f} | Validation: {val_mean:.5f}"
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
            print("  -> Best checkpoint saved")

    print("Best validation loss:", best_val)
    print("Best model:", BEST)


if __name__ == "__main__":
    main()
