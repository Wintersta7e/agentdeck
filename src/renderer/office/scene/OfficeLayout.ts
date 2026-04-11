/**
 * Office floor plan layout.
 * Defines zones (bullpen desks, lounge, door) and their grid positions.
 */

export interface DeskPosition {
  col: number
  row: number
  index: number
}

export interface OfficeZone {
  name: string
  type: 'desk' | 'lounge' | 'door' | 'wall'
  col: number
  row: number
  width: number
  height: number
}

/** 4 rows x 5 columns of desks in the bullpen area */
const DESK_COLS = 5
const DESK_ROWS = 4
const DESK_START_COL = 2
const DESK_START_ROW = 2

export function getDeskPositions(): DeskPosition[] {
  const desks: DeskPosition[] = []
  for (let r = 0; r < DESK_ROWS; r++) {
    for (let c = 0; c < DESK_COLS; c++) {
      desks.push({
        col: DESK_START_COL + c * 2,
        row: DESK_START_ROW + r * 2,
        index: r * DESK_COLS + c,
      })
    }
  }
  return desks
}

export function getOfficeZones(): OfficeZone[] {
  return [
    { name: 'floor', type: 'wall', col: 0, row: 0, width: 14, height: 12 },
    { name: 'door', type: 'door', col: 0, row: 5, width: 1, height: 2 },
    { name: 'lounge', type: 'lounge', col: 12, row: 1, width: 2, height: 4 },
  ]
}

/** Grid dimensions for the office floor */
export const GRID_COLS = 14
export const GRID_ROWS = 12
