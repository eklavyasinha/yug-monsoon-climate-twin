import torch
import torch.nn as nn


class ResidualBlock(nn.Module):
    def __init__(self, width):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(width, width, 3, padding=1),
            nn.GELU(),
            nn.Conv2d(width, width, 3, padding=1),
        )

    def forward(self, x):
        return x + 0.2 * self.net(x)


class WeatherNet(nn.Module):
    def __init__(self, width=48):
        super().__init__()
        # 3 weather frames (18), day-of-year (2), spatial coords (2)
        self.input = nn.Conv2d(22, width, 3, padding=1)
        self.blocks = nn.Sequential(*[ResidualBlock(width) for _ in range(4)])
        self.output = nn.Conv2d(width, 6, 3, padding=1)

    def forward(self, x):
        x = self.input(x)
        x = self.blocks(x)
        return self.output(x)


def make_features(context, doy, lat, lon):
    """
    context: [B, 3, 6, 32, 36] normalized weather
    doy: [B] day-of-year
    lat, lon: [1, 1, 32, 36] coordinate grids
    """
    b = context.shape[0]
    angle = (doy.float() / 365.25) * (2 * torch.pi)

    seasonal = torch.stack(
        [torch.sin(angle), torch.cos(angle)], dim=1
    ).view(b, 2, 1, 1).expand(b, 2, 32, 36)

    coords = torch.cat([lat.expand(b, 1, 32, 36),
                       lon.expand(b, 1, 32, 36)], dim=1)

    return torch.cat([context.reshape(b, 18, 32, 36), seasonal, coords], dim=1)


def predict_next(model, context, doy, lat, lon):
    features = make_features(context, doy, lat, lon)
    delta = model(features)
    # Predict a normalized change relative to the most recent day.
    return context[:, -1] + delta
