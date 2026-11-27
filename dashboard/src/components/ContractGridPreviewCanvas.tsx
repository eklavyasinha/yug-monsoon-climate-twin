import { useEffect, useRef, type PointerEvent } from 'react';
import { GRID_SPEC } from '../config/projectFacts';
import type { GeoRegion } from '../utils/aggregation';
import {
  CONTRACT_LAT,
  CONTRACT_LON,
  SCHEMATIC_LAND_SEA_MASK,
  strokeSchematicCoastline,
} from '../utils/schematicGeography';

const ROWS = GRID_SPEC.rows;
const COLS = GRID_SPEC.cols;
const MARGIN_LEFT = 46;
const MARGIN_TOP = 18;
const MARGIN_RIGHT = 16;
const MARGIN_BOTTOM = 34;
const CELL_PX = 14;
const GRID_W = COLS * CELL_PX; // 504
const GRID_H = ROWS * CELL_PX; // 448
const STAGE_W = MARGIN_LEFT + GRID_W + MARGIN_RIGHT; // 566
const STAGE_H = MARGIN_TOP + GRID_H + MARGIN_BOTTOM; // 500

const LAT_TICKS = [10, 15, 20, 25, 30, 35];
const LON_TICKS = [70, 75, 80, 85, 90, 95, 100];

interface ContractGridPreviewCanvasProps {
  selectedRegion: GeoRegion;
  title: string;
  subtitle: string;
  testId?: string;
}

function lonToX(lon: number): number {
  const frac = (lon - (GRID_SPEC.lonMin - 0.5)) / COLS;
  return MARGIN_LEFT + frac * GRID_W;
}

function latToY(lat: number): number {
  const frac = (GRID_SPEC.latMax + 0.5 - lat) / ROWS;
  return MARGIN_TOP + frac * GRID_H;
}

/**
 * Interactive 32 × 36 Round 1 contract coordinate grid canvas rendered in
 * workspace empty states. Displays exact 1° cell coordinates, physical land/sea
 * silhouette (zero political borders), and highlighted regional selection box
 * WITHOUT displaying any fabricated climate forecast data.
 */
