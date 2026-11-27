import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import type { GeoRegion } from '../../utils/aggregation';
import type { ScientificColorScale } from '../../utils/colorScales';
import {
  getGridOrientation,
  ROLLOUT_COLS,
  ROLLOUT_ROWS,
} from '../../utils/rolloutStore';

const MARGIN_LEFT = 46;
const MARGIN_TOP = 16;
const MARGIN_RIGHT = 12;
const MARGIN_BOTTOM = 30;
const CELL_PX = 14;
const GRID_W = ROLLOUT_COLS * CELL_PX; // 504
const GRID_H = ROLLOUT_ROWS * CELL_PX; // 448
const STAGE_W = MARGIN_LEFT + GRID_W + MARGIN_RIGHT; // 562
const STAGE_H = MARGIN_TOP + GRID_H + MARGIN_BOTTOM; // 494

const LAT_TICKS = [10, 15, 20, 25, 30, 35];
const LON_TICKS = [70, 75, 80, 85, 90, 95, 100];

export const MIN_SYNC_ZOOM = 1;
export const MAX_SYNC_ZOOM = 5;

export interface SyncViewTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export function clampSyncTransform(t: SyncViewTransform): SyncViewTransform {
  const zoom = Math.min(MAX_SYNC_ZOOM, Math.max(MIN_SYNC_ZOOM, t.zoom));
  const maxPanX = (GRID_W * (zoom - 1)) / 2;
  const maxPanY = (GRID_H * (zoom - 1)) / 2;
  return {
    zoom,
    panX: Math.min(maxPanX, Math.max(-maxPanX, t.panX)),
    panY: Math.min(maxPanY, Math.max(-maxPanY, t.panY)),
  };
}

