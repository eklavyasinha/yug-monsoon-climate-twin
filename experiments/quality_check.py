import numpy as np
import xarray as xr
import torch

from models.weather_model import WeatherNet, predict_next

DATA_PATH = "india_climate_train.nc"
CHECKPOINT = "models/weather_rollout_best.pt"


def csi(pred, truth, threshold=10.0):
    pred_event = pred >= threshold
    true_event = truth >= threshold

    tp = np.logical_and(pred_event, true_event).sum()
    fp = np.logical_and(pred_event, ~true_event).sum()
    fn = np.logical_and(~pred_event, true_event).sum()

    denominator = tp + fp + fn
    return float(tp / denominator) if denominator else 0.0


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

    starts = [
        t for t in range(3, len(raw) - 10, 5)
        if years[t] == 2021 and np.all(years[t:t+10] == 2021)
    ]

    collected = {4: [], 8: []}
    truths = {4: [], 8: []}
    persistence = {4: [], 8: []}

    with torch.no_grad():
        for start in range(0, len(starts), 8):
            batch_idx = np.asarray(starts[start:start+8])

            context = torch.from_numpy(
                np.stack([normalized[t-3:t] for t in batch_idx])
            ).to(device)

            for lead in range(10):
                days = torch.tensor(doy[batch_idx + lead], device=device)
                pred_norm = predict_next(model, context, days, lat, lon)
                pred_raw = pred_norm.cpu().numpy() * std + mean

                if lead + 1 in (4, 8):
                    key = lead + 1
                    collected[key].append(pred_raw)
                    truths[key].append(raw[batch_idx + lead])
                    persistence[key].append(raw[batch_idx - 1])

                context = torch.cat(
                    [context[:, 1:], pred_norm.unsqueeze(1)], dim=1
                )

    print("\nQUALITY CHECK")
    print("=" * 55)

    for lead in (4, 8):
        pred = np.concatenate(collected[lead])
        truth = np.concatenate(truths[lead])
        pers = np.concatenate(persistence[lead])

        pred_rain = pred[:, 1]
        true_rain = truth[:, 1]
        pers_rain = pers[:, 1]

        print(f"\nDay {lead}")
        print("Heavy-rain CSI (model):", round(csi(pred_rain, true_rain), 5))
        print("Heavy-rain CSI (persistence):", round(csi(pers_rain, true_rain), 5))

        model_var = pred.var(axis=(0, 2, 3))
        truth_var = truth.var(axis=(0, 2, 3))
        ratio = model_var / np.maximum(truth_var, 1e-12)

        print("Spatial variance ratio (model/real):")
        for name, value in zip(
            ["t2m", "tp", "u10", "v10", "msl", "tcwv"], ratio
        ):
            print(f"  {name}: {value:.4f}")

        print("Rainfall minimum:", float(pred_rain.min()))
        print("Temperature range (K):", float(pred[:, 0].min()), float(pred[:, 0].max()))

    print("\nCheck is diagnostic; it is not the official judge score.")


if __name__ == "__main__":
    main()
