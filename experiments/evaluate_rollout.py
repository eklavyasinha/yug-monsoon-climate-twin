import numpy as np
import xarray as xr
import torch

from models.weather_model import WeatherNet, predict_next

DATA_PATH = "india_climate_train.nc"
CHECKPOINT = "models/weather_rollout_best.pt"
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

    # Ten consecutive targets entirely inside 2021.
    starts = [
        t for t in range(3, len(raw) - 10)
        if years[t] == 2021 and np.all(years[t:t+10] == 2021)
    ]

    print("2021 windows:", len(starts))

    model_sq = np.zeros((10, 6), dtype=np.float64)
    persistence_sq = np.zeros((10, 6), dtype=np.float64)
    count = 0

    with torch.no_grad():
        for start in range(0, len(starts), 8):
            batch_starts = np.asarray(starts[start:start+8])

            context = torch.from_numpy(
                np.stack([normalized[t-3:t] for t in batch_starts])
            ).to(device)

            # Fixed persistence: repeat the last observed day.
            last = raw[batch_starts - 1]

            for lead in range(10):
                days = torch.tensor(
                    doy[batch_starts + lead], device=device
                )

                pred_norm = predict_next(model, context, days, lat, lon)
                pred_norm_np = pred_norm.cpu().numpy()
                pred_raw = pred_norm_np * std + mean

                target = raw[batch_starts + lead]

                model_sq[lead] += ((pred_raw - target) ** 2).sum(axis=(0, 2, 3))
                persistence_sq[lead] += ((last - target) ** 2).sum(axis=(0, 2, 3))

                # Autoregressive rollout.
                context = torch.cat(
                    [context[:, 1:], pred_norm.unsqueeze(1)], dim=1
                )

            count += len(batch_starts) * 32 * 36

    model_rmse = np.sqrt(model_sq / count)
    persistence_rmse = np.sqrt(persistence_sq / count)

    print("\n10-DAY ROLLOUT RMSE (2021)")
    print("=" * 75)

    for lead in range(10):
        print(f"\nDay {lead+1}")
        for c, name in enumerate(CHANNELS):
            m = model_rmse[lead, c]
            p = persistence_rmse[lead, c]
            improvement = (1 - m / p) * 100 if p else 0
            print(
                f"  {name:6s}: model={m:.4f} | "
                f"persistence={p:.4f} | improvement={improvement:+.2f}%"
            )

    print("\nPositive improvement = lower RMSE than persistence.")
    print("Negative improvement = worse than persistence.")


if __name__ == "__main__":
    main()
