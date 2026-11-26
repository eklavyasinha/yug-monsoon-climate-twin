import numpy as np
import xarray as xr

DATA_PATH = "india_climate_train.nc"

def main():
    ds = xr.open_dataset(DATA_PATH)
    data = ds["data"]

    # Hold out 2021 for an initial baseline evaluation
    year_start = 5844
    max_start = 6209 - 10 - 3

    starts = np.arange(year_start, max_start, 12)

    results = {}

    for lead in (1, 4, 8):
        errors = []

        for start in starts:
            last_input = data.isel(time=start + 2).values
            target = data.isel(time=start + 2 + lead).values

            error = last_input - target
            errors.append(error ** 2)

        mse = np.mean(np.stack(errors), axis=0)
        channel_rmse = np.sqrt(mse.mean(axis=(1, 2)))

        results[lead] = channel_rmse

    names = ["t2m", "tp", "u10", "v10", "msl", "tcwv"]

    print("\nPERSISTENCE BASELINE RMSE (2021)")
    print("=" * 45)

    for lead, scores in results.items():
        print(f"\nDay {lead}:")
        for name, score in zip(names, scores):
            print(f"  {name:6s}: {score:.4f}")

    ds.close()

if __name__ == "__main__":
    main()
