import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { GRID_SPEC } from '../config/projectFacts';
import {
  SCHEMATIC_LAND_SEA_MASK,
  strokeSchematicCoastline,
} from '../utils/schematicGeography';

const ROWS = GRID_SPEC.rows; // 32 (lat 6.5..37.5 N)
const COLS = GRID_SPEC.cols; // 36 (lon 65.5..100.5 E)

const MARGIN_LEFT = 50;
const MARGIN_TOP = 20;
const MARGIN_RIGHT = 20;
const MARGIN_BOTTOM = 40;
const CELL_SIZE = 15;
const GRID_W = COLS * CELL_SIZE; // 540
const GRID_H = ROWS * CELL_SIZE; // 480
const STAGE_W = MARGIN_LEFT + GRID_W + MARGIN_RIGHT; // 610
const STAGE_H = MARGIN_TOP + GRID_H + MARGIN_BOTTOM; // 540

type SchematicMode = 'monsoon' | 'thermal' | 'shock';

const SCHEMATIC_MODES: readonly {
  id: SchematicMode;
  label: string;
  legendText: string;
}[] = [
  {
    id: 'monsoon',
    label: 'Monsoon Flow',
    legendText: 'Conceptual moisture plumes & cross-equatorial wind tracks',
  },
  {
    id: 'thermal',
    label: 'Thermal Contrast',
    legendText: 'Conceptual land–sea thermal gradient & pressure contours',
  },
  {
    id: 'shock',
    label: 'Shock Footprint',
    legendText: 'Conceptual Bay of Bengal Gaussian delta geometry',
  },
];

interface CellInfo {
  row: number;
  col: number;
  lat: number;
  lon: number;
  isLand: boolean;
}

function lonToX(lon: number): number {
  const fraction = (lon - (GRID_SPEC.lonMin - 0.5)) / COLS;
  return MARGIN_LEFT + fraction * GRID_W;
}

function latToY(lat: number): number {
  const fraction = (GRID_SPEC.latMax + 0.5 - lat) / ROWS;
  return MARGIN_TOP + fraction * GRID_H;
}

interface CubicStreamline {
  p0: [number, number];
  c1: [number, number];
  c2: [number, number];
  p1: [number, number];
  speed: number;
  phaseOffset: number;
  tint: 'cyan' | 'ice' | 'amber';
}

const STREAMLINES: readonly CubicStreamline[] = [
  // Arabian Sea Somali Jet sweeping northeast onto Western Ghats & peninsula
  {
    p0: [lonToX(65.8), latToY(7.8)],
    c1: [lonToX(70.0), latToY(10.8)],
    c2: [lonToX(74.4), latToY(13.8)],
    p1: [lonToX(81.5), latToY(17.2)],
    speed: 0.24,
    phaseOffset: 0.04,
    tint: 'cyan',
  },
  {
    p0: [lonToX(65.8), latToY(11.6)],
    c1: [lonToX(70.8), latToY(14.5)],
    c2: [lonToX(75.5), latToY(17.2)],
    p1: [lonToX(83.8), latToY(20.6)],
    speed: 0.28,
    phaseOffset: 0.31,
    tint: 'ice',
  },
  {
    p0: [lonToX(66.4), latToY(15.6)],
    c1: [lonToX(72.0), latToY(18.0)],
    c2: [lonToX(77.6), latToY(20.4)],
    p1: [lonToX(86.4), latToY(23.5)],
    speed: 0.25,
    phaseOffset: 0.62,
    tint: 'cyan',
  },
  {
    p0: [lonToX(67.2), latToY(19.2)],
    c1: [lonToX(73.2), latToY(21.4)],
    c2: [lonToX(79.4), latToY(23.6)],
    p1: [lonToX(87.8), latToY(25.8)],
    speed: 0.21,
    phaseOffset: 0.85,
    tint: 'ice',
  },
  // Bay of Bengal monsoon branch curving northwest up the Indo-Gangetic trough
  {
    p0: [lonToX(84.2), latToY(7.6)],
    c1: [lonToX(89.2), latToY(13.2)],
    c2: [lonToX(90.6), latToY(19.4)],
    p1: [lonToX(82.4), latToY(24.6)],
    speed: 0.27,
    phaseOffset: 0.16,
    tint: 'ice',
  },
  {
    p0: [lonToX(88.6), latToY(9.0)],
    c1: [lonToX(93.8), latToY(15.6)],
    c2: [lonToX(92.8), latToY(22.2)],
    p1: [lonToX(79.5), latToY(26.8)],
    speed: 0.3,
    phaseOffset: 0.48,
    tint: 'cyan',
  },
  {
    p0: [lonToX(92.8), latToY(12.2)],
    c1: [lonToX(96.2), latToY(18.8)],
    c2: [lonToX(93.4), latToY(25.0)],
    p1: [lonToX(82.0), latToY(29.0)],
    speed: 0.23,
    phaseOffset: 0.77,
    tint: 'cyan',
  },
  // Warm continental inflow into northwest monsoon trough
  {
    p0: [lonToX(67.4), latToY(32.5)],
    c1: [lonToX(71.5), latToY(29.6)],
    c2: [lonToX(75.5), latToY(27.2)],
    p1: [lonToX(80.6), latToY(25.2)],
    speed: 0.19,
    phaseOffset: 0.52,
    tint: 'amber',
  },
];

