import os
os.environ.setdefault("OMP_NUM_THREADS", "4")

import numpy as np
import xarray as xr
import torch
import torch.nn.functional as F

from models.weather_model import WeatherNet, predict_next

DATA_PATH = "india_climate_train.nc"
CHECKPOINT = "models/weather_checkpoint.pt"

torch.manual_seed(42)
np.random.seed(42)


def main():
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    print("Training device:", device)

    ds = xr.open_dataset(DATA_PATH)
    raw = ds["data"].values.astype(np.float32)
    years = ds.time.dt.year.values
    doy = ds.time.dt.dayofyear.values
    ds.close()

    # Target-date indices: 3 preceding days provide the input.
    train_idx = np.where((years >= 2005) & (years <= 2019))[0]
    val_idx = np.where(years == 2020)[0]

    # Remove indices that do not have three preceding days.
    train_idx = train_idx[train_idx >= 3]
    val_idx = val_idx[val_idx >= 3]

    # Statistics derived strictly from training-period data.
    train_raw = raw[years <= 2019]
    mean = train_raw.mean(axis=(0, 2, 3), keepdims=True)
    std = train_raw.std(axis=(0, 2, 3), keepdims=True)
    std = np.maximum(std, 1e-6)

    normalized = (raw - mean) / std

    lat = torch.linspace(-1, 1, 32, device=device).view(1, 1, 32, 1)
    lon = torch.linspace(-1, 1, 36, device=device).view(1, 1, 1, 36)

    model = WeatherNet(width=48).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.001, weight_decay=1e-4)

    batch_size = 16
    epochs = 15

    print("Training samples:", len(train_idx))
    print("Validation samples:", len(val_idx))
    print("Model parameters:", sum(p.numel() for p in model.parameters()))

    for epoch in range(epochs):
        model.train()
        np.random.shuffle(train_idx)
        train_losses = []

        for start in range(0, len(train_idx), batch_size):
            idx = train_idx[start:start + batch_size]
            if len(idx) == 0:
                continue

            context = np.stack([normalized[i-3:i] for i in idx])
            target = np.stack([normalized[i] for i in idx])

            context = torch.from_numpy(context).to(device)
            target = torch.from_numpy(target).to(device)
            day = torch.tensor(doy[idx], device=device)

            pred = predict_next(model, context, day, lat, lon)

            # Equal normalized channel weighting for initial training.
            loss = F.mse_loss(pred, target)

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            train_losses.append(loss.item())

        model.eval()
        val_losses = []

        with torch.no_grad():
            for start in range(0, len(val_idx), batch_size):
                idx = val_idx[start:start + batch_size]
                context = np.stack([normalized[i-3:i] for i in idx])
                target = np.stack([normalized[i] for i in idx])

                context = torch.from_numpy(context).to(device)
                target = torch.from_numpy(target).to(device)
                day = torch.tensor(doy[idx], device=device)

                pred = predict_next(model, context, day, lat, lon)
                val_losses.append(F.mse_loss(pred, target).item())

        print(
            f"Epoch {epoch+1:02d}/{epochs} | "
            f"Train MSE: {np.mean(train_losses):.5f} | "
            f"Validation MSE: {np.mean(val_losses):.5f}"
        )

    os.makedirs("models", exist_ok=True)
    torch.save(
        {
            "model_state": model.cpu().state_dict(),
            "mean": mean.reshape(6).tolist(),
            "std": std.reshape(6).tolist(),
            "width": 48,
        },
        CHECKPOINT,
    )

    print("\nCheckpoint saved:", CHECKPOINT)
    print("Training complete.")

if __name__ == "__main__":
    main()
