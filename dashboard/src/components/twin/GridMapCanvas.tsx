import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import { Maximize2, Minus, Plus, RotateCcw, Wind } from 'lucide-react';
import type { GeoRegion } from '../../utils/aggregation';
import type { ScientificColorScale } from '../../utils/colorScales';
import {
  getGridOrientation,
  ROLLOUT_COLS,
  ROLLOUT_ROWS,
  type DashboardVariable,
} from '../../utils/rolloutStore';
import {
  computeWindDirectionTowardDeg,
  computeWindSpeed,
  formatCompassHeading,
  formatPhysicalValue,
  formatSignedDelta,
  getVariableMeta,
  toDisplayDelta,
  toDisplayValue,
} from '../../utils/units';

const MARGIN_LEFT = 54;
const MARGIN_TOP = 24;
const MARGIN_RIGHT = 20;
const MARGIN_BOTTOM = 42;
const CELL_PX = 16;
const GRID_W = ROLLOUT_COLS * CELL_PX; // 576
const GRID_H = ROLLOUT_ROWS * CELL_PX; // 512
const STAGE_W = MARGIN_LEFT + GRID_W + MARGIN_RIGHT; // 650
const STAGE_H = MARGIN_TOP + GRID_H + MARGIN_BOTTOM; // 578

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const LAT_TICKS = [10, 15, 20, 25, 30, 35];
const LON_TICKS = [70, 75, 80, 85, 90, 95, 100];

export interface GridMapExportOptions {
  title: string;
  subtitle: string;
  watermarkText?: string;
}

export interface GridMapCanvasHandle {
  exportPngDataUrl: (options: GridMapExportOptions) => string | null;
}

interface GridMapCanvasProps {
  /** Raw 32x36 values (either physical state values or raw Day B - Day A deltas). */
  rawGrid: Float32Array;
  /** Optional u10 and v10 raw grids (m/s) for wind vector overlay and cell inspection. */
  u10Grid: Float32Array;
  v10Grid: Float32Array;
  lat: readonly number[];
  lon: readonly number[];
  landSeaMask?: number[][];
  variable: DashboardVariable;
  isDifferenceMode: boolean;
  colorScale: ScientificColorScale;
  selectedRegion: GeoRegion;
  showWindVectors: boolean;
  onToggleWindVectors: (next: boolean) => void;
  windStride: number;
  onWindStrideChange: (stride: number) => void;
}

interface InspectedCell {
  row: number;
  col: number;
}

interface ViewTransform {
  zoom: number;
  panX: number;
  panY: number;
}

function clampTransform(t: ViewTransform): ViewTransform {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.zoom));
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