function evalCubicBezier(s: CubicStreamline, t: number): [number, number] {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const x =
    mt2 * mt * s.p0[0] +
    3 * mt2 * t * s.c1[0] +
    3 * mt * t2 * s.c2[0] +
    t2 * t * s.p1[0];
  const y =
    mt2 * mt * s.p0[1] +
    3 * mt2 * t * s.c1[1] +
    3 * mt * t2 * s.c2[1] +
    t2 * t * s.p1[1];
  return [x, y];
}

const LAT_TICKS = [10, 15, 20, 25, 30, 35];
const LON_TICKS = [70, 75, 80, 85, 90, 95, 100];

interface PrecomputedCellBase {
  row: number;
  col: number;
  lat: number;
  lon: number;
  x: number;
  y: number;
  isLand: boolean;
  monsoonIntensity: number;
  nwThermal: number;
  himalayanCool: number;
  bobShockGaussian: number;
  wavePhase: number;
}

const CELL_BASES: readonly PrecomputedCellBase[] = (() => {
  const list: PrecomputedCellBase[] = [];
  for (let row = 0; row < ROWS; row += 1) {
    const lat = GRID_SPEC.latMin + row;
    const visualRow = ROWS - 1 - row;
    for (let col = 0; col < COLS; col += 1) {
      const lon = GRID_SPEC.lonMin + col;
      const isLand = (SCHEMATIC_LAND_SEA_MASK[row]?.[col] ?? 0) === 1;

      const arabianJet = Math.exp(
        -(((lat - 14.2) / 6.2) ** 2 + ((lon - 71.8) / 8.5) ** 2),
      );
      const bayConvergence = Math.exp(
        -(((lat - 16.8) / 6.5) ** 2 + ((lon - 88.2) / 7.0) ** 2),
      );
      const trough = Math.exp(
        -(((lat - 23.0) / 4.0) ** 2 + ((lon - 81.2) / 10.5) ** 2),
      );
      const westernGhats = Math.exp(
        -(((lat - 15.0) / 5.0) ** 2 + ((lon - 74.2) / 2.4) ** 2),
      );
      const monsoonIntensity = Math.min(
        1,
        0.58 * arabianJet +
          0.84 * bayConvergence +
          0.48 * trough +
          0.46 * westernGhats,
      );

      const nwThermal = Math.exp(
        -(((lat - 29.4) / 6.2) ** 2 + ((lon - 72.4) / 7.5) ** 2),
      );
      const himalayanCool = Math.exp(
        -(((lat - 35.2) / 3.6) ** 2 + ((lon - 83.5) / 11.5) ** 2),
      );

      // Conceptual Bay of Bengal Gaussian shock (centre 15°N, 88°E, σ = 5.0°)
      const cosLat = Math.cos((15 * Math.PI) / 180);
      const d = Math.hypot(lat - 15.0, (lon - 88.0) * cosLat);
      const bobShockGaussian = Math.exp(-(d * d) / (2 * 5.2 * 5.2));

      list.push({
        row,
        col,
        lat,
        lon,
        x: MARGIN_LEFT + col * CELL_SIZE,
        y: MARGIN_TOP + visualRow * CELL_SIZE,
        isLand,
        monsoonIntensity,
        nwThermal,
        himalayanCool,
        bobShockGaussian,
        wavePhase: lon * 0.19 - lat * 0.14,
      });
    }
  }
  return list;
})();