function findNearestIndex(axis: readonly number[], target: number): number {
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < axis.length; i += 1) {
    const dist = Math.abs(axis[i] - target);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export interface SyncFieldCanvasHandle {
  exportPngDataUrl: (options: { title: string; subtitle: string }) => string | null;
}

interface SyncFieldCanvasProps {
  /** 32x36 values already in display units (e.g. °C, mm/day, mm, days, or signed Δ). */
  displayGrid: Float32Array;
  lat: readonly number[];
  lon: readonly number[];
  landSeaMask?: number[][];
  colorScale: ScientificColorScale;
  unitLabel: string;
  decimals?: number;
  signed?: boolean;
  title: string;
  ariaLabel: string;
  testId?: string;
  selectedRegion?: GeoRegion;
  footprintMask?: Uint8Array;
  viewTransform?: SyncViewTransform;
  onViewTransformChange?: (next: SyncViewTransform) => void;
  compact?: boolean;
}

export const SyncFieldCanvas = forwardRef<
  SyncFieldCanvasHandle,
  SyncFieldCanvasProps
>(function SyncFieldCanvas(
  {
    displayGrid,
    lat,
    lon,
    landSeaMask,
    colorScale,
    unitLabel,
    decimals = 2,
    signed = false,
    title,
    ariaLabel,
    testId,
    selectedRegion,
    footprintMask,
    viewTransform,
    onViewTransformChange,
    compact = false,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const readoutRef = useRef<HTMLDivElement | null>(null);
  const hoverCellRef = useRef<{ row: number; col: number } | null>(null);
  const lockedCellRef = useRef<{ row: number; col: number }>({
    row: Math.floor(ROLLOUT_ROWS / 2),
    col: Math.floor(ROLLOUT_COLS / 2),
  });
  const localTransformRef = useRef<SyncViewTransform>({
    zoom: 1,
    panX: 0,
    panY: 0,
  });
  const dragOriginRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);

  const orientation = useMemo(() => getGridOrientation(lat, lon), [lat, lon]);
  const activeTransform = viewTransform ?? localTransformRef.current;

  const formatCell = useCallback(
    (cell: { row: number; col: number }): string => {
      const idx = cell.row * ROLLOUT_COLS + cell.col;
      const v = displayGrid[idx];
      const latV = lat[cell.row];
      const lonV = lon[cell.col];
      if (!Number.isFinite(v)) {
        return `${latV.toFixed(1)}°N, ${lonV.toFixed(1)}°E [${cell.row},${cell.col}] · Non-finite`;
      }
      const signPrefix = signed && v > 0 ? '+' : '';
      return `${latV.toFixed(1)}°N, ${lonV.toFixed(1)}°E [${cell.row},${cell.col}] · ${signPrefix}${v.toFixed(decimals)} ${unitLabel}`;
    },
    [displayGrid, lat, lon, signed, decimals, unitLabel],
  );

  const legendStops = useMemo(() => {
    const stops: Array<{ offset: string; color: string }> = [];
    for (let i = 0; i <= 12; i += 1) {
      const frac = i / 12;
      const v =
        colorScale.scaleKind === 'sequential-log1p'
          ? Math.expm1(frac * Math.log1p(Math.max(colorScale.max, 1)))
          : colorScale.min + frac * (colorScale.max - colorScale.min);
      stops.push({
        offset: `${(frac * 100).toFixed(1)}%`,
        color: colorScale.mapValueToColor(v),
      });
    }
    return stops;
  }, [colorScale]);

  const gradientId = useMemo(
    () => `sync-cbar-${(testId ?? title).replace(/[^a-zA-Z0-9_-]/g, '-')}`,
    [testId, title],
  );

  const drawCanvas = useCallback(
    (overrideTransform?: SyncViewTransform) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;

      const t = overrideTransform ?? viewTransform ?? localTransformRef.current;
      const { zoom, panX, panY } = t;

      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#08101D';
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);

      const centerX = MARGIN_LEFT + GRID_W / 2;
      const centerY = MARGIN_TOP + GRID_H / 2;
      const gridToCanvasX = (gx: number) =>
        centerX + (gx - GRID_W / 2) * zoom + panX;
      const gridToCanvasY = (gy: number) =>
        centerY + (gy - GRID_H / 2) * zoom + panY;

      ctx.save();
      ctx.beginPath();
      ctx.rect(MARGIN_LEFT, MARGIN_TOP, GRID_W, GRID_H);
      ctx.clip();

      ctx.fillStyle = '#08101D';
      ctx.fillRect(MARGIN_LEFT, MARGIN_TOP, GRID_W, GRID_H);

      const cellW = CELL_PX * zoom;
      const cellH = CELL_PX * zoom;

      // 1. Discrete 32x36 cells (zero interpolation / zero smoothing)
      for (let vRow = 0; vRow < ROLLOUT_ROWS; vRow += 1) {
        const dataRow = orientation.visualRowToDataRow(vRow);
        const y0 = gridToCanvasY(vRow * CELL_PX);
        if (y0 + cellH < MARGIN_TOP || y0 > MARGIN_TOP + GRID_H) continue;

        for (let vCol = 0; vCol < ROLLOUT_COLS; vCol += 1) {
          const dataCol = orientation.visualColToDataCol(vCol);
          const x0 = gridToCanvasX(vCol * CELL_PX);
          if (x0 + cellW < MARGIN_LEFT || x0 > MARGIN_LEFT + GRID_W) continue;

          const val = displayGrid[dataRow * ROLLOUT_COLS + dataCol];
          ctx.fillStyle = colorScale.mapValueToColor(val);
          ctx.fillRect(
            Math.floor(x0),
            Math.floor(y0),
            Math.ceil(cellW),
            Math.ceil(cellH),
          );
        }
      }

      // 2. Land/sea boundary from IC static.land_sea_mask (no political borders)
      // Dual-stroke (dark outer casing + bright inner line) ensures high contrast
      // on both dark sequential fields and near-white diverging RdBu zero cells.
      if (landSeaMask) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const isLand = (vRow: number, vCol: number) => {
          if (
            vRow < 0 ||
            vRow >= ROLLOUT_ROWS ||
            vCol < 0 ||
            vCol >= ROLLOUT_COLS
          ) {
            return false;
          }
          const dr = orientation.visualRowToDataRow(vRow);
          const dc = orientation.visualColToDataCol(vCol);
          return (landSeaMask[dr]?.[dc] ?? 0) >= 0.5;
        };
        for (let vRow = 0; vRow < ROLLOUT_ROWS; vRow += 1) {
          for (let vCol = 0; vCol < ROLLOUT_COLS; vCol += 1) {
            const land = isLand(vRow, vCol);
            const x0 = gridToCanvasX(vCol * CELL_PX);
            const y0 = gridToCanvasY(vRow * CELL_PX);
            if (vCol + 1 < ROLLOUT_COLS && land !== isLand(vRow, vCol + 1)) {
              ctx.moveTo(x0 + cellW, y0);
              ctx.lineTo(x0 + cellW, y0 + cellH);
            }
            if (vRow + 1 < ROLLOUT_ROWS && land !== isLand(vRow + 1, vCol)) {
              ctx.moveTo(x0, y0 + cellH);
              ctx.lineTo(x0 + cellW, y0 + cellH);
            }
          }
        }
        ctx.strokeStyle = 'rgba(8, 16, 29, 0.88)';
        ctx.lineWidth = Math.max(2.3, Math.min(3.4, zoom * 1.45));
        ctx.stroke();

        ctx.strokeStyle = 'rgba(235, 243, 255, 0.92)';
        ctx.lineWidth = Math.max(0.95, Math.min(1.5, zoom * 0.65));
        ctx.stroke();
        ctx.restore();
      }

      // 3. Optional perturbation footprint perimeter outline (cased cyan for light/dark legibility)
      if (footprintMask) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const inMask = (vRow: number, vCol: number) => {
          if (
            vRow < 0 ||
            vRow >= ROLLOUT_ROWS ||
            vCol < 0 ||
            vCol >= ROLLOUT_COLS
          ) {
            return false;
          }
          const dr = orientation.visualRowToDataRow(vRow);
          const dc = orientation.visualColToDataCol(vCol);
          return footprintMask[dr * ROLLOUT_COLS + dc] === 1;
        };
        for (let vRow = 0; vRow < ROLLOUT_ROWS; vRow += 1) {
          for (let vCol = 0; vCol < ROLLOUT_COLS; vCol += 1) {
            if (!inMask(vRow, vCol)) continue;
            const x0 = gridToCanvasX(vCol * CELL_PX);
            const y0 = gridToCanvasY(vRow * CELL_PX);
            if (!inMask(vRow - 1, vCol)) {
              ctx.moveTo(x0, y0);
              ctx.lineTo(x0 + cellW, y0);
            }
            if (!inMask(vRow + 1, vCol)) {
              ctx.moveTo(x0, y0 + cellH);
              ctx.lineTo(x0 + cellW, y0 + cellH);
            }
            if (!inMask(vRow, vCol - 1)) {
              ctx.moveTo(x0, y0);
              ctx.lineTo(x0, y0 + cellH);
            }
            if (!inMask(vRow, vCol + 1)) {
              ctx.moveTo(x0 + cellW, y0);
              ctx.lineTo(x0 + cellW, y0 + cellH);
            }
          }
        }
        ctx.strokeStyle = 'rgba(8, 16, 29, 0.8)';
        ctx.lineWidth = 3.0;
        ctx.stroke();
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      // 4. Optional geographic analysis region box (amber dashed)
      if (selectedRegion) {
        let minVR: number = ROLLOUT_ROWS;
        let maxVR = -1;
        let minVC: number = ROLLOUT_COLS;
        let maxVC = -1;
        for (let r = 0; r < lat.length; r += 1) {
          if (lat[r] >= selectedRegion.latMin && lat[r] <= selectedRegion.latMax) {
            const vr = orientation.dataRowToVisualRow(r);
            if (vr < minVR) minVR = vr;
            if (vr > maxVR) maxVR = vr;
          }
        }
        for (let c = 0; c < lon.length; c += 1) {
          if (lon[c] >= selectedRegion.lonMin && lon[c] <= selectedRegion.lonMax) {
            const vc = orientation.dataColToVisualCol(c);
            if (vc < minVC) minVC = vc;
            if (vc > maxVC) maxVC = vc;
          }
        }
        if (minVR <= maxVR && minVC <= maxVC) {
          ctx.save();
          ctx.strokeStyle = '#F2A93B';
          ctx.lineWidth = 1.6;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(
            gridToCanvasX(minVC * CELL_PX) + 0.5,
            gridToCanvasY(minVR * CELL_PX) + 0.5,
            (maxVC - minVC + 1) * cellW - 1,
            (maxVR - minVR + 1) * cellH - 1,
          );
          ctx.restore();
        }
      }

      // 5. Lat/lon graticule
      ctx.save();
      ctx.strokeStyle = 'rgba(230, 237, 247, 0.18)';
      ctx.lineWidth = 0.75;
      ctx.setLineDash([2, 3]);
      for (const tickLat of LAT_TICKS) {
        const dr = findNearestIndex(lat, tickLat);
        if (Math.abs(lat[dr] - tickLat) > 1.0) continue;
        const y = gridToCanvasY((orientation.dataRowToVisualRow(dr) + 0.5) * CELL_PX);
        ctx.beginPath();
        ctx.moveTo(MARGIN_LEFT, y);
        ctx.lineTo(MARGIN_LEFT + GRID_W, y);
        ctx.stroke();
      }
      for (const tickLon of LON_TICKS) {
        const dc = findNearestIndex(lon, tickLon);
        if (Math.abs(lon[dc] - tickLon) > 1.0) continue;
        const x = gridToCanvasX((orientation.dataColToVisualCol(dc) + 0.5) * CELL_PX);
        ctx.beginPath();
        ctx.moveTo(x, MARGIN_TOP);
        ctx.lineTo(x, MARGIN_TOP + GRID_H);
        ctx.stroke();
      }
      ctx.restore();

      // 6. Hover cell highlight + subtle crosshair guides (imperative, zero React rerenders)
      if (hoverCellRef.current) {
        const vr = orientation.dataRowToVisualRow(hoverCellRef.current.row);
        const vc = orientation.dataColToVisualCol(hoverCellRef.current.col);
        const hx = gridToCanvasX(vc * CELL_PX);
        const hy = gridToCanvasY(vr * CELL_PX);
        ctx.save();
        ctx.strokeStyle = 'rgba(92, 200, 224, 0.34)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(MARGIN_LEFT, hy + cellH / 2);
        ctx.lineTo(MARGIN_LEFT + GRID_W, hy + cellH / 2);
        ctx.moveTo(hx + cellW / 2, MARGIN_TOP);
        ctx.lineTo(hx + cellW / 2, MARGIN_TOP + GRID_H);
        ctx.stroke();
        ctx.strokeStyle = '#5CC8E0';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(hx + 0.5, hy + 0.5, cellW - 1, cellH - 1);
        ctx.restore();
      }

      ctx.restore();

      // Frame & coordinate ticks
      ctx.strokeStyle = '#1E2F4A';
      ctx.lineWidth = 1;
      ctx.strokeRect(MARGIN_LEFT, MARGIN_TOP, GRID_W, GRID_H);

      ctx.fillStyle = '#93A4BD';
      ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const tickLat of LAT_TICKS) {
        const dr = findNearestIndex(lat, tickLat);
        if (Math.abs(lat[dr] - tickLat) > 1.0) continue;
        const y = gridToCanvasY((orientation.dataRowToVisualRow(dr) + 0.5) * CELL_PX);
        if (y >= MARGIN_TOP && y <= MARGIN_TOP + GRID_H) {
          ctx.fillText(`${lat[dr].toFixed(0)}°N`, MARGIN_LEFT - 5, y);
        }
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const tickLon of LON_TICKS) {
        const dc = findNearestIndex(lon, tickLon);
        if (Math.abs(lon[dc] - tickLon) > 1.0) continue;
        const x = gridToCanvasX((orientation.dataColToVisualCol(dc) + 0.5) * CELL_PX);
        if (x >= MARGIN_LEFT && x <= MARGIN_LEFT + GRID_W) {
          ctx.fillText(`${lon[dc].toFixed(0)}°E`, x, MARGIN_TOP + GRID_H + 6);
        }
      }
    },
    [
      viewTransform,
      orientation,
      displayGrid,
      colorScale,
      landSeaMask,
      footprintMask,
      selectedRegion,
      lat,
      lon,
    ],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = STAGE_W * dpr;
    canvas.height = STAGE_H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCanvas();
  }, [drawCanvas]);

  useEffect(() => {
    if (!hoverCellRef.current && readoutRef.current) {
      readoutRef.current.textContent = `Cell: ${formatCell(lockedCellRef.current)}`;
    }
  }, [formatCell]);

  const updateTransform = (next: SyncViewTransform) => {
    const clamped = clampSyncTransform(next);
    if (onViewTransformChange) {
      onViewTransformChange(clamped);
    } else {
      localTransformRef.current = clamped;
      drawCanvas(clamped);
    }
  };

  const clientPointToCell = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const sx = ((clientX - rect.left) * STAGE_W) / rect.width;
    const sy = ((clientY - rect.top) * STAGE_H) / rect.height;
    if (
      sx < MARGIN_LEFT ||
      sx > MARGIN_LEFT + GRID_W ||
      sy < MARGIN_TOP ||
      sy > MARGIN_TOP + GRID_H
    ) {
      return null;
    }
    const t = viewTransform ?? localTransformRef.current;
    const gx = (sx - (MARGIN_LEFT + GRID_W / 2) - t.panX) / t.zoom + GRID_W / 2;
    const gy = (sy - (MARGIN_TOP + GRID_H / 2) - t.panY) / t.zoom + GRID_H / 2;
    const vCol = Math.floor(gx / CELL_PX);
    const vRow = Math.floor(gy / CELL_PX);
    if (vCol < 0 || vCol >= ROLLOUT_COLS || vRow < 0 || vRow >= ROLLOUT_ROWS) {
      return null;
    }
    return {
      row: orientation.visualRowToDataRow(vRow),
      col: orientation.visualColToDataCol(vCol),
    };
  };

  const handleWheel = (e: WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    updateTransform({
      ...activeTransform,
      zoom: activeTransform.zoom * factor,
    });
  };

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOriginRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: activeTransform.panX,
      panY: activeTransform.panY,
    };
  };

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (dragOriginRef.current && e.buttons === 1 && activeTransform.zoom > 1) {
      const dx = e.clientX - dragOriginRef.current.x;
      const dy = e.clientY - dragOriginRef.current.y;
      if (Math.hypot(dx, dy) > 3) {
        const rect = canvasRef.current?.getBoundingClientRect();
        const scaleX = rect ? STAGE_W / rect.width : 1;
        const scaleY = rect ? STAGE_H / rect.height : 1;
        updateTransform({
          ...activeTransform,
          panX: dragOriginRef.current.panX + dx * scaleX,
          panY: dragOriginRef.current.panY + dy * scaleY,
        });
        return;
      }
    }

    const cell = clientPointToCell(e.clientX, e.clientY);
    const prev = hoverCellRef.current;
    if (cell?.row !== prev?.row || cell?.col !== prev?.col) {
      hoverCellRef.current = cell;
      if (readoutRef.current) {
        readoutRef.current.textContent = cell
          ? `Hover: ${formatCell(cell)}`
          : `Cell: ${formatCell(lockedCellRef.current)}`;
      }
      drawCanvas();
    }
  };

  const handlePointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    dragOriginRef.current = null;
    const cell = clientPointToCell(e.clientX, e.clientY);
    if (cell) {
      lockedCellRef.current = cell;
      if (readoutRef.current) {
        readoutRef.current.textContent = `Cell: ${formatCell(cell)}`;
      }
    }
  };

  const handlePointerLeave = () => {
    if (hoverCellRef.current) {
      hoverCellRef.current = null;
      if (readoutRef.current) {
        readoutRef.current.textContent = `Cell: ${formatCell(lockedCellRef.current)}`;
      }
      drawCanvas();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const cur = lockedCellRef.current;
    const vr = orientation.dataRowToVisualRow(cur.row);
    const vc = orientation.dataColToVisualCol(cur.col);
    let nextCell = cur;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      nextCell = { row: orientation.visualRowToDataRow(Math.max(0, vr - 1)), col: cur.col };
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      nextCell = {
        row: orientation.visualRowToDataRow(Math.min(ROLLOUT_ROWS - 1, vr + 1)),
        col: cur.col,
      };
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextCell = { row: cur.row, col: orientation.visualColToDataCol(Math.max(0, vc - 1)) };
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextCell = {
        row: cur.row,
        col: orientation.visualColToDataCol(Math.min(ROLLOUT_COLS - 1, vc + 1)),
      };
    } else {
      return;
    }
    lockedCellRef.current = nextCell;
    hoverCellRef.current = nextCell;
    if (readoutRef.current) {
      readoutRef.current.textContent = `Cell: ${formatCell(nextCell)}`;
    }
    drawCanvas();
  };

  useImperativeHandle(
    ref,
    () => ({
      exportPngDataUrl(options): string | null {
        const src = canvasRef.current;
        if (!src) return null;
        const padTop = 58;
        const padBottom = 56;
        const out = document.createElement('canvas');
        out.width = STAGE_W * 2;
        out.height = (STAGE_H + padTop + padBottom) * 2;
        const ctx = out.getContext('2d');
        if (!ctx) return null;

        ctx.scale(2, 2);
        ctx.fillStyle = '#08101D';
        ctx.fillRect(0, 0, STAGE_W, STAGE_H + padTop + padBottom);

        ctx.fillStyle = '#E6EDF7';
        ctx.font = '600 14px "IBM Plex Sans", sans-serif';
        ctx.fillText(options.title, 16, 24);
        ctx.fillStyle = '#93A4BD';
        ctx.font = '10px "IBM Plex Mono", monospace';
        ctx.fillText(options.subtitle, 16, 42);

        ctx.drawImage(src, 0, padTop, STAGE_W, STAGE_H);

        const ly = padTop + STAGE_H + 12;
        const grad = ctx.createLinearGradient(MARGIN_LEFT, 0, MARGIN_LEFT + GRID_W, 0);
        for (let i = 0; i <= 16; i += 1) {
          const frac = i / 16;
          const v =
            colorScale.scaleKind === 'sequential-log1p'
              ? Math.expm1(frac * Math.log1p(Math.max(colorScale.max, 1)))
              : colorScale.min + frac * (colorScale.max - colorScale.min);
          grad.addColorStop(frac, colorScale.mapValueToColor(v));
        }
        ctx.fillStyle = grad;
        ctx.fillRect(MARGIN_LEFT, ly, GRID_W, 10);
        ctx.strokeStyle = '#1E2F4A';
        ctx.strokeRect(MARGIN_LEFT, ly, GRID_W, 10);

        ctx.fillStyle = '#93A4BD';
        ctx.font = '10px "IBM Plex Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${colorScale.min.toFixed(decimals)} ${unitLabel}`, MARGIN_LEFT, ly + 24);
        ctx.textAlign = 'center';
        ctx.fillText('1° discrete grid · no interpolation · experimental model', MARGIN_LEFT + GRID_W / 2, ly + 24);
        ctx.textAlign = 'right';
        ctx.fillText(`${colorScale.max.toFixed(decimals)} ${unitLabel}`, MARGIN_LEFT + GRID_W, ly + 24);

        return out.toDataURL('image/png');
      },
    }),
    [colorScale, decimals, unitLabel],
  );

  return (
    <div className="space-y-2">
      <div className="space-y-0.5 min-h-[2.25rem]">
        <h3 className="font-mono text-xs font-semibold text-[#E6EDF7] truncate">
          {title}
        </h3>
        <p className="font-mono text-[11px] text-[#93A4BD] tabular-nums whitespace-nowrap">
          Scale: {colorScale.min.toFixed(decimals)} to {colorScale.max.toFixed(decimals)} {unitLabel}
        </p>
      </div>

      <div className="rounded-xs border border-[#1E2F4A] bg-[#08101D] p-1.5">
        <div className={compact ? 'mx-auto max-w-[420px]' : ''}>
          <canvas
            ref={canvasRef}
            width={STAGE_W}
            height={STAGE_H}
            tabIndex={0}
            role="img"
            aria-label={ariaLabel}
            data-testid={testId}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onKeyDown={handleKeyDown}
            className="aspect-[562/494] w-full h-auto block select-none touch-none cursor-crosshair focus:outline-2 focus:outline-[#5CC8E0]"
          />
        </div>
      </div>

      {/* Discrete scale colorbar */}
      <div className="space-y-1">
        <svg
          viewBox="0 0 240 8"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="h-2 w-full rounded-xs border border-[#1E2F4A]"
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              {legendStops.map((s) => (
                <stop key={s.offset} offset={s.offset} stopColor={s.color} />
              ))}
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="240" height="8" fill={`url(#${gradientId})`} />
        </svg>
        <div className="flex items-center justify-between font-mono text-[10px] text-[#93A4BD] tabular-nums">
          <span>
            {colorScale.min.toFixed(decimals)} {unitLabel}
          </span>
          {colorScale.scaleKind === 'diverging-rdbu' && <span>0</span>}
          <span>
            {signed && colorScale.max > 0 ? '+' : ''}
            {colorScale.max.toFixed(decimals)} {unitLabel}
          </span>
        </div>
      </div>

      <div
        ref={readoutRef}
        data-testid={testId ? `${testId}-readout` : undefined}
        className="rounded-xs border border-[#1E2F4A] bg-[#08101D] px-2.5 py-1.5 font-mono text-[11px] text-[#BFE6F2] tabular-nums leading-snug"
      >
        Cell: {formatCell(lockedCellRef.current)}
      </div>
    </div>
  );
});