export function ContractGridPreviewCanvas({
  selectedRegion,
  title,
  subtitle,
  testId,
}: ContractGridPreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const readoutRef = useRef<HTMLDivElement | null>(null);
  const hoverRef = useRef<{ row: number; col: number } | null>(null);
  const regionRef = useRef<GeoRegion>(selectedRegion);
  const scanPhaseRef = useRef<number>(0);

  regionRef.current = selectedRegion;

  // Count cells enclosed in selected region
  let regionCellCount = 0;
  for (let r = 0; r < ROWS; r += 1) {
    const la = CONTRACT_LAT[r];
    if (la < selectedRegion.latMin || la > selectedRegion.latMax) continue;
    for (let c = 0; c < COLS; c += 1) {
      const lo = CONTRACT_LON[c];
      if (lo >= selectedRegion.lonMin && lo <= selectedRegion.lonMax) {
        regionCellCount += 1;
      }
    }
  }

  const drawFrame = (scanPhase: number, isReducedMotion: boolean) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const region = regionRef.current;

    ctx.clearRect(0, 0, STAGE_W, STAGE_H);
    ctx.fillStyle = '#07101E';
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);

    ctx.fillStyle = '#060D1A';
    ctx.fillRect(MARGIN_LEFT, MARGIN_TOP, GRID_W, GRID_H);

    // 1. Discrete 32x36 coordinate cells (subtle land/ocean shading + region cell tint)
    for (let vRow = 0; vRow < ROWS; vRow += 1) {
      const dataRow = ROWS - 1 - vRow;
      const lat = CONTRACT_LAT[dataRow];
      const y = MARGIN_TOP + vRow * CELL_PX;

      for (let vCol = 0; vCol < COLS; vCol += 1) {
        const lon = CONTRACT_LON[vCol];
        const x = MARGIN_LEFT + vCol * CELL_PX;
        const isLand = (SCHEMATIC_LAND_SEA_MASK[dataRow]?.[vCol] ?? 0) === 1;
        const inRegion =
          lat >= region.latMin &&
          lat <= region.latMax &&
          lon >= region.lonMin &&
          lon <= region.lonMax;

        if (inRegion) {
          ctx.fillStyle = isLand
            ? 'rgba(242, 169, 59, 0.24)'
            : 'rgba(92, 200, 224, 0.22)';
        } else {
          ctx.fillStyle = isLand
            ? 'rgba(34, 58, 92, 0.42)'
            : 'rgba(14, 28, 48, 0.48)';
        }
        ctx.fillRect(x + 0.5, y + 0.5, CELL_PX - 1, CELL_PX - 1);
      }
    }

    // 2. Subtle idle atmospheric telemetry sweep bar (strictly disabled under reduced motion)
    if (!isReducedMotion) {
      const sweepY = MARGIN_TOP + ((scanPhase * 42) % (GRID_H + 90)) - 45;
      ctx.save();
      ctx.beginPath();
      ctx.rect(MARGIN_LEFT, MARGIN_TOP, GRID_W, GRID_H);
      ctx.clip();
      const grad = ctx.createLinearGradient(0, sweepY - 28, 0, sweepY + 28);
      grad.addColorStop(0, 'rgba(92, 200, 224, 0)');
      grad.addColorStop(0.5, 'rgba(92, 200, 224, 0.14)');
      grad.addColorStop(1, 'rgba(92, 200, 224, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(MARGIN_LEFT, sweepY - 28, GRID_W, 56);
      ctx.restore();
    }

    // 3. Coarse 1° physical land-sea silhouette (zero political borders)
    strokeSchematicCoastline(ctx, {
      marginLeft: MARGIN_LEFT,
      marginTop: MARGIN_TOP,
      cellSize: CELL_PX,
      strokeStyle: 'rgba(230, 237, 247, 0.78)',
      lineWidth: 1.4,
    });

    // 4. Lat/Lon graticule hairlines
    ctx.save();
    ctx.strokeStyle = 'rgba(147, 164, 189, 0.22)';
    ctx.lineWidth = 0.75;
    ctx.setLineDash([2, 3]);
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

    // 5. Selected region bounding box (amber dashed + crisp corner ticks)
    let minVR: number = ROWS;
    let maxVR = -1;
    let minVC: number = COLS;
    let maxVC = -1;
    for (let r = 0; r < ROWS; r += 1) {
      if (CONTRACT_LAT[r] >= region.latMin && CONTRACT_LAT[r] <= region.latMax) {
        const vr = ROWS - 1 - r;
        if (vr < minVR) minVR = vr;
        if (vr > maxVR) maxVR = vr;
      }
    }
    for (let c = 0; c < COLS; c += 1) {
      if (CONTRACT_LON[c] >= region.lonMin && CONTRACT_LON[c] <= region.lonMax) {
        if (c < minVC) minVC = c;
        if (c > maxVC) maxVC = c;
      }
    }
    if (minVR <= maxVR && minVC <= maxVC) {
      const rx = MARGIN_LEFT + minVC * CELL_PX;
      const ry = MARGIN_TOP + minVR * CELL_PX;
      const rw = (maxVC - minVC + 1) * CELL_PX;
      const rh = (maxVR - minVR + 1) * CELL_PX;
      ctx.save();
      ctx.strokeStyle = '#F2A93B';
      ctx.lineWidth = 1.75;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
      ctx.restore();

      // Label tag inside region box
      ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
      const label = `${region.label}`;
      const textW = Math.min(rw - 12, ctx.measureText(label).width + 10);
      if (textW > 32) {
        ctx.fillStyle = 'rgba(6, 13, 25, 0.88)';
        ctx.fillRect(rx + 6, ry + 6, textW, 16);
        ctx.fillStyle = '#F2A93B';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(label, rx + 10, ry + 9, rw - 18);
      }
    }

    // 6. Hovered cell crosshair
    if (hoverRef.current) {
      const vr = ROWS - 1 - hoverRef.current.row;
      const vc = hoverRef.current.col;
      const hx = MARGIN_LEFT + vc * CELL_PX;
      const hy = MARGIN_TOP + vr * CELL_PX;
      ctx.save();
      ctx.strokeStyle = 'rgba(92, 200, 224, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(MARGIN_LEFT, hy + CELL_PX / 2);
      ctx.lineTo(MARGIN_LEFT + GRID_W, hy + CELL_PX / 2);
      ctx.moveTo(hx + CELL_PX / 2, MARGIN_TOP);
      ctx.lineTo(hx + CELL_PX / 2, MARGIN_TOP + GRID_H);
      ctx.stroke();

      ctx.strokeStyle = '#E6EDF7';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(hx + 0.5, hy + 0.5, CELL_PX - 1, CELL_PX - 1);
      ctx.restore();
    }

    // Outer frame & tick labels
    ctx.strokeStyle = '#2B4264';
    ctx.lineWidth = 1.1;
    ctx.strokeRect(MARGIN_LEFT, MARGIN_TOP, GRID_W, GRID_H);

    ctx.fillStyle = '#93A4BD';
    ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const lat of LAT_TICKS) {
      ctx.fillText(`${lat}°N`, MARGIN_LEFT - 6, latToY(lat));
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const lon of LON_TICKS) {
      ctx.fillText(`${lon}°E`, lonToX(lon), MARGIN_TOP + GRID_H + 7);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = STAGE_W * dpr;
    canvas.height = STAGE_H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const prefersReduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    drawFrame(scanPhaseRef.current, prefersReduced);

    if (prefersReduced) return;

    let rafId = 0;
    let lastTs = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      if (dt >= 0.04) {
        lastTs = now;
        if (!document.hidden) {
          scanPhaseRef.current = (scanPhaseRef.current + dt) % 240;
          drawFrame(scanPhaseRef.current, false);
        }
      }
      rafId = window.requestAnimationFrame(loop);
    };
    rafId = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  // Redraw immediately when selectedRegion changes
  useEffect(() => {
    const prefersReduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    drawFrame(scanPhaseRef.current, prefersReduced);
  }, [selectedRegion]);

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const sx = ((e.clientX - rect.left) * STAGE_W) / rect.width;
    const sy = ((e.clientY - rect.top) * STAGE_H) / rect.height;
    const vc = Math.floor((sx - MARGIN_LEFT) / CELL_PX);
    const vr = Math.floor((sy - MARGIN_TOP) / CELL_PX);

    if (vc >= 0 && vc < COLS && vr >= 0 && vr < ROWS) {
      const row = ROWS - 1 - vr;
      const col = vc;
      if (hoverRef.current?.row !== row || hoverRef.current?.col !== col) {
        hoverRef.current = { row, col };
        if (readoutRef.current) {
          const lat = CONTRACT_LAT[row];
          const lon = CONTRACT_LON[col];
          readoutRef.current.textContent = `Probe cell [r=${row}, c=${col}] · ${lat.toFixed(1)}°N, ${lon.toFixed(1)}°E · Awaiting live rollout`;
        }
        drawFrame(scanPhaseRef.current, true);
      }
    } else if (hoverRef.current) {
      hoverRef.current = null;
      if (readoutRef.current) {
        readoutRef.current.textContent = `Region: ${regionRef.current.label} (${regionCellCount} cells) · Hover grid to inspect 1° coordinates`;
      }
      drawFrame(scanPhaseRef.current, true);
    }
  };

  const handlePointerLeave = () => {
    if (hoverRef.current) {
      hoverRef.current = null;
      if (readoutRef.current) {
        readoutRef.current.textContent = `Region: ${regionRef.current.label} (${regionCellCount} cells) · Hover grid to inspect 1° coordinates`;
      }
      drawFrame(scanPhaseRef.current, true);
    }
  };

  return (
    <div className="instrument-plane rounded-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#1E2F4A] px-4 py-3">
        <div className="space-y-0.5">
          <h3 className="font-mono text-xs font-semibold text-[#E6EDF7]">
            {title}
          </h3>
          <p className="font-mono text-[11px] text-[#93A4BD]">{subtitle}</p>
        </div>
        <span className="font-mono text-[11px] text-[#F2A93B]">
          No forecast data loaded
        </span>
      </div>

      <div className="bg-[#050A12] p-2">
        <canvas
          ref={canvasRef}
          width={STAGE_W}
          height={STAGE_H}
          role="img"
          aria-label={`Interactive 32 by 36 Round 1 contract coordinate grid preview showing ${selectedRegion.label}. No model forecast data loaded.`}
          data-testid={testId}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          className="w-full h-auto block select-none cursor-crosshair"
        />
      </div>

      <div
        ref={readoutRef}
        className="border-t border-[#1E2F4A] bg-[#08101D] px-4 py-2 font-mono text-[11px] text-[#BFE6F2] tabular-nums"
      >
        Region: {selectedRegion.label} ({regionCellCount} cells) · Hover grid to inspect 1° coordinates
      </div>
    </div>
  );
}
