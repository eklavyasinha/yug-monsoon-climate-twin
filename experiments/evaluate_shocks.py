import numpy as np
import xarray as xr
import torch

from models.weather_model import WeatherNet, predict_next

DATA_PATH = "india_climate_train.nc"
CHANNELS = ["t2m", "tp", "u10", "v10", "msl", "tcwv"]

MODELS = {
    "Baseline": "models/weather_rollout_best.pt",
    "Rain-aware": "models/weather_rollout_rain_best.pt",
}


def load_model(path, device):
    ckpt = torch.load(path, map_location="cpu", weights_only=False)
    mean = np.array(ckpt["mean"], dtype=np.float32).reshape(1, 6, 1, 1)
    std = np.array(ckpt["std"], dtype=np.float32).reshape(1, 6, 1, 1)

    model = WeatherNet(width=ckpt["width"]).to(device)
    model.load_state_dict(ckpt["model_state"])
    model.eval()

    return model, mean, std


def predict_raw(model, context_raw, mean, std, days, lat, lon, device):
    normalized = ((context_raw - mean) / std).astype(np.float32)
    context = torch.from_numpy(normalized).to(device)

    pred_norm = predict_next(model, context, days, lat, lon)
    return pred_norm.cpu().numpy() * std + mean


def get_region(lat_grid, lon_grid, lat_min, lat_max, lon_min, lon_max):
    return (
        (lat_grid >= lat_min) & (lat_grid <= lat_max) &
        (lon_grid >= lon_min) & (lon_grid <= lon_max)
    )


def rollout(model_type, context_raw, doy, device, steps=4):
    if model_type == "Hybrid":
        baseline, b_mean, b_std = load_model(
            MODELS["Baseline"], device
        )
        rain_model, r_mean, r_std = load_model(
            MODELS["Rain-aware"], device
        )
    else:
        path = MODELS[model_type]
        model, mean, std = load_model(path, device)

    lat = torch.linspace(-1, 1, 32, device=device).view(1, 1, 32, 1)
    lon = torch.linspace(-1, 1, 36, device=device).view(1, 1, 1, 36)

    context = context_raw.copy()
    outputs = []

    with torch.no_grad():
        for lead in range(steps):
            days = torch.tensor([doy[lead]], device=device)

            if model_type == "Hybrid":
                b_pred = predict_raw(
                    baseline, context, b_mean, b_std,
                    days, lat, lon, device
                )
                r_pred = predict_raw(
                    rain_model, context, r_mean, r_std,
                    days, lat, lon, device
                )

                pred = b_pred.copy()
                pred[:, 1:2] = r_pred[:, 1:2]
                pred[:, 1] = np.maximum(pred[:, 1], 0)

            else:
                pred = predict_raw(
                    model, context, mean, std,
                    days, lat, lon, device
                )

                if model_type == "Rain-aware":
                    pred[:, 1] = np.maximum(pred[:, 1], 0)

            outputs.append(pred.copy())
            context = np.concatenate(
                [context[:, 1:], pred[:, None]], axis=1
            )

    return np.stack(outputs, axis=1)


def report_shock(name, normal, shocked, region, channels, days=(1, 4)):
    print("\n" + "-" * 70)
    print(name)
    print("-" * 70)

    for day in days:
        a = normal[:, day - 1]
        b = shocked[:, day - 1]
        delta = b - a

        inside = region
        outside = ~region

        print(f"\nForecast day {day}")

        for c in channels:
            inside_change = np.abs(delta[:, c][:, inside]).mean()
            outside_change = np.abs(delta[:, c][:, outside]).mean()
            overall_change = np.abs(delta[:, c]).mean()

            print(
                f"{CHANNELS[c]:5s}: "
                f"inside={inside_change:.6f} | "
                f"outside={outside_change:.6f} | "
                f"global={overall_change:.6f}"
            )


def main():
    device = torch.device(
        "mps" if torch.backends.mps.is_available() else "cpu"
    )
    print("Device:", device)

    ds = xr.open_dataset(DATA_PATH)
    raw = ds["data"].values.astype(np.float32)
    years = ds.time.dt.year.values
    doy_all = ds.time.dt.dayofyear.values
    ds.close()

    starts = [
        t for t in range(3, len(raw) - 10)
        if years[t] == 2021
        and np.all(years[t:t + 10] == 2021)
    ]

    start = starts[len(starts) // 2]
    print("Selected test window index:", start)

    context = raw[start - 3:start][None].copy()
    future_doy = doy_all[start:start + 4]

    lat_values = np.linspace(6.5, 37.5, 32)
    lon_values = np.linspace(65.5, 100.5, 36)

    lat_grid, lon_grid = np.meshgrid(lat_values, lon_values, indexing="ij")

    bob = get_region(
        lat_grid, lon_grid, 8, 20, 82, 94
    )
    arabian = get_region(
        lat_grid, lon_grid, 8, 20, 65.5, 75
    )

    # Warm ocean perturbation: +3K T2M and +15% TCWV.
    warm = context.copy()
    warm[:, -1, 0, bob] += 3.0
    warm[:, -1, 5, bob] *= 1.15

    # Monsoon stall perturbation: -40% U10 and V10.
    stall = context.copy()
    stall[:, -1, 2, arabian] *= 0.60
    stall[:, -1, 3, arabian] *= 0.60

    # Null perturbation: exactly unchanged input.
    null = context.copy()

    for model_type in ("Baseline", "Rain-aware", "Hybrid"):
        print("\n" + "=" * 75)
        print("MODEL:", model_type)
        print("=" * 75)

        normal_output = rollout(
            model_type, context, future_doy, device
        )

        warm_output = rollout(
            model_type, warm, future_doy, device
        )

        stall_output = rollout(
            model_type, stall, future_doy, device
        )

        null_output = rollout(
            model_type, null, future_doy, device
        )

        report_shock(
            "WARM OCEAN RESPONSE",
            normal_output, warm_output, bob,
            channels=(0, 1, 5)
        )

        report_shock(
            "MONSOON STALL RESPONSE",
            normal_output, stall_output, arabian,
            channels=(2, 3, 1)
        )

        print("\nNULL SHOCK CHECK:")
        print(
            "Maximum difference:",
            float(np.max(np.abs(normal_output - null_output)))
        )


if __name__ == "__main__":
    main()
