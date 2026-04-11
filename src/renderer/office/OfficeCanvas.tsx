import React, { useRef, useEffect, useCallback } from 'react'
import type { OfficeSnapshot, OfficeWorker, WorkerActivity } from '../../shared/office-types'
import { AGENTS } from '../../shared/agents'
import { toIso, TILE_W, TILE_H } from './scene/isoMath'
import { getDeskPositions, GRID_COLS, GRID_ROWS } from './scene/OfficeLayout'

interface OfficeCanvasProps {
  snapshot: OfficeSnapshot | null
}

// ARCH-06: Read colors from CSS custom properties at render time
function resolveToken(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#888'
}

function getThemeColors(): {
  activity: Record<WorkerActivity, string>
  desk: string
  floor: string
  wall: string
  avatarText: string
  labelText: string
  emptyText: string
} {
  return {
    activity: {
      spawning: resolveToken('--purple'),
      working: resolveToken('--green'),
      'idle-coffee': resolveToken('--accent-primary'),
      'idle-window': resolveToken('--text3'),
    },
    desk: resolveToken('--bg3'),
    floor: resolveToken('--bg1'),
    wall: resolveToken('--bg0'),
    avatarText: resolveToken('--text0'),
    labelText: resolveToken('--text2'),
    emptyText: resolveToken('--text3'),
  }
}

function drawIsoTile(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
  w = TILE_W,
  h = TILE_H,
): void {
  const hw = w / 2
  const hh = h / 2
  ctx.beginPath()
  ctx.moveTo(cx, cy - hh)
  ctx.lineTo(cx + hw, cy)
  ctx.lineTo(cx, cy + hh)
  ctx.lineTo(cx - hw, cy)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  worker: OfficeWorker,
  colors: ReturnType<typeof getThemeColors>,
): void {
  const color = colors.activity[worker.activity]
  const agentDef = AGENTS.find((a) => a.id === worker.agentId)

  // Body (circle)
  ctx.beginPath()
  ctx.arc(cx, cy - 16, 8, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()

  // Agent icon
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = colors.avatarText
  ctx.fillText(agentDef?.icon ?? '?', cx, cy - 16)

  // Name tag
  ctx.font = '9px sans-serif'
  ctx.fillStyle = colors.labelText
  ctx.textBaseline = 'top'
  ctx.fillText(worker.projectName.slice(0, 10), cx, cy - 4)
}

export function OfficeCanvas({ snapshot }: OfficeCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dprRef = useRef(window.devicePixelRatio || 1)
  // LEAK-05: Store render in a ref so ResizeObserver doesn't depend on it
  const renderRef = useRef<(() => void) | undefined>(undefined)

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const dpr = dprRef.current

    // BUG-05: Only reset canvas dimensions when size actually changed
    const newW = Math.round(rect.width * dpr)
    const newH = Math.round(rect.height * dpr)
    if (canvas.width !== newW || canvas.height !== newH) {
      canvas.width = newW
      canvas.height = newH
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const { width, height } = rect
    const colors = getThemeColors()

    // Clear
    ctx.fillStyle = colors.wall
    ctx.fillRect(0, 0, width, height)

    // Empty state — draw before floor to avoid save/restore mismatch
    if (!snapshot || snapshot.workers.length === 0) {
      // Still draw the floor for visual interest
      const centerIso = toIso(GRID_COLS / 2, GRID_ROWS / 2)
      const offsetX = width / 2 - centerIso.x
      const offsetY = height / 3 - centerIso.y

      ctx.save()
      ctx.translate(offsetX, offsetY)
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const { x, y } = toIso(c, r)
          drawIsoTile(ctx, x, y, colors.floor)
        }
      }
      const desks = getDeskPositions()
      for (const desk of desks) {
        const { x, y } = toIso(desk.col, desk.row)
        drawIsoTile(ctx, x, y, colors.desk, TILE_W * 0.8, TILE_H * 0.8)
      }
      ctx.restore()

      ctx.fillStyle = colors.emptyText
      ctx.font = '14px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('No active workers — start an agent session', width / 2, height / 2)
      return
    }

    // Center the grid in the canvas
    const centerIso = toIso(GRID_COLS / 2, GRID_ROWS / 2)
    const offsetX = width / 2 - centerIso.x
    const offsetY = height / 3 - centerIso.y

    ctx.save()
    ctx.translate(offsetX, offsetY)

    // Draw floor tiles
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const { x, y } = toIso(c, r)
        drawIsoTile(ctx, x, y, colors.floor)
      }
    }

    // Draw desks
    const desks = getDeskPositions()
    for (const desk of desks) {
      const { x, y } = toIso(desk.col, desk.row)
      drawIsoTile(ctx, x, y, colors.desk, TILE_W * 0.8, TILE_H * 0.8)
    }

    // Draw workers at their desk positions
    for (const worker of snapshot.workers) {
      const desk = desks.find((d) => d.index === worker.deskIndex)
      if (!desk) continue
      const { x, y } = toIso(desk.col, desk.row)
      drawAvatar(ctx, x, y, worker, colors)
    }

    ctx.restore()
  }, [snapshot])

  // Keep renderRef current
  useEffect(() => {
    renderRef.current = render
  }, [render])

  // Initial render
  useEffect(() => {
    render()
  }, [render])

  // LEAK-05: ResizeObserver registered once, uses renderRef
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const observer = new ResizeObserver(() => {
      dprRef.current = window.devicePixelRatio || 1
      renderRef.current?.()
    })
    observer.observe(canvas)

    return () => observer.disconnect()
  }, [])

  return <canvas ref={canvasRef} aria-label="Office diorama view" role="img" />
}
