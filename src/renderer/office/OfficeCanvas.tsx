import React, { useRef, useEffect, useCallback } from 'react'
import type { OfficeSnapshot, OfficeWorker, WorkerActivity } from '../../shared/office-types'
import { AGENTS } from '../../shared/agents'
import { toIso, TILE_W, TILE_H } from './scene/isoMath'
import { getDeskPositions, GRID_COLS, GRID_ROWS } from './scene/OfficeLayout'

interface OfficeCanvasProps {
  snapshot: OfficeSnapshot | null
}

const ACTIVITY_COLORS: Record<WorkerActivity, string> = {
  spawning: '#a78bfa', // purple — arriving
  working: '#4ade80', // green — active
  'idle-coffee': '#fbbf24', // amber — break
  'idle-window': '#94a3b8', // slate — staring
}

const DESK_COLOR = '#334155'
const FLOOR_COLOR = '#1e293b'
const WALL_COLOR = '#0f172a'

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
): void {
  const color = ACTIVITY_COLORS[worker.activity]
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
  ctx.fillStyle = '#fff'
  ctx.fillText(agentDef?.icon ?? '?', cx, cy - 16)

  // Name tag
  ctx.font = '9px sans-serif'
  ctx.fillStyle = '#cbd5e1'
  ctx.textBaseline = 'top'
  ctx.fillText(worker.projectName.slice(0, 10), cx, cy - 4)
}

export function OfficeCanvas({ snapshot }: OfficeCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dprRef = useRef(window.devicePixelRatio || 1)

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const dpr = dprRef.current
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const { width, height } = rect

    // Clear
    ctx.fillStyle = WALL_COLOR
    ctx.fillRect(0, 0, width, height)

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
        drawIsoTile(ctx, x, y, FLOOR_COLOR)
      }
    }

    // Draw desks
    const desks = getDeskPositions()
    for (const desk of desks) {
      const { x, y } = toIso(desk.col, desk.row)
      drawIsoTile(ctx, x, y, DESK_COLOR, TILE_W * 0.8, TILE_H * 0.8)
    }

    // Draw workers at their desk positions
    if (snapshot) {
      for (const worker of snapshot.workers) {
        const desk = desks.find((d) => d.index === worker.deskIndex)
        if (!desk) continue
        const { x, y } = toIso(desk.col, desk.row)
        drawAvatar(ctx, x, y, worker)
      }
    }

    // Empty state message
    if (!snapshot || snapshot.workers.length === 0) {
      ctx.restore()
      ctx.fillStyle = '#64748b'
      ctx.font = '14px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('No active workers — start an agent session', width / 2, height / 2)
      return
    }

    ctx.restore()
  }, [snapshot])

  useEffect(() => {
    render()
  }, [render])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const observer = new ResizeObserver(() => {
      dprRef.current = window.devicePixelRatio || 1
      render()
    })
    observer.observe(canvas)

    return () => observer.disconnect()
  }, [render])

  return <canvas ref={canvasRef} aria-label="Office diorama view" role="img" />
}
