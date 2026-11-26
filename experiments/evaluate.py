import numpy as np
import xarray as xr
import torch

from models.weather_model import WeatherNet, predict_next

DATA_PATH = "india_climate_train.nc"
CHECKPOINT = "models/weather_checkpoint.pt"
CHANNELS = ["t2m", "tp", "u10", "v10", "msl", "tcwv"]


def main():
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    ckpt = torch.load(CHECKPOINT, map_location="cpu", weights_only=False)

    mean = np.array(ckpt["mean"], dtype=np.float32).reshape(1, 6, 1, 1)
    std = np.array(ckpt["std"], dtype=np.float32).reshape(1, 6, 1, 1)

    ds = xr.open_dataset(DATA_PATH)
    raw = ds["data"].values.astype(np.float32)
    years = ds.time.dt.year.values
    doy = ds.time.dt.dayofyear.values
    ds.close()

    normalized = (raw - mean) / std

    lat = torch.linspace(-1, 1, 32, device=device).view(1, 1, 32, 1)
    lon = torch.linspace(-1, 1, 36, device=device).view(1, 1, 1, 36)

    model = WeatherNet(width=ckpt["width"]).to(device)
    model.load_state_dict(ckpt["model_state"])
    model.eval()

    idx = np.where(years == 2021)[0]
    idx = idx[idx >= 3]

    model_errors = []
    persistence_errors = []

    with torch.no_grad():
        for start in range(0, len(idx), 16):
            batch_idx = idx[start:start + 16]

            context = np.stack([normalized[i-3:i] for i in batch_idx])
            target = np.stack([raw[i] for i in batch_idx])
            persistence = np.stack([raw[i-1] for i in batch_idx])

            context = torch.from_numpy(context).to(device)
            days = torch.tensor(doy[batch_idx], device=device)

            pred_norm = predict_next(model, context, days, lat, lon)
            pred_norm = pred_norm.cpu().numpy()

            pred_raw = pred_norm * std + mean

            model_errors.append((pred_raw - target) ** 2)
            persistence_errors.append((persistence - target) ** 2)

    model_rmse = np.sqrt(np.concatenate(model_errors).mean(axis=(0, 2, 3)))
    persistence_rmse = np.sqrt(
        np.concatenate(persistence_errors).mean(axis=(0, 2, 3))
    )

    print("\n2021 ONE-DAY FORECAST COMPARISON")
    print("=" * 58)
    print(f"{'Channel':10s} {'Model RMSE':>14s} {'Persistence':>14s} {'Change':>12s}")

    for name, m, p in zip(CHANNELS, model_rmse, persistence_rmse):
        change = (1 - m / p) * 100 if p else 0
        print(f"{name:10s} {m:14.4f} {p:14.4f} {change:11.2f}%")

    print("\nPositive change = model RMSE lower than persistence.")
    print("Negative change = model RMSE higher than persistence.")


if __name__ == "__main__":
    main()