export const GridMapCanvas = forwardRef<GridMapCanvasHandle, GridMapCanvasProps>(
  function GridMapCanvas(
    {
      rawGrid,
      u10Grid,
      v10Grid,
      lat,
      lon,
      landSeaMask,
      variable,
      isDifferenceMode,
      colorScale,
      selectedRegion,
      showWindVectors,
      onToggleWindVectors,
      windStride,
      onWindStrideChange,
    },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const hoverReadoutRef = useRef<HTMLDivElement | null>(null);
    const hoverCellRef = useRef<InspectedCell | null>(null);
    const viewRef = useRef<ViewTransform>({ zoom: 1, panX: 0, panY: 0 });
    const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
    const dragOriginRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
    const pinchOriginRef = useRef<{ dist: number; zoom: number } | null>(null);
    const didDragRef = useRef(false);

    // State only for explicit zoom badge & locked keyboard/click inspection (never updated on hover)
    const [zoomLevel, setZoomLevel] = useState(1);
    const [lockedCell, setLockedCell] = useState<InspectedCell>({
      row: Math.floor(ROLLOUT_ROWS / 2),
      col: Math.floor(ROLLOUT_COLS / 2),
    });

    const orientation = useMemo(() => getGridOrientation(lat, lon), [lat, lon]);
    const vMeta = useMemo(() => getVariableMeta(variable), [variable]);

    const formatCellSummary = useCallback(
      (cell: InspectedCell): string => {
        const idx = cell.row * ROLLOUT_COLS + cell.col;
        const rawVal = rawGrid[idx];
        const latVal = lat[cell.row];
        const lonVal = lon[cell.col];
        const u = u10Grid[idx];
        const v = v10Grid[idx];
        const speed = computeWindSpeed(u, v);
        const dirDeg = computeWindDirectionTowardDeg(u, v);
        const compass = formatCompassHeading(dirDeg);

        if (isDifferenceMode) {
          const dispDelta = toDisplayDelta(variable, rawVal);
          return `[r=${cell.row}, c=${cell.col}] ${latVal.toFixed(1)}°N, ${lonVal.toFixed(1)}°E · Δ Display: ${formatSignedDelta(dispDelta, vMeta.displayUnit, vMeta.decimals)} · Δ Raw: ${formatSignedDelta(rawVal, vMeta.rawUnit, vMeta.decimals)}`;
        }

        const dispVal = toDisplayValue(variable, rawVal);
        const windText =
          dirDeg === null
            ? `Wind ${speed.toFixed(2)} m/s (Calm)`
            : `Wind ${speed.toFixed(2)} m/s toward ${dirDeg.toFixed(0)}° (${compass})`;

        return `[r=${cell.row}, c=${cell.col}] ${latVal.toFixed(1)}°N, ${lonVal.toFixed(1)}°E · Display: ${formatPhysicalValue(dispVal, vMeta.displayUnit, vMeta.decimals)} · Raw: ${formatPhysicalValue(rawVal, vMeta.rawUnit, vMeta.decimals)} · ${windText}`;
      },
      [rawGrid, lat, lon, u10Grid, v10Grid, isDifferenceMode, variable, vMeta],
    );

    const drawCanvas = useCallback(
      (targetCtx?: CanvasRenderingContext2D, targetWidth?: number, targetHeight?: number) => {
        const canvas = canvasRef.current;
        const ctx = targetCtx ?? canvas?.getContext('2d');
        if (!ctx) return;

        const w = targetWidth ?? STAGE_W;
        const h = targetHeight ?? STAGE_H;

        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#08101D';
        ctx.fillRect(0, 0, w, h);

        const { zoom, panX, panY } = viewRef.current;
        const centerX = MARGIN_LEFT + GRID_W / 2;
        const centerY = MARGIN_TOP + GRID_H / 2;

        // Helper mapping visual grid cell coordinate to canvas coordinate under current pan/zoom
        const gridToCanvasX = (gx: number) =>
          centerX + (gx - GRID_W / 2) * zoom + panX;
        const gridToCanvasY = (gy: number) =>
          centerY + (gy - GRID_H / 2) * zoom + panY;

        // Clip strictly to the 32x36 grid viewport
        ctx.save();
        ctx.beginPath();
        ctx.rect(MARGIN_LEFT, MARGIN_TOP, GRID_W, GRID_H);
        ctx.clip();

        ctx.fillStyle = '#08101D';
        ctx.fillRect(MARGIN_LEFT, MARGIN_TOP, GRID_W, GRID_H);

        // 1. Render exact discrete 32x36 rectangular grid cells (zero interpolation/smoothing)
        const cellW = CELL_PX * zoom;
        const cellH = CELL_PX * zoom;

        for (let vRow = 0; vRow < ROLLOUT_ROWS; vRow += 1) {
          const dataRow = orientation.visualRowToDataRow(vRow);
          const y0 = gridToCanvasY(vRow * CELL_PX);
          if (y0 + cellH < MARGIN_TOP || y0 > MARGIN_TOP + GRID_H) continue;

          for (let vCol = 0; vCol < ROLLOUT_COLS; vCol += 1) {
            const dataCol = orientation.visualColToDataCol(vCol);
            const x0 = gridToCanvasX(vCol * CELL_PX);
            if (x0 + cellW < MARGIN_LEFT || x0 > MARGIN_LEFT + GRID_W) continue;

            const rawVal = rawGrid[dataRow * ROLLOUT_COLS + dataCol];
            const valForScale = isDifferenceMode
              ? toDisplayDelta(variable, rawVal)
              : toDisplayValue(variable, rawVal);

            ctx.fillStyle = colorScale.mapValueToColor(valForScale);
            ctx.fillRect(
              Math.floor(x0),
              Math.floor(y0),
              Math.ceil(cellW),
              Math.ceil(cellH),
            );
          }
        }

        // Subtle cell borders when zoomed in so discrete 1° pixels stay crisp
        if (zoom >= 1.5) {
          ctx.strokeStyle = 'rgba(8, 16, 29, 0.25)';
          ctx.lineWidth = 0.75;
          for (let vRow = 0; vRow <= ROLLOUT_ROWS; vRow += 1) {
            const y = gridToCanvasY(vRow * CELL_PX);
            ctx.beginPath();
            ctx.moveTo(MARGIN_LEFT, y);
            ctx.lineTo(MARGIN_LEFT + GRID_W, y);
            ctx.stroke();
          }
          for (let vCol = 0; vCol <= ROLLOUT_COLS; vCol += 1) {
            const x = gridToCanvasX(vCol * CELL_PX);
            ctx.beginPath();
            ctx.moveTo(x, MARGIN_TOP);
            ctx.lineTo(x, MARGIN_TOP + GRID_H);
            ctx.stroke();
          }
        }

        // 2. Land/sea boundary strictly from provided IC `static.land_sea_mask` (zero political borders)
        // Dual-stroke casing preserves crisp coastline visibility across both dark and light colormap stops.
        if (landSeaMask) {
          ctx.save();
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();

          const isLandAtVisual = (vRow: number, vCol: number): boolean => {
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
              const land = isLandAtVisual(vRow, vCol);
              const x0 = gridToCanvasX(vCol * CELL_PX);
              const y0 = gridToCanvasY(vRow * CELL_PX);
              const x1 = x0 + cellW;
              const y1 = y0 + cellH;

              if (vCol + 1 < ROLLOUT_COLS && land !== isLandAtVisual(vRow, vCol + 1)) {
                ctx.moveTo(x1, y0);
                ctx.lineTo(x1, y1);
              }
              if (vRow + 1 < ROLLOUT_ROWS && land !== isLandAtVisual(vRow + 1, vCol)) {
                ctx.moveTo(x0, y1);
                ctx.lineTo(x1, y1);
              }
            }
          }
          ctx.strokeStyle = 'rgba(8, 16, 29, 0.88)';
          ctx.lineWidth = Math.max(2.4, Math.min(3.5, zoom * 1.45));
          ctx.stroke();

          ctx.strokeStyle = 'rgba(235, 243, 255, 0.92)';
          ctx.lineWidth = Math.max(1.05, Math.min(1.65, zoom * 0.7));
          ctx.stroke();
          ctx.restore();
        }

        // 3. Lat/lon graticule hairlines aligned to exact IC coordinates
        ctx.save();
        ctx.strokeStyle = 'rgba(230, 237, 247, 0.22)';
        ctx.lineWidth = 0.85;
        ctx.setLineDash([3, 3]);
        for (const tickLat of LAT_TICKS) {
          const dataRow = findNearestIndex(lat, tickLat);
          if (Math.abs(lat[dataRow] - tickLat) > 1.0) continue;
          const vRow = orientation.dataRowToVisualRow(dataRow);
          const y = gridToCanvasY((vRow + 0.5) * CELL_PX);
          ctx.beginPath();
          ctx.moveTo(MARGIN_LEFT, y);
          ctx.lineTo(MARGIN_LEFT + GRID_W, y);
          ctx.stroke();
        }
        for (const tickLon of LON_TICKS) {
          const dataCol = findNearestIndex(lon, tickLon);
          if (Math.abs(lon[dataCol] - tickLon) > 1.0) continue;
          const vCol = orientation.dataColToVisualCol(dataCol);
          const x = gridToCanvasX((vCol + 0.5) * CELL_PX);
          ctx.beginPath();
          ctx.moveTo(x, MARGIN_TOP);
          ctx.lineTo(x, MARGIN_TOP + GRID_H);
          ctx.stroke();
        }
        ctx.restore();

        // 4. Selected geographic region bounding box
        let regMinVRow: number = ROLLOUT_ROWS;
        let regMaxVRow = -1;
        let regMinVCol: number = ROLLOUT_COLS;
        let regMaxVCol = -1;
        for (let r = 0; r < lat.length; r += 1) {
          if (lat[r] >= selectedRegion.latMin && lat[r] <= selectedRegion.latMax) {
            const vr = orientation.dataRowToVisualRow(r);
            if (vr < regMinVRow) regMinVRow = vr;
            if (vr > regMaxVRow) regMaxVRow = vr;
          }
        }
        for (let c = 0; c < lon.length; c += 1) {
          if (lon[c] >= selectedRegion.lonMin && lon[c] <= selectedRegion.lonMax) {
            const vc = orientation.dataColToVisualCol(c);
            if (vc < regMinVCol) regMinVCol = vc;
            if (vc > regMaxVCol) regMaxVCol = vc;
          }
        }
        if (regMinVRow <= regMaxVRow && regMinVCol <= regMaxVCol) {
          const rx0 = gridToCanvasX(regMinVCol * CELL_PX);
          const ry0 = gridToCanvasY(regMinVRow * CELL_PX);
          const rw = (regMaxVCol - regMinVCol + 1) * cellW;
          const rh = (regMaxVRow - regMinVRow + 1) * cellH;
          ctx.save();
          ctx.strokeStyle = '#F2A93B';
          ctx.lineWidth = 1.6;
          ctx.setLineDash([5, 3]);
          ctx.strokeRect(rx0 + 0.5, ry0 + 0.5, rw - 1, rh - 1);
          ctx.restore();
        }

        // 5. Optional wind-vector overlay (drawn every Nth cell, pointing toward direction of flow)
        if (showWindVectors) {
          const stride = Math.max(1, Math.min(6, windStride));
          ctx.save();
          ctx.strokeStyle = 'rgba(241, 246, 253, 0.94)';
          ctx.fillStyle = 'rgba(241, 246, 253, 0.94)';
          ctx.shadowColor = 'rgba(6, 13, 26, 0.88)';
          ctx.shadowBlur = 2.5;
          ctx.lineWidth = 1.2;

          const maxArrowPx = CELL_PX * stride * 0.48 * Math.min(zoom, 2.5);

          for (let vRow = Math.floor(stride / 2); vRow < ROLLOUT_ROWS; vRow += stride) {
            const dataRow = orientation.visualRowToDataRow(vRow);
            const cy = gridToCanvasY((vRow + 0.5) * CELL_PX);
            if (cy < MARGIN_TOP - 20 || cy > MARGIN_TOP + GRID_H + 20) continue;

            for (let vCol = Math.floor(stride / 2); vCol < ROLLOUT_COLS; vCol += stride) {
              const dataCol = orientation.visualColToDataCol(vCol);
              const cx = gridToCanvasX((vCol + 0.5) * CELL_PX);
              if (cx < MARGIN_LEFT - 20 || cx > MARGIN_LEFT + GRID_W + 20) continue;

              const idx = dataRow * ROLLOUT_COLS + dataCol;
              const u = u10Grid[idx];
              const v = v10Grid[idx];
              const speed = Math.hypot(u, v);
              if (!Number.isFinite(speed) || speed < 0.2) continue;

              // Scale 15 m/s to maxArrowPx, clamped for visual clarity
              const len = Math.min(maxArrowPx, Math.max(4, (speed / 15) * maxArrowPx));
              const ux = u / speed;
              // Canvas Y increases downward, while +v10 points North (upward)
              const uy = -v / speed;

              const x1 = cx - ux * len * 0.45;
              const y1 = cy - uy * len * 0.45;
              const x2 = cx + ux * len * 0.55;
              const y2 = cy + uy * len * 0.55;

              // Dark casing behind shaft + arrowhead for high contrast on bright yellow/white cells
              ctx.strokeStyle = 'rgba(8, 16, 29, 0.78)';
              ctx.lineWidth = 2.6;
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();

              // Crisp foreground shaft
              ctx.strokeStyle = 'rgba(230, 237, 247, 0.96)';
              ctx.lineWidth = 1.15;
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();

              // Crisp arrowhead pointing toward flow direction with dark outline
              const headLen = Math.min(5.5, Math.max(3, len * 0.34));
              const angle = Math.atan2(y2 - y1, x2 - x1);
              ctx.beginPath();
              ctx.moveTo(x2, y2);
              ctx.lineTo(
                x2 - headLen * Math.cos(angle - Math.PI / 6),
                y2 - headLen * Math.sin(angle - Math.PI / 6),
              );
              ctx.lineTo(
                x2 - headLen * Math.cos(angle + Math.PI / 6),
                y2 - headLen * Math.sin(angle + Math.PI / 6),
              );
              ctx.closePath();
              ctx.strokeStyle = 'rgba(8, 16, 29, 0.85)';
              ctx.lineWidth = 1.4;
              ctx.stroke();
              ctx.fillStyle = 'rgba(230, 237, 247, 0.96)';
              ctx.fill();
            }
          }
          ctx.restore();
        }

        // 6. Highlight locked (keyboard/click) cell & transient hover cell
        const drawCellOutline = (
          cell: InspectedCell,
          stroke: string,
          lineWidth: number,
        ) => {
          const vr = orientation.dataRowToVisualRow(cell.row);
          const vc = orientation.dataColToVisualCol(cell.col);
          const x0 = gridToCanvasX(vc * CELL_PX);
          const y0 = gridToCanvasY(vr * CELL_PX);
          ctx.strokeStyle = stroke;
          ctx.lineWidth = lineWidth;
          ctx.strokeRect(x0 + 0.5, y0 + 0.5, cellW - 1, cellH - 1);
        };

        drawCellOutline(lockedCell, '#E6EDF7', 2);
        if (hoverCellRef.current) {
          const vr = orientation.dataRowToVisualRow(hoverCellRef.current.row);
          const vc = orientation.dataColToVisualCol(hoverCellRef.current.col);
          const hx = gridToCanvasX(vc * CELL_PX);
          const hy = gridToCanvasY(vr * CELL_PX);
          ctx.save();
          ctx.strokeStyle = 'rgba(92, 200, 224, 0.36)';
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.moveTo(MARGIN_LEFT, hy + cellH / 2);
          ctx.lineTo(MARGIN_LEFT + GRID_W, hy + cellH / 2);
          ctx.moveTo(hx + cellW / 2, MARGIN_TOP);
          ctx.lineTo(hx + cellW / 2, MARGIN_TOP + GRID_H);
          ctx.stroke();
          ctx.restore();
          if (
            hoverCellRef.current.row !== lockedCell.row ||
            hoverCellRef.current.col !== lockedCell.col
          ) {
            drawCellOutline(hoverCellRef.current, '#5CC8E0', 1.5);
          }
        }

        ctx.restore();

        // Outer frame around grid viewport
        ctx.strokeStyle = '#22344F';
        ctx.lineWidth = 1;
        ctx.strokeRect(MARGIN_LEFT, MARGIN_TOP, GRID_W, GRID_H);

        // Coordinate tick labels outside the clipped grid area
        ctx.fillStyle = '#93A4BD';
        ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';

        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (const tickLat of LAT_TICKS) {
          const dataRow = findNearestIndex(lat, tickLat);
          if (Math.abs(lat[dataRow] - tickLat) > 1.0) continue;
          const vRow = orientation.dataRowToVisualRow(dataRow);
          const y = gridToCanvasY((vRow + 0.5) * CELL_PX);
          if (y >= MARGIN_TOP && y <= MARGIN_TOP + GRID_H) {
            ctx.fillText(`${lat[dataRow].toFixed(1)}°N`, MARGIN_LEFT - 7, y);
          }
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (const tickLon of LON_TICKS) {
          const dataCol = findNearestIndex(lon, tickLon);
          if (Math.abs(lon[dataCol] - tickLon) > 1.0) continue;
          const vCol = orientation.dataColToVisualCol(dataCol);
          const x = gridToCanvasX((vCol + 0.5) * CELL_PX);
          if (x >= MARGIN_LEFT && x <= MARGIN_LEFT + GRID_W) {
            ctx.fillText(`${lon[dataCol].toFixed(1)}°E`, x, MARGIN_TOP + GRID_H + 8);
          }
        }

        ctx.fillText(
          'Longitude (1° discrete grid · no interpolation · no political borders)',
          MARGIN_LEFT + GRID_W / 2,
          STAGE_H - 16,
        );
      },
      [
        rawGrid,
        u10Grid,
        v10Grid,
        lat,
        lon,
        landSeaMask,
        orientation,
        colorScale,
        variable,
        isDifferenceMode,
        selectedRegion,
        showWindVectors,
        windStride,
        lockedCell,
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
      drawCanvas(ctx);
    }, [drawCanvas]);

    // Keep hover readout synced with locked cell when pointer is not hovering
    useEffect(() => {
      if (!hoverCellRef.current && hoverReadoutRef.current) {
        hoverReadoutRef.current.textContent = `Inspected cell: ${formatCellSummary(lockedCell)}`;
      }
    }, [lockedCell, formatCellSummary]);

    const applyZoomDelta = useCallback(
      (factor: number) => {
        const next = clampTransform({
          ...viewRef.current,
          zoom: viewRef.current.zoom * factor,
        });
        viewRef.current = next;
        setZoomLevel(Number(next.zoom.toFixed(2)));
        drawCanvas();
      },
      [drawCanvas],
    );

    const handleResetView = useCallback(() => {
      viewRef.current = { zoom: 1, panX: 0, panY: 0 };
      setZoomLevel(1);
      drawCanvas();
    }, [drawCanvas]);

    const clientPointToCell = useCallback(
      (clientX: number, clientY: number): InspectedCell | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
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

        const { zoom, panX, panY } = viewRef.current;
        const centerX = MARGIN_LEFT + GRID_W / 2;
        const centerY = MARGIN_TOP + GRID_H / 2;
        const gx = (sx - centerX - panX) / zoom + GRID_W / 2;
        const gy = (sy - centerY - panY) / zoom + GRID_H / 2;

        const vCol = Math.floor(gx / CELL_PX);
        const vRow = Math.floor(gy / CELL_PX);
        if (
          vCol < 0 ||
          vCol >= ROLLOUT_COLS ||
          vRow < 0 ||
          vRow >= ROLLOUT_ROWS
        ) {
          return null;
        }

        return {
          row: orientation.visualRowToDataRow(vRow),
          col: orientation.visualColToDataCol(vCol),
        };
      },
      [orientation],
    );

    const handleWheel = (event: WheelEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.2 : 1 / 1.2;
      applyZoomDelta(factor);
    };

    const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      pointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      didDragRef.current = false;

      if (pointersRef.current.size === 1) {
        dragOriginRef.current = {
          x: event.clientX,
          y: event.clientY,
          panX: viewRef.current.panX,
          panY: viewRef.current.panY,
        };
        pinchOriginRef.current = null;
      } else if (pointersRef.current.size === 2) {
        const pts = Array.from(pointersRef.current.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        pinchOriginRef.current = { dist, zoom: viewRef.current.zoom };
        dragOriginRef.current = null;
      }
    };

    const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
      if (pointersRef.current.has(event.pointerId)) {
        pointersRef.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
      }

      // Two-finger pinch zoom
      if (pointersRef.current.size === 2 && pinchOriginRef.current) {
        const pts = Array.from(pointersRef.current.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        if (pinchOriginRef.current.dist > 5) {
          const nextZoom =
            pinchOriginRef.current.zoom * (dist / pinchOriginRef.current.dist);
          viewRef.current = clampTransform({
            ...viewRef.current,
            zoom: nextZoom,
          });
          setZoomLevel(Number(viewRef.current.zoom.toFixed(2)));
          didDragRef.current = true;
          drawCanvas();
        }
        return;
      }

      // Single-pointer pan when zoomed in
      if (pointersRef.current.size === 1 && dragOriginRef.current) {
        const dx = event.clientX - dragOriginRef.current.x;
        const dy = event.clientY - dragOriginRef.current.y;
        if (Math.hypot(dx, dy) > 4) {
          didDragRef.current = true;
          const canvas = canvasRef.current;
          const rect = canvas?.getBoundingClientRect();
          const scaleX = rect ? STAGE_W / rect.width : 1;
          const scaleY = rect ? STAGE_H / rect.height : 1;
          viewRef.current = clampTransform({
            ...viewRef.current,
            panX: dragOriginRef.current.panX + dx * scaleX,
            panY: dragOriginRef.current.panY + dy * scaleY,
          });
          drawCanvas();
          return;
        }
      }

      // Imperative hover inspection — ZERO React state updates on mouse move!
      const cell = clientPointToCell(event.clientX, event.clientY);
      const prev = hoverCellRef.current;
      if (cell?.row !== prev?.row || cell?.col !== prev?.col) {
        hoverCellRef.current = cell;
        if (hoverReadoutRef.current) {
          hoverReadoutRef.current.textContent = cell
            ? `Hover cell: ${formatCellSummary(cell)}`
            : `Inspected cell: ${formatCellSummary(lockedCell)}`;
        }
        drawCanvas();
      }
    };

    const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
      pointersRef.current.delete(event.pointerId);
      if (pointersRef.current.size === 0) {
        if (!didDragRef.current) {
          const cell = clientPointToCell(event.clientX, event.clientY);
          if (cell) {
            setLockedCell(cell);
          }
        }
        dragOriginRef.current = null;
        pinchOriginRef.current = null;
      }
    };

    const handlePointerLeave = () => {
      if (hoverCellRef.current !== null) {
        hoverCellRef.current = null;
        if (hoverReadoutRef.current) {
          hoverReadoutRef.current.textContent = `Inspected cell: ${formatCellSummary(lockedCell)}`;
        }
        drawCanvas();
      }
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
      const vRow = orientation.dataRowToVisualRow(lockedCell.row);
      const vCol = orientation.dataColToVisualCol(lockedCell.col);

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        const nextVRow = Math.max(0, vRow - 1);
        setLockedCell({
          row: orientation.visualRowToDataRow(nextVRow),
          col: lockedCell.col,
        });
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        const nextVRow = Math.min(ROLLOUT_ROWS - 1, vRow + 1);
        setLockedCell({
          row: orientation.visualRowToDataRow(nextVRow),
          col: lockedCell.col,
        });
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const nextVCol = Math.max(0, vCol - 1);
        setLockedCell({
          row: lockedCell.row,
          col: orientation.visualColToDataCol(nextVCol),
        });
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        const nextVCol = Math.min(ROLLOUT_COLS - 1, vCol + 1);
        setLockedCell({
          row: lockedCell.row,
          col: orientation.visualColToDataCol(nextVCol),
        });
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        applyZoomDelta(1.25);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        applyZoomDelta(1 / 1.25);
      } else if (event.key === '0') {
        event.preventDefault();
        handleResetView();
      }
    };

    // Expose client-side PNG exporter with embedded header, legend, and optional fixture watermark
    useImperativeHandle(
      ref,
      () => ({
        exportPngDataUrl(options: GridMapExportOptions): string | null {
          const sourceCanvas = canvasRef.current;
          if (!sourceCanvas) return null;

          const padTop = 66;
          const padBottom = 68;
          const outW = STAGE_W * 2;
          const outH = (STAGE_H + padTop + padBottom) * 2;

          const out = document.createElement('canvas');
          out.width = outW;
          out.height = outH;
          const ctx = out.getContext('2d');
          if (!ctx) return null;

          ctx.scale(2, 2);
          ctx.fillStyle = '#08101D';
          ctx.fillRect(0, 0, STAGE_W, STAGE_H + padTop + padBottom);

          // Title & subtitle
          ctx.fillStyle = '#E6EDF7';
          ctx.font = '600 15px "IBM Plex Sans", sans-serif';
          ctx.fillText(options.title, 18, 26);

          ctx.fillStyle = '#93A4BD';
          ctx.font = '11px "IBM Plex Mono", monospace';
          ctx.fillText(options.subtitle, 18, 44);

          if (options.watermarkText) {
            ctx.fillStyle = '#F2A93B';
            ctx.font = '600 11px "IBM Plex Mono", monospace';
            ctx.fillText(options.watermarkText, 18, 60);
          }

          // Map stage
          ctx.drawImage(sourceCanvas, 0, padTop, STAGE_W, STAGE_H);

          // Footer legend bar
          const legendY = padTop + STAGE_H + 14;
          const legendX = MARGIN_LEFT;
          const legendW = GRID_W;
          const grad = ctx.createLinearGradient(legendX, 0, legendX + legendW, 0);
          for (let i = 0; i <= 16; i += 1) {
            const t = i / 16;
            const v =
              colorScale.scaleKind === 'sequential-log1p'
                ? Math.expm1(t * Math.log1p(Math.max(colorScale.max, 1)))
                : colorScale.min + t * (colorScale.max - colorScale.min);
            grad.addColorStop(t, colorScale.mapValueToColor(v));
          }
          ctx.fillStyle = grad;
          ctx.fillRect(legendX, legendY, legendW, 10);
          ctx.strokeStyle = '#22344F';
          ctx.strokeRect(legendX, legendY, legendW, 10);

          ctx.fillStyle = '#93A4BD';
          ctx.font = '10px "IBM Plex Mono", monospace';
          ctx.textAlign = 'left';
          ctx.fillText(
            `${colorScale.min.toFixed(1)} ${vMeta.displayUnit}`,
            legendX,
            legendY + 24,
          );
          ctx.textAlign = 'center';
          ctx.fillText(
            `${colorScale.paletteName} · Approx. 1° grid-cell averages (not station data)`,
            legendX + legendW / 2,
            legendY + 24,
          );
          ctx.textAlign = 'right';
          ctx.fillText(
            `${colorScale.max.toFixed(1)} ${vMeta.displayUnit}`,
            legendX + legendW,
            legendY + 24,
          );

          if (options.watermarkText) {
            ctx.save();
            ctx.translate(STAGE_W / 2, padTop + STAGE_H / 2);
            ctx.rotate(-0.35);
            ctx.fillStyle = 'rgba(242, 169, 59, 0.34)';
            ctx.font = '700 22px "IBM Plex Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(options.watermarkText, 0, 0);
            ctx.restore();
          }

          return out.toDataURL('image/png');
        },
      }),
      [colorScale, vMeta],
    );

    return (
      <div className="space-y-2.5">
        {/* Compact instrument map toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2F4A] pb-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => applyZoomDelta(1.25)}
              aria-label="Zoom in map"
              className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xs border border-[#1E2F4A] bg-[#08101D] px-2 text-xs font-mono text-[#E6EDF7] hover:border-[#5CC8E0] transition-colors duration-150"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => applyZoomDelta(1 / 1.25)}
              aria-label="Zoom out map"
              className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xs border border-[#1E2F4A] bg-[#08101D] px-2 text-xs font-mono text-[#E6EDF7] hover:border-[#5CC8E0] transition-colors duration-150"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleResetView}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xs border border-[#1E2F4A] bg-[#08101D] px-2.5 text-xs font-mono text-[#93A4BD] hover:border-[#5CC8E0] hover:text-[#E6EDF7] transition-colors duration-150 whitespace-nowrap tabular-nums"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset ({zoomLevel.toFixed(1)}×)</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onToggleWindVectors(!showWindVectors)}
              aria-pressed={showWindVectors}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xs border px-3 text-xs font-mono transition-colors duration-150 whitespace-nowrap ${
                showWindVectors
                  ? 'border-[#5CC8E0] bg-[#142238] text-[#BFE6F2]'
                  : 'border-[#1E2F4A] bg-[#08101D] text-[#93A4BD] hover:border-[#5CC8E0]/60 hover:text-[#E6EDF7]'
              }`}
            >
              <Wind className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Wind vectors</span>
            </button>

            {showWindVectors && (
              <label className="inline-flex items-center gap-1.5 text-xs font-mono text-[#93A4BD]">
                <span>Stride</span>
                <select
                  aria-label="Wind vector cell stride"
                  value={windStride}
                  onChange={(e) => onWindStrideChange(Number(e.target.value))}
                  className="min-h-[36px] rounded-xs border border-[#1E2F4A] bg-[#08101D] px-2 text-xs font-mono text-[#E6EDF7]"
                >
                  <option value={2}>Every 2nd cell</option>
                  <option value={3}>Every 3rd cell</option>
                  <option value={4}>Every 4th cell</option>
                </select>
              </label>
            )}
          </div>
        </div>

        {/* Dominant discrete 32x36 canvas viewport */}
        <div className="instrument-map-frame p-1.5">
          <canvas
            ref={canvasRef}
            width={STAGE_W}
            height={STAGE_H}
            tabIndex={0}
            role="application"
            aria-label={`Interactive 32 by 36 grid map for ${vMeta.label}. Use arrow keys to step across grid cells, plus and minus keys to zoom, and 0 to reset view.`}
            data-testid="twin-grid-canvas"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onKeyDown={handleKeyDown}
            className="aspect-[650/578] w-full mx-auto object-contain block select-none touch-none cursor-crosshair focus:outline-2 focus:outline-[#5CC8E0]"
          />
        </div>

        {/* Imperative hover / keyboard inspection readout (zero hover rerenders) */}
        <div
          ref={hoverReadoutRef}
          aria-live="polite"
          data-testid="map-cell-readout"
          className="border-y border-[#1E2F4A] bg-[#08101D] px-3 py-2 font-mono text-xs text-[#E6EDF7] tabular-nums leading-relaxed"
        >
          Inspected cell: {formatCellSummary(lockedCell)}
        </div>

        {/* Resolution notice & keyboard legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#93A4BD]">
          <span className="inline-flex items-center gap-1.5">
            <Maximize2 className="h-3 w-3 text-[#5CC8E0] shrink-0" aria-hidden="true" />
            <span>
              Approximate 1° (~110 km) grid-cell averages — not station data.{' '}
              {landSeaMask
                ? 'Land/sea outline drawn from loaded IC land_sea_mask.'
                : 'No land_sea_mask present in loaded IC file.'}
            </span>
          </span>
          <span className="font-mono text-[11px] text-[#93A4BD]">
            Keys: Arrow cells · + / − zoom · 0 reset
          </span>
        </div>
      </div>
    );
  },
);
