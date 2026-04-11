/**
 * Isometric projection math.
 * Converts cartesian (x, y) world coordinates to screen pixel coordinates
 * using a standard 2:1 isometric projection.
 */

/** Tile dimensions in pixels */
export const TILE_W = 64
export const TILE_H = 32

/** Convert cartesian grid (col, row) to isometric screen (px, py) */
export function toIso(col: number, row: number): { x: number; y: number } {
  return {
    x: (col - row) * (TILE_W / 2),
    y: (col + row) * (TILE_H / 2),
  }
}

/** Convert isometric screen (px, py) back to cartesian grid (col, row) */
export function fromIso(px: number, py: number): { col: number; row: number } {
  return {
    col: px / TILE_W + py / TILE_H,
    row: py / TILE_H - px / TILE_W,
  }
}
