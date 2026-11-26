import numpy as np
import xarray as xr
import torch

from models.weather_model import WeatherNet, predict_next

DATA_PATH = "india_climate_train.nc"

BASELINE_PATH = "models/weather_rollout_best.pt"
RAIN_PATH = "models/weather_rollout_rain_best.pt"

CHANNELS = ["t2m", "tp", "u10", "v10", "msl", "tcwv"]


def csi(pred, truth, threshold=10):
    pred_event = pred >= threshold
    true_event = truth >= threshold

    tp = np.logical_and(pred_event, true_event).sum()
    fp = np.logical_and(pred_event, ~true_event).sum()
    fn = np.logical_and(~pred_event, true_event).sum()

    return float(tp / (tp + fp + fn)) if (tp + fp + fn) else 0.0


def load_model(path, device):
    ckpt = torch.load(path, map_location="cpu", weights_only=False)

    mean = np.array(ckpt["mean"], dtype=np.float32).reshape(1, 6, 1, 1)
    std = np.array(ckpt["std"], dtype=np.float32).reshape(1, 6, 1, 1)

    model = WeatherNet(width=ckpt["width"]).to(device)
    model.load_state_dict(ckpt["model_state"])
    model.eval()

    return model, mean, std


def evaluate(raw, years, doy, starts, device):
    baseline, b_mean, b_std = load_model(BASELINE_PATH, device)
    rain_model, r_mean, r_std = load_model(RAIN_PATH, device)

    lat = torch.linspace(-1, 1, 32, device=device).view(1, 1, 32, 1)
    lon = torch.linspace(-1, 1, 36, device=device).view(1, 1, 1, 36)

    model_sq = np.zeros((10, 6), dtype=np.float64)
    pers_sq = np.zeros((10, 6), dtype=np.float64)

    collected = {4: [], 8: []}
    truths = {4: [], 8: []}

    rain_min = float("inf")
    temp_min = float("inf")
    temp_max = float("-inf")

    count = 0

    with torch.no_grad():
        for offset in range(0, len(starts), 8):
            batch = np.asarray(starts[offset:offset + 8])

            # Raw-unit context shared by both networks.
            context_raw = raw[batch - 3].copy()
            context_raw = np.stack(
                [raw[t - 3:t] for t in batch]
            )

            last = raw[batch - 1].copy()

            for lead in range(10):
                days = torch.tensor(
                    doy[batch + lead], device=device
                )

                # Each network gets context normalized using its own stats.
                b_context = torch.from_numpy(
                    ((context_raw - b_mean) / b_std).astype(np.float32)
                ).to(device)

                r_context = torch.from_numpy(
                    ((context_raw - r_mean) / r_std).astype(np.float32)
                ).to(device)

                b_pred_norm = predict_next(
                    baseline, b_context, days, lat, lon
                )

                r_pred_norm = predict_next(
                    rain_model, r_context, days, lat, lon
                )

                b_pred_raw = (
                    b_pred_norm.cpu().numpy() * b_std + b_mean
                )

                r_pred_raw = (
                    r_pred_norm.cpu().numpy() * r_std + r_mean
                )

                # Hybrid: baseline for 5 channels, rain-aware for rainfall.
                hybrid = b_pred_raw.copy()
                hybrid[:, 1:2] = r_pred_raw[:, 1:2]

                # Enforce physical non-negative rainfall.
                hybrid[:, 1] = np.maximum(hybrid[:, 1], 0.0)

                target = raw[batch + lead]

                model_sq[lead] += (
                    (hybrid - target) ** 2
                ).sum(axis=(0, 2, 3))

                pers_sq[lead] += (
                    (last - target) ** 2
                ).sum(axis=(0, 2, 3))

                if lead + 1 in (4, 8):
                    key = lead + 1
                    collected[key].append(hybrid.copy())
                    truths[key].append(target.copy())

                rain_min = min(
                    rain_min, float(hybrid[:, 1].min())
                )

                temp_min = min(
                    temp_min, float(hybrid[:, 0].min())
                )

                temp_max = max(
                    temp_max, float(hybrid[:, 0].max())
                )

                # Shared hybrid raw context fed into BOTH networks.
                context_raw = np.concatenate(
                    [context_raw[:, 1:], hybrid[:, None]],
                    axis=1
                )

                last = hybrid

            count += len(batch) * 32 * 36

    model_rmse = np.sqrt(model_sq / count)
    pers_rmse = np.sqrt(pers_sq / count)

    print("\n" + "=" * 75)
    print("HYBRID MODEL: BASELINE + RAIN-AWARE TP")
    print("=" * 75)

    for lead in range(10):
        print(f"\nDay {lead + 1}")

        for c, channel in enumerate(CHANNELS):
            improvement = (
                1 - model_rmse[lead, c] / pers_rmse[lead, c]
            ) * 100

            print(
                f" {channel:5s}: {model_rmse[lead, c]:.4f} "
                f"| persistence {pers_rmse[lead, c]:.4f} "
                f"| improvement {improvement:+.2f}%"
            )

    for lead in (4, 8):
        pred = np.concatenate(collected[lead])
        truth = np.concatenate(truths[lead])

        variance_ratio = (
            pred.var(axis=(0, 2, 3)) /
            np.maximum(truth.var(axis=(0, 2, 3)), 1e-12)
        )

        print(f"\nDay {lead} quality:")
        print("Rain CSI:", round(
            csi(pred[:, 1], truth[:, 1]), 5
        ))
        print("Rain variance ratio:", round(
            float(variance_ratio[1]), 5
        ))

        print("All-channel variance ratios:")
        for channel, ratio in zip(CHANNELS, variance_ratio):
            print(f"  {channel}: {ratio:.4f}")

    print("\nRain minimum:", rain_min)
    print("Temperature range:", temp_min, temp_max)


def main():
    device = torch.device(
        "mps" if torch.backends.mps.is_available() else "cpu"
    )

    print("Device:", device)

    ds = xr.open_dataset(DATA_PATH)
    raw = ds["data"].values.astype(np.float32)
    years = ds.time.dt.year.values
    doy = ds.time.dt.dayofyear.values
    ds.close()

    starts = [
        t for t in range(3, len(raw) - 10, 5)
        if years[t] == 2021
        and np.all(years[t:t + 10] == 2021)
    ]

    print("Evaluation windows:", len(starts))

    evaluate(raw, years, doy, starts, device)


if __name__ == "__main__":
    main()
