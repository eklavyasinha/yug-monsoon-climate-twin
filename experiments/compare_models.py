import numpy as np
import xarray as xr
import torch

from models.weather_model import WeatherNet, predict_next

DATA_PATH = "india_climate_train.nc"
MODELS = {
    "Baseline": "models/weather_rollout_best.pt",
    "Rain-aware": "models/weather_rollout_rain_best.pt",
}
CHANNELS = ["t2m", "tp", "u10", "v10", "msl", "tcwv"]


def csi(pred, truth, threshold=10):
    pred_event = pred >= threshold
    true_event = truth >= threshold
    tp = np.logical_and(pred_event, true_event).sum()
    fp = np.logical_and(pred_event, ~true_event).sum()
    fn = np.logical_and(~pred_event, true_event).sum()
    return float(tp / (tp + fp + fn)) if (tp + fp + fn) else 0.0


def evaluate(name, checkpoint, raw, years, doy, starts, device):
    ckpt = torch.load(checkpoint, map_location="cpu", weights_only=False)
    mean = np.array(ckpt["mean"], dtype=np.float32).reshape(1, 6, 1, 1)
    std = np.array(ckpt["std"], dtype=np.float32).reshape(1, 6, 1, 1)
    normalized = (raw - mean) / std

    rain_floor = float(-mean.reshape(6)[1] / std.reshape(6)[1])

    lat = torch.linspace(-1, 1, 32, device=device).view(1, 1, 32, 1)
    lon = torch.linspace(-1, 1, 36, device=device).view(1, 1, 1, 36)

    model = WeatherNet(width=ckpt["width"]).to(device)
    model.load_state_dict(ckpt["model_state"])
    model.eval()

    model_sq = np.zeros((10, 6), dtype=np.float64)
    pers_sq = np.zeros((10, 6), dtype=np.float64)

    collected = {4: [], 8: []}
    truths = {4: [], 8: []}
    negative_min = float("inf")
    temp_min = float("inf")
    temp_max = float("-inf")

    count = 0

    with torch.no_grad():
        for offset in range(0, len(starts), 8):
            batch = np.asarray(starts[offset:offset+8])

            context = torch.from_numpy(
                np.stack([normalized[t-3:t] for t in batch])
            ).to(device)

            last = raw[batch-1]

            for lead in range(10):
                days = torch.tensor(doy[batch+lead], device=device)
                pred_norm = predict_next(model, context, days, lat, lon)

                # Rain-aware checkpoint was trained with a physical rainfall floor.
                if name == "Rain-aware":
                    pred_norm = torch.cat([
                        pred_norm[:, :1],
                        pred_norm[:, 1:2].clamp(min=rain_floor),
                        pred_norm[:, 2:]
                    ], dim=1)

                pred = pred_norm.cpu().numpy() * std + mean
                target = raw[batch+lead]

                model_sq[lead] += ((pred-target)**2).sum(axis=(0, 2, 3))
                pers_sq[lead] += ((last-target)**2).sum(axis=(0, 2, 3))

                if lead+1 in (4, 8):
                    key = lead+1
                    collected[key].append(pred)
                    truths[key].append(target)

                negative_min = min(negative_min, float(pred[:, 1].min()))
                temp_min = min(temp_min, float(pred[:, 0].min()))
                temp_max = max(temp_max, float(pred[:, 0].max()))

                context = torch.cat(
                    [context[:, 1:], pred_norm.unsqueeze(1)], dim=1
                )

            count += len(batch) * 32 * 36

    model_rmse = np.sqrt(model_sq/count)
    pers_rmse = np.sqrt(pers_sq/count)

    print("\n" + "="*75)
    print(name)
    print("="*75)

    for lead in range(10):
        print(f"\nDay {lead+1}")
        for c, channel in enumerate(CHANNELS):
            improvement = (1-model_rmse[lead,c]/pers_rmse[lead,c])*100
            print(
                f" {channel:5s}: {model_rmse[lead,c]:.4f} "
                f"| persistence {pers_rmse[lead,c]:.4f} "
                f"| improvement {improvement:+.2f}%"
            )

    for lead in (4, 8):
        pred = np.concatenate(collected[lead])
        truth = np.concatenate(truths[lead])
        rain_pred = pred[:, 1]
        rain_true = truth[:, 1]

        variance_ratio = (
            pred.var(axis=(0,2,3)) /
            np.maximum(truth.var(axis=(0,2,3)), 1e-12)
        )

        print(f"\nDay {lead} quality:")
        print("Rain CSI:", round(csi(rain_pred, rain_true), 5))
        print("Rain variance ratio:", round(float(variance_ratio[1]), 5))
        print("All-channel variance ratios:")
        for channel, ratio in zip(CHANNELS, variance_ratio):
            print(f"  {channel}: {ratio:.4f}")

    print("\nRain minimum:", negative_min)
    print("Temperature range:", temp_min, temp_max)


def main():
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")

    ds = xr.open_dataset(DATA_PATH)
    raw = ds["data"].values.astype(np.float32)
    years = ds.time.dt.year.values
    doy = ds.time.dt.dayofyear.values
    ds.close()

    starts = [
        t for t in range(3, len(raw)-10, 5)
        if years[t] == 2021 and np.all(years[t:t+10] == 2021)
    ]

    print("Evaluation windows:", len(starts))

    for name, checkpoint in MODELS.items():
        evaluate(name, checkpoint, raw, years, doy, starts, device)


if __name__ == "__main__":
    main()
