import { GRID_SPEC } from '../config/projectFacts';

/**
 * Exact Round 1 contract 1° coordinate axes:
 * - Latitude:  32 cells south-to-north (6.5°N .. 37.5°N)
 * - Longitude: 36 cells west-to-east  (65.5°E .. 100.5°E)
 */
export const CONTRACT_LAT: readonly number[] = Array.from(
  { length: GRID_SPEC.rows },
  (_, r) => GRID_SPEC.latMin + r,
);

export const CONTRACT_LON: readonly number[] = Array.from(
  { length: GRID_SPEC.cols },
  (_, c) => GRID_SPEC.lonMin + c,
);

/**
 * Coarse 1° physical land-vs-ocean indicator strictly for conceptual schematic
 * and empty-state coordinate previews.
 *
 * Scientific & cartographic constraints:
 * - Physical coastline silhouette ONLY (Arabian Sea, Indian Peninsula, Bay of
 *   Bengal, Sri Lanka, and northern continental landmass).
 * - ZERO political boundaries, state lines, or disputed borders.
 * - Never substitutes for `static.land_sea_mask` from a loaded `mom-ic-v1` file.
 */
function isSchematicLandCell(lat: number, lon: number): boolean {
  // Sri Lanka physical island silhouette (approx 6.5..9.5 N, 80.5..81.5 E)
  if (lat >= 6.5 && lat <= 9.5 && lon >= 80.5 && lon <= 81.5) {
    return true;
  }

  // Peninsular coast from southern tip (~8.5 N, 77.5 E) widening northward to ~22.5 N
  if (lat >= 8.5 && lat < 22.5) {
    // West coast (Western Ghats / Konkan / Malabar)
    let westLon = 77.0 - (lat - 8.5) * 0.34;
    if (lat >= 20.5) {
      // Saurashtra / Gujarat peninsula projection west to ~69.5 E
      westLon = 70.5 - (lat - 20.5) * 0.8;
    }

    // East coast (Coromandel / Andhra / Odisha curving northeast into Head Bay)
    let eastLon = 78.8 + (lat - 8.5) * 0.25;
    if (lat >= 15.5) {
      eastLon = 80.5 + (lat - 15.5) * 1.05;
    }

    if (lon >= westLon && lon <= eastLon) {
      return true;
    }

    // Eastern mainland across Myanmar / Arakan coast on far eastern edge of domain
    if (lat >= 16.5 && lon >= 94.5 + Math.max(0, 20.5 - lat) * 0.65) {
      return true;
    }

    return false;
  }

  // Continental landmass north of 22.5 N (from Makran / Indus coast to Bengal delta & east)
  if (lat >= 22.5) {
    // Northern Arabian Sea coast around 24.5..25.5 N west of 69.5 E
    if (lat < 25.5 && lon < 69.5) {
      return false;
    }
    // Head Bay of Bengal indentation around 22.5 N, 88..91.5 E
    if (lat === 22.5 && lon >= 88.5 && lon <= 91.5) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Precomputed [32][36] coarse physical land-sea mask (1 = land, 0 = ocean)
 * aligned south-to-north (row 0 = 6.5°N) and west-to-east (col 0 = 65.5°E).
 */
export const SCHEMATIC_LAND_SEA_MASK: number[][] = CONTRACT_LAT.map((lat) =>
  CONTRACT_LON.map((lon) => (isSchematicLandCell(lat, lon) ? 1 : 0)),
);

/**
 * Draws the coarse 1° physical land-sea coastline contour (no political borders)
 * onto an existing 2D canvas coordinate frame.
 */
export function strokeSchematicCoastline(
  ctx: CanvasRenderingContext2D,
  options: {
    marginLeft: number;
    marginTop: number;
    cellSize: number;
    rows?: number;
    cols?: number;
    strokeStyle?: string;
    lineWidth?: number;
    landFillStyle?: string;
  },
) {
  const rows = options.rows ?? GRID_SPEC.rows;
  const cols = options.cols ?? GRID_SPEC.cols;
  const { marginLeft, marginTop, cellSize } = options;

  const isLandVisual = (vRow: number, vCol: number): boolean => {
    if (vRow < 0 || vRow >= rows || vCol < 0 || vCol >= cols) return false;
    const dataRow = rows - 1 - vRow;
    return (SCHEMATIC_LAND_SEA_MASK[dataRow]?.[vCol] ?? 0) === 1;
  };

  if (options.landFillStyle) {
    ctx.save();
    ctx.fillStyle = options.landFillStyle;
    for (let vRow = 0; vRow < rows; vRow += 1) {
      for (let vCol = 0; vCol < cols; vCol += 1) {
        if (isLandVisual(vRow, vCol)) {
          ctx.fillRect(
            marginLeft + vCol * cellSize,
            marginTop + vRow * cellSize,
            cellSize,
            cellSize,
          );
        }
      }
    }
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = options.strokeStyle ?? 'rgba(191, 230, 242, 0.72)';
  ctx.lineWidth = options.lineWidth ?? 1.45;
  ctx.lineCap = 'square';
  ctx.beginPath();

  for (let vRow = 0; vRow < rows; vRow += 1) {
    for (let vCol = 0; vCol < cols; vCol += 1) {
      const land = isLandVisual(vRow, vCol);
      const x0 = marginLeft + vCol * cellSize;
      const y0 = marginTop + vRow * cellSize;
      const x1 = x0 + cellSize;
      const y1 = y0 + cellSize;

      if (vCol + 1 < cols && land !== isLandVisual(vRow, vCol + 1)) {
        ctx.moveTo(x1, y0);
        ctx.lineTo(x1, y1);
      }
      if (vRow + 1 < rows && land !== isLandVisual(vRow + 1, vCol)) {
        ctx.moveTo(x0, y1);
        ctx.lineTo(x1, y1);
      }
    }
  }
  ctx.stroke();
  ctx.restore();
}