function drawCornerTicks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  const len = 8;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x, y + len);
  ctx.lineTo(x, y);
  ctx.lineTo(x + len, y);
  ctx.moveTo(x + w - len, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + len);
  ctx.moveTo(x, y + h - len);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x + len, y + h);
  ctx.moveTo(x + w - len, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w, y + h - len);
  ctx.stroke();
  ctx.restore();
}

function drawSchematic(
  ctx: CanvasRenderingContext2D,
  phaseSec: number,
  mode: SchematicMode,
  hovered: CellInfo | null,
  isReducedMotion: boolean,
) {
  ctx.clearRect(0, 0, STAGE_W, STAGE_H);

  // Outer stage slate
  ctx.fillStyle = '#07101E';
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);

  // Deep ocean backdrop inside the 32x36 domain
  ctx.fillStyle = '#060D1A';
  ctx.fillRect(MARGIN_LEFT, MARGIN_TOP, GRID_W, GRID_H);

  const animWave = isReducedMotion ? 0 : phaseSec;

  // 1. Render living discrete 32x36 1-degree atmospheric grid cells
  for (let i = 0; i < CELL_BASES.length; i += 1) {
    const cell = CELL_BASES[i];
    const pulse = isReducedMotion
      ? 0
      : Math.sin(animWave * 1.45 - cell.wavePhase) * 0.11;

    let r = 18;
    let g = 42;
    let b = 70;
    let alpha = 0.25;

    if (mode === 'monsoon') {
      const cool = Math.max(0, Math.min(1, cell.monsoonIntensity * (0.94 + pulse)));
      const warm = Math.max(0, Math.min(1, cell.nwThermal * (0.9 + pulse * 0.5)));
      const landBoost = cell.isLand ? 0.08 : 0;

      const mixWarm =
        warm + cool > 0.01 ? warm / (warm + cool + 0.001) : 0;
      r = Math.round(
        (26 + cool * 66) * (1 - mixWarm) + (242 * mixWarm),
      );
      g = Math.round(
        (146 + cool * 78) * (1 - mixWarm) + (169 * mixWarm),
      );
      b = Math.round(
        (194 + cool * 48) * (1 - mixWarm) + (59 * mixWarm),
      );
      const signal = Math.min(1, cool * 0.95 + warm * 0.85 + cell.himalayanCool * 0.25);
      alpha = Math.min(0.68, 0.09 + landBoost + signal * 0.52);
    } else if (mode === 'thermal') {
      const heat = Math.max(
        0,
        Math.min(
          1,
          cell.nwThermal * 1.15 +
            (cell.isLand ? 0.34 : 0.04) -
            cell.himalayanCool * 0.45 +
            pulse * 0.65,
        ),
      );
      const coolOcean = cell.isLand ? 0.08 : 0.48 + cell.monsoonIntensity * 0.35;
      if (heat > 0.42) {
        const t = Math.min(1, (heat - 0.42) / 0.58);
        r = Math.round(180 + t * 65);
        g = Math.round(108 + t * 72);
        b = Math.round(48 + t * 24);
        alpha = 0.26 + t * 0.48;
      } else {
        r = Math.round(32 + coolOcean * 44);
        g = Math.round(122 + coolOcean * 78);
        b = Math.round(178 + coolOcean * 56);
        alpha = 0.16 + coolOcean * 0.32;
      }
    } else {
      // Shock Footprint mode: quiet atmospheric base + glowing diverging Bay of Bengal Gaussian shock
      const shockWave = isReducedMotion
        ? 1
        : 0.84 + 0.24 * Math.sin(animWave * 2.2 - cell.bobShockGaussian * 3.0);
      const shock = Math.min(1, cell.bobShockGaussian * shockWave);
      if (shock > 0.08) {
        r = Math.round(235 + shock * 20);
        g = Math.round(105 + shock * 88);
        b = Math.round(62 + shock * 22);
        alpha = Math.min(0.82, 0.14 + shock * 0.72);
      } else {
        r = cell.isLand ? 38 : 22;
        g = cell.isLand ? 66 : 48;
        b = cell.isLand ? 102 : 82;
        alpha = cell.isLand ? 0.34 : 0.22;
      }
    }

    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
    ctx.fillRect(cell.x + 0.5, cell.y + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
  }

  // 2. Crisp coarse 1° physical land-sea coastal silhouette (NO political borders)
  strokeSchematicCoastline(ctx, {
    marginLeft: MARGIN_LEFT,
    marginTop: MARGIN_TOP,
    cellSize: CELL_SIZE,
    strokeStyle: 'rgba(230, 237, 247, 0.82)',
    lineWidth: 1.5,
  });

  // 3. Lat/Lon graticule hairlines
  ctx.save();
  ctx.strokeStyle = 'rgba(147, 164, 189, 0.22)';
  ctx.lineWidth = 0.75;
  ctx.setLineDash([3, 4]);
  for (const lat of LAT_TICKS) {
    const y = latToY(lat);
    ctx.beginPath();
    ctx.moveTo(MARGIN_LEFT, y);
    ctx.lineTo(MARGIN_LEFT + GRID_W, y);
    ctx.stroke();
  }
  for (const lon of LON_TICKS) {
    const x = lonToX(lon);
    ctx.beginPath();
    ctx.moveTo(x, MARGIN_TOP);
    ctx.lineTo(x, MARGIN_TOP + GRID_H);
    ctx.stroke();
  }
  ctx.restore();

  // 4. Mode-specific animated atmospheric overlays
  ctx.save();
  ctx.beginPath();
  ctx.rect(MARGIN_LEFT, MARGIN_TOP, GRID_W, GRID_H);
  ctx.clip();

  if (mode === 'monsoon') {
    // Contract perturbation boxes (coordinate rectangles only)
    const arabianX = lonToX(65.5);
    const arabianY = latToY(20);
    const arabianW = lonToX(75) - arabianX;
    const arabianH = latToY(8) - arabianY;

    const bobX = lonToX(82);
    const bobY = latToY(20);
    const bobW = lonToX(94) - bobX;
    const bobH = latToY(8) - bobY;

    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(191, 230, 242, 0.45)';
    ctx.strokeRect(arabianX, arabianY, arabianW, arabianH);
    ctx.strokeStyle = 'rgba(242, 169, 59, 0.52)';
    ctx.strokeRect(bobX, bobY, bobW, bobH);
    ctx.restore();

    drawCornerTicks(ctx, arabianX, arabianY, arabianW, arabianH, 'rgba(191, 230, 242, 0.9)');
    drawCornerTicks(ctx, bobX, bobY, bobW, bobH, 'rgba(242, 169, 59, 0.95)');

    // Luminous animated streamlines with tapered moving wind parcels
    for (const s of STREAMLINES) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(s.p0[0], s.p0[1]);
      ctx.bezierCurveTo(s.c1[0], s.c1[1], s.c2[0], s.c2[1], s.p1[0], s.p1[1]);

      const baseColor =
        s.tint === 'amber'
          ? 'rgba(242, 169, 59, 0.24)'
          : 'rgba(92, 200, 224, 0.24)';
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.strokeStyle =
        s.tint === 'amber'
          ? 'rgba(242, 169, 59, 0.5)'
          : 'rgba(191, 230, 242, 0.45)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.restore();

      // Three staggered luminous moving wind-parcel comets per streamline
      const parcelCount = 3;
      for (let p = 0; p < parcelCount; p += 1) {
        const baseT = (s.phaseOffset + p / parcelCount) % 1;
        const t = isReducedMotion
          ? baseT
          : (baseT + animWave * s.speed) % 1;
        const envelope = Math.sin(t * Math.PI);
        if (envelope <= 0.04) continue;

        // Draw short luminous tapered comet trail behind parcel
        const trailSteps = 6;
        ctx.save();
        for (let k = trailSteps; k >= 1; k -= 1) {
          const tPrev = Math.max(0, t - k * 0.022);
          const tNext = Math.max(0, t - (k - 1) * 0.022);
          const [x0, y0] = evalCubicBezier(s, tPrev);
          const [x1, y1] = evalCubicBezier(s, tNext);
          const frac = 1 - k / (trailSteps + 1);
          const trailAlpha = envelope * frac * 0.9;
          ctx.strokeStyle =
            s.tint === 'amber'
              ? `rgba(242, 169, 59, ${trailAlpha.toFixed(3)})`
              : `rgba(191, 230, 242, ${trailAlpha.toFixed(3)})`;
          ctx.lineWidth = 1.2 + frac * 1.6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }

        // Bright leading parcel head
        const [px, py] = evalCubicBezier(s, t);
        ctx.fillStyle =
          s.tint === 'amber'
            ? `rgba(255, 212, 128, ${(0.95 * envelope).toFixed(3)})`
            : `rgba(230, 247, 255, ${(0.95 * envelope).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, 2.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Crisp region coordinate tags drawn above streamlines with auto-measured pills
    ctx.save();
    ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const arabianLabel = 'Arabian Sea 8–20°N';
    const arabianTagW = Math.ceil(ctx.measureText(arabianLabel).width) + 12;
    ctx.fillStyle = 'rgba(6, 13, 25, 0.92)';
    ctx.fillRect(arabianX + 6, arabianY + 6, arabianTagW, 18);
    ctx.strokeStyle = 'rgba(191, 230, 242, 0.45)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(arabianX + 6, arabianY + 6, arabianTagW, 18);
    ctx.fillStyle = '#BFE6F2';
    ctx.fillText(arabianLabel, arabianX + 12, arabianY + 10);

    const bobLabel = 'Bay of Bengal 8–20°N';
    const bobTagW = Math.ceil(ctx.measureText(bobLabel).width) + 12;
    ctx.fillStyle = 'rgba(6, 13, 25, 0.92)';
    ctx.fillRect(bobX + 6, bobY + 6, bobTagW, 18);
    ctx.strokeStyle = 'rgba(242, 169, 59, 0.5)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(bobX + 6, bobY + 6, bobTagW, 18);
    ctx.fillStyle = '#F2A93B';
    ctx.fillText(bobLabel, bobX + 12, bobY + 10);
    ctx.restore();
  } else if (mode === 'thermal') {
    // Animated concentric isobar/thermal rings around NW continental heat low
    const lowX = lonToX(72.5);
    const lowY = latToY(29.2);
    const radii = [42, 78, 118, 164];
    ctx.save();
    for (let i = 0; i < radii.length; i += 1) {
      const breathe = isReducedMotion
        ? 0
        : Math.sin(animWave * 1.6 - i * 0.8) * 5;
      ctx.beginPath();
      ctx.ellipse(
        lowX,
        lowY,
        (radii[i] + breathe) * 1.18,
        (radii[i] + breathe) * 0.86,
        -0.25,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle =
        i < 2 ? 'rgba(242, 169, 59, 0.52)' : 'rgba(191, 230, 242, 0.28)';
      ctx.lineWidth = i === 0 ? 1.4 : 1;
      ctx.setLineDash(i % 2 === 0 ? [] : [5, 4]);
      ctx.stroke();
    }
    ctx.restore();

    ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(6, 13, 25, 0.86)';
    ctx.fillRect(lowX - 58, lowY - 9, 116, 18);
    ctx.fillStyle = '#F2A93B';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NW Heat Low (t2m)', lowX, lowY);
  } else {
    // Shock Footprint mode: expanding conceptual Gaussian perturbation rings in Bay of Bengal
    const cx = lonToX(88.0);
    const cy = latToY(15.0);
    const bobX = lonToX(82);
    const bobY = latToY(20);
    const bobW = lonToX(94) - bobX;
    const bobH = latToY(8) - bobY;

    drawCornerTicks(ctx, bobX, bobY, bobW, bobH, '#5CC8E0');

    for (let ring = 0; ring < 3; ring += 1) {
      const frac = isReducedMotion
        ? (ring + 1) / 3.2
        : ((animWave * 0.34 + ring / 3) % 1);
      const radius = 16 + frac * 110;
      const ringAlpha = (1 - frac) * 0.72;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(242, 169, 59, ${ringAlpha.toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    }

    // Center crosshair marker
    ctx.save();
    ctx.strokeStyle = '#E6EDF7';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy);
    ctx.lineTo(cx + 7, cy);
    ctx.moveTo(cx, cy - 7);
    ctx.lineTo(cx, cy + 7);
    ctx.stroke();
    ctx.restore();

    ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(6, 13, 25, 0.88)';
    ctx.fillRect(bobX + 6, bobY + 6, 162, 17);
    ctx.fillStyle = '#F2A93B';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Δt2m Gaussian · 15°N, 88°E', bobX + 10, bobY + 9);
  }

  // 5. Interactive hover crosshair & highlighted cell
  if (hovered) {
    const visualRow = ROWS - 1 - hovered.row;
    const hx = MARGIN_LEFT + hovered.col * CELL_SIZE;
    const hy = MARGIN_TOP + visualRow * CELL_SIZE;
    const cx = hx + CELL_SIZE / 2;
    const cy = hy + CELL_SIZE / 2;

    ctx.save();
    ctx.strokeStyle = 'rgba(191, 230, 242, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN_LEFT, cy);
    ctx.lineTo(MARGIN_LEFT + GRID_W, cy);
    ctx.moveTo(cx, MARGIN_TOP);
    ctx.lineTo(cx, MARGIN_TOP + GRID_H);
    ctx.stroke();

    ctx.fillStyle = 'rgba(92, 200, 224, 0.45)';
    ctx.fillRect(hx + 0.5, hy + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
    ctx.strokeStyle = '#E6EDF7';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(hx + 0.5, hy + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
    ctx.restore();
  }

  ctx.restore(); // end grid viewport clip

  // Outer domain border
  ctx.strokeStyle = '#33527D';
  ctx.lineWidth = 1.25;
  ctx.strokeRect(MARGIN_LEFT, MARGIN_TOP, GRID_W, GRID_H);

  // Coordinate axis tick labels
  ctx.fillStyle = '#93A4BD';
  ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const lat of LAT_TICKS) {
    ctx.fillText(`${lat}°N`, MARGIN_LEFT - 8, latToY(lat));
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const lon of LON_TICKS) {
    ctx.fillText(`${lon}°E`, lonToX(lon), MARGIN_TOP + GRID_H + 8);
  }

  ctx.fillStyle = 'rgba(147, 164, 189, 0.9)';
  ctx.fillText(
    'Longitude (west → east · 36 cells · 1° spacing · physical coastline only)',
    MARGIN_LEFT + GRID_W / 2,
    STAGE_H - 14,
  );
}

export function HeroAtmosphericSchematic() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hoveredRef = useRef<CellInfo | null>(null);
  const modeRef = useRef<SchematicMode>('monsoon');
  const phaseRef = useRef<number>(0);
  const reducedMotionRef = useRef<boolean>(false);

  const [mode, setMode] = useState<SchematicMode>('monsoon');
  const [hoveredCell, setHoveredCell] = useState<CellInfo | null>(null);

  useEffect(() => {
    modeRef.current = mode;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      drawSchematic(
        ctx,
        phaseRef.current,
        mode,
        hoveredRef.current,
        reducedMotionRef.current,
      );
    }
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = STAGE_W * dpr;
    canvas.height = STAGE_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    reducedMotionRef.current = prefersReducedMotion;

    drawSchematic(
      ctx,
      phaseRef.current,
      modeRef.current,
      hoveredRef.current,
      prefersReducedMotion,
    );

    if (prefersReducedMotion) {
      return;
    }

    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      if (dt >= 0.032) {
        // ~30 fps smooth compositor-friendly loop
        lastTs = now;
        if (!document.hidden) {
          phaseRef.current = (phaseRef.current + dt) % 600;
          drawSchematic(
            ctx,
            phaseRef.current,
            modeRef.current,
            hoveredRef.current,
            false,
          );
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  const handleMouseMove = (event: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const scaleX = STAGE_W / rect.width;
    const scaleY = STAGE_H / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    const col = Math.floor((x - MARGIN_LEFT) / CELL_SIZE);
    const visualRow = Math.floor((y - MARGIN_TOP) / CELL_SIZE);

    if (col >= 0 && col < COLS && visualRow >= 0 && visualRow < ROWS) {
      const row = ROWS - 1 - visualRow;
      if (hoveredRef.current?.row !== row || hoveredRef.current?.col !== col) {
        const next: CellInfo = {
          row,
          col,
          lat: GRID_SPEC.latMin + row,
          lon: GRID_SPEC.lonMin + col,
          isLand: (SCHEMATIC_LAND_SEA_MASK[row]?.[col] ?? 0) === 1,
        };
        hoveredRef.current = next;
        setHoveredCell(next);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawSchematic(
            ctx,
            phaseRef.current,
            modeRef.current,
            next,
            reducedMotionRef.current,
          );
        }
      }
    } else if (hoveredRef.current !== null) {
      hoveredRef.current = null;
      setHoveredCell(null);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawSchematic(
          ctx,
          phaseRef.current,
          modeRef.current,
          null,
          reducedMotionRef.current,
        );
      }
    }
  };

  const handleMouseLeave = () => {
    hoveredRef.current = null;
    setHoveredCell(null);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      drawSchematic(
        ctx,
        phaseRef.current,
        modeRef.current,
        null,
        reducedMotionRef.current,
      );
    }
  };

  const activeModeMeta =
    SCHEMATIC_MODES.find((m) => m.id === mode) ?? SCHEMATIC_MODES[0];

  return (
    <figure className="instrument-plane rounded-xs overflow-hidden">
      {/* Top Instrument Bar: Domain spec + Interactive Conceptual Layer Switcher */}
      <div className="flex flex-wrap xl:flex-nowrap items-center justify-between gap-2 border-b border-[#1E2F4A] bg-[#060B14] px-3.5 py-2">
        <div className="min-w-0 space-y-0.5">
          <div className="font-mono text-[11px] font-medium text-[#BFE6F2] tabular-nums truncate">
            32 × 36 Grid · 1° Centres · 6.5–37.5°N, 65.5–100.5°E
          </div>
          <div className="font-mono text-[11px] text-[#F2A93B]">
            Conceptual schematic. Not model output.
          </div>
        </div>

        <div
          role="group"
          aria-label="Conceptual schematic preview layer"
          className="inline-flex shrink-0 items-center border border-[#1E2F4A] bg-[#08101D] p-0.5 font-mono text-[11px]"
        >
          {SCHEMATIC_MODES.map((item) => {
            const active = item.id === mode;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setMode(item.id)}
                className={`min-h-[28px] px-2.5 py-0.5 transition-colors duration-150 whitespace-nowrap ${
                  active
                    ? 'bg-[#142238] text-[#5CC8E0] font-semibold'
                    : 'text-[#93A4BD] hover:text-[#E6EDF7]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Full-bleed Interactive Canvas Viewport */}
      <div className="relative bg-[#050A12] p-1.5">
        <canvas
          ref={canvasRef}
          width={STAGE_W}
          height={STAGE_H}
          role="img"
          aria-label="Conceptual animated 32 by 36 Indian atmospheric grid schematic spanning 6.5 to 37.5 degrees North and 65.5 to 100.5 degrees East with coarse physical land-sea silhouette and monsoon circulation flow. No political borders. Not model output."
          className="w-full max-h-[590px] object-contain mx-auto block select-none cursor-crosshair"
          data-testid="hero-atmospheric-grid"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
      </div>

      {/* Interactive Cell Probe & Legend Footer */}
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-[#1E2F4A] bg-[#060B14] px-4 py-2.5 text-xs text-[#93A4BD]">
        <span className="font-mono text-[11px] tabular-nums text-[#E6EDF7]">
          {hoveredCell
            ? `Cell [r=${hoveredCell.row}, c=${hoveredCell.col}] · ${hoveredCell.lat.toFixed(1)}°N, ${hoveredCell.lon.toFixed(1)}°E (${hoveredCell.isLand ? 'Land' : 'Ocean'} 1° mask)`
            : 'Hover any 1° cell to probe [row, col] & lat/lon centre'}
        </span>
        <span className="font-mono text-[11px] text-[#93A4BD]">
          {activeModeMeta.legendText}
        </span>
      </figcaption>
    </figure>
  );
}
