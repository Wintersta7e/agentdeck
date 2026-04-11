import React, { useRef, useEffect, useCallback } from 'react'
import type { OfficeSnapshot, OfficeWorker, WorkerActivity } from '../../shared/office-types'
import { AGENTS } from '../../shared/agents'
import { toIso, TILE_W, TILE_H } from './scene/isoMath'
import { getDeskPositions, GRID_COLS, GRID_ROWS } from './scene/OfficeLayout'

interface OfficeCanvasProps {
  snapshot: OfficeSnapshot | null
}

// Read colors from CSS custom properties at render time
function resolveToken(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#888'
}

interface ThemeColors {
  activity: Record<WorkerActivity, string>
  floor1: string
  floor2: string
  wall: string
  wallSide: string
  desk: string
  deskTop: string
  deskLeg: string
  monitor: string
  monitorScreen: string
  chairSeat: string
  plant: string
  plantPot: string
  coffee: string
  windowFrame: string
  windowGlass: string
  avatarOutline: string
  labelText: string
  emptyText: string
  accentGlow: string
}

function getThemeColors(): ThemeColors {
  const bg0 = resolveToken('--bg0')
  const bg1 = resolveToken('--bg1')
  const bg2 = resolveToken('--bg2')
  const bg3 = resolveToken('--bg3')
  const bg4 = resolveToken('--bg4')
  const text2 = resolveToken('--text2')
  const text3 = resolveToken('--text3')
  const accent = resolveToken('--accent-primary')
  const green = resolveToken('--green')
  const purple = resolveToken('--purple')
  const blue = resolveToken('--blue')

  return {
    activity: {
      spawning: purple,
      working: green,
      'idle-coffee': accent,
      'idle-window': text3,
    },
    floor1: bg1,
    floor2: bg2,
    wall: bg3,
    wallSide: bg0,
    desk: bg3,
    deskTop: bg4,
    deskLeg: bg2,
    monitor: bg0,
    monitorScreen: blue,
    chairSeat: bg3,
    plant: green,
    plantPot: bg3,
    coffee: accent,
    windowFrame: bg3,
    windowGlass: blue,
    avatarOutline: bg0,
    labelText: text2,
    emptyText: text3,
    accentGlow: accent,
  }
}

// ── Drawing primitives ───────────────────────────────────────────

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

function drawIsoCube(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  depth: number,
  topColor: string,
  leftColor: string,
  rightColor: string,
): void {
  const hw = w / 2
  const hh = h / 2
  // Top face
  ctx.beginPath()
  ctx.moveTo(cx, cy - hh - depth)
  ctx.lineTo(cx + hw, cy - depth)
  ctx.lineTo(cx, cy + hh - depth)
  ctx.lineTo(cx - hw, cy - depth)
  ctx.closePath()
  ctx.fillStyle = topColor
  ctx.fill()
  // Left face
  ctx.beginPath()
  ctx.moveTo(cx - hw, cy - depth)
  ctx.lineTo(cx, cy + hh - depth)
  ctx.lineTo(cx, cy + hh)
  ctx.lineTo(cx - hw, cy)
  ctx.closePath()
  ctx.fillStyle = leftColor
  ctx.fill()
  // Right face
  ctx.beginPath()
  ctx.moveTo(cx + hw, cy - depth)
  ctx.lineTo(cx, cy + hh - depth)
  ctx.lineTo(cx, cy + hh)
  ctx.lineTo(cx + hw, cy)
  ctx.closePath()
  ctx.fillStyle = rightColor
  ctx.fill()
}

function darken(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return hex
  const nr = Math.max(0, Math.round(r * (1 - amount)))
  const ng = Math.max(0, Math.round(g * (1 - amount)))
  const nb = Math.max(0, Math.round(b * (1 - amount)))
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`
}

// ── Furniture drawing ────────────────────────────────────────────

function drawDesk(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  colors: ThemeColors,
): void {
  // Desk surface (flat isometric cube)
  drawIsoCube(
    ctx,
    cx,
    cy + 4,
    TILE_W * 0.7,
    TILE_H * 0.7,
    3,
    colors.deskTop,
    colors.desk,
    darken(colors.desk, 0.15),
  )

  // Monitor
  const monW = 14
  const monH = 12
  ctx.fillStyle = colors.monitor
  ctx.fillRect(cx - monW / 2, cy - monH - 6, monW, monH)
  // Screen glow
  ctx.fillStyle = colors.monitorScreen
  ctx.globalAlpha = 0.4
  ctx.fillRect(cx - monW / 2 + 1, cy - monH - 5, monW - 2, monH - 2)
  ctx.globalAlpha = 1.0
  // Monitor stand
  ctx.fillStyle = colors.monitor
  ctx.fillRect(cx - 1, cy - 6, 2, 3)
}

function drawChair(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  colors: ThemeColors,
): void {
  // Seat (small isometric diamond below and in front of desk)
  drawIsoTile(ctx, cx, cy + 14, colors.chairSeat, TILE_W * 0.3, TILE_H * 0.3)
  // Back rest
  ctx.fillStyle = darken(colors.chairSeat, 0.2)
  ctx.fillRect(cx - 4, cy + 8, 8, 3)
}

function drawPlant(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  colors: ThemeColors,
): void {
  // Pot
  ctx.fillStyle = colors.plantPot
  ctx.beginPath()
  ctx.moveTo(cx - 5, cy - 4)
  ctx.lineTo(cx + 5, cy - 4)
  ctx.lineTo(cx + 4, cy + 2)
  ctx.lineTo(cx - 4, cy + 2)
  ctx.closePath()
  ctx.fill()
  // Leaves (three circles)
  ctx.fillStyle = colors.plant
  ctx.beginPath()
  ctx.arc(cx, cy - 10, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx - 4, cy - 7, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx + 4, cy - 7, 4, 0, Math.PI * 2)
  ctx.fill()
}

function drawCoffeeMachine(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  colors: ThemeColors,
): void {
  // Body
  drawIsoCube(
    ctx,
    cx,
    cy,
    18,
    10,
    14,
    darken(colors.desk, 0.1),
    darken(colors.desk, 0.25),
    darken(colors.desk, 0.35),
  )
  // Cup indicator
  ctx.fillStyle = colors.coffee
  ctx.beginPath()
  ctx.arc(cx, cy - 10, 2, 0, Math.PI * 2)
  ctx.fill()
}

function drawWindow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  colors: ThemeColors,
): void {
  // Window frame
  ctx.fillStyle = colors.windowFrame
  ctx.fillRect(cx - 12, cy - 20, 24, 20)
  // Glass panes
  ctx.fillStyle = colors.windowGlass
  ctx.globalAlpha = 0.25
  ctx.fillRect(cx - 10, cy - 18, 9, 7)
  ctx.fillRect(cx + 1, cy - 18, 9, 7)
  ctx.fillRect(cx - 10, cy - 9, 9, 7)
  ctx.fillRect(cx + 1, cy - 9, 9, 7)
  ctx.globalAlpha = 1.0
}

// ── Avatar drawing ───────────────────────────────────────────────

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  worker: OfficeWorker,
  colors: ThemeColors,
  time: number,
): void {
  const color = colors.activity[worker.activity]
  const agentDef = AGENTS.find((a) => a.id === worker.agentId)

  // Idle animations
  let bobY = 0
  if (worker.activity === 'working') {
    bobY = Math.sin(time / 400 + worker.deskIndex) * 1.5
  } else if (worker.activity === 'idle-coffee') {
    bobY = Math.sin(time / 800 + worker.deskIndex) * 2
  }

  const ay = cy - 20 + bobY

  // Shadow
  ctx.fillStyle = colors.avatarOutline
  ctx.globalAlpha = 0.3
  ctx.beginPath()
  ctx.ellipse(cx, cy + 2, 6, 3, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1.0

  // Body (rounded rectangle)
  ctx.fillStyle = color
  const bodyW = 10
  const bodyH = 12
  ctx.beginPath()
  ctx.roundRect(cx - bodyW / 2, ay, bodyW, bodyH, 3)
  ctx.fill()

  // Head (circle)
  ctx.beginPath()
  ctx.arc(cx, ay - 4, 6, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  // Head outline
  ctx.strokeStyle = darken(color, 0.3)
  ctx.lineWidth = 1
  ctx.stroke()

  // Agent icon on body
  ctx.font = '8px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = colors.avatarOutline
  ctx.fillText(agentDef?.icon ?? '?', cx, ay + 5)

  // Activity indicator dot
  if (worker.activity === 'working') {
    ctx.fillStyle = color
    ctx.globalAlpha = 0.5 + Math.sin(time / 300) * 0.3
    ctx.beginPath()
    ctx.arc(cx + 7, ay - 4, 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1.0
  }

  // Name tag below
  ctx.font = '9px sans-serif'
  ctx.fillStyle = colors.labelText
  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'
  ctx.fillText(worker.projectName.slice(0, 10), cx, cy + 6)
}

// ── Back wall ────────────────────────────────────────────────────

function drawBackWall(
  ctx: CanvasRenderingContext2D,
  colors: ThemeColors,
  wallHeight: number,
): void {
  // Left wall segment (row=0 edge)
  for (let c = 0; c < GRID_COLS; c++) {
    const { x, y } = toIso(c, 0)
    const { x: x2 } = toIso(c + 1, 0)
    ctx.fillStyle = colors.wall
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x2, y - TILE_H / 2)
    ctx.lineTo(x2, y - TILE_H / 2 - wallHeight)
    ctx.lineTo(x, y - wallHeight)
    ctx.closePath()
    ctx.fill()
  }
  // Top wall segment (col=0 edge)
  for (let r = 0; r < GRID_ROWS; r++) {
    const { x, y } = toIso(0, r)
    const { x: x2, y: y2 } = toIso(0, r + 1)
    ctx.fillStyle = colors.wallSide
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x2, y2)
    ctx.lineTo(x2, y2 - wallHeight)
    ctx.lineTo(x, y - wallHeight)
    ctx.closePath()
    ctx.fill()
  }
}

// ── Main component ───────────────────────────────────────────────

export function OfficeCanvas({ snapshot }: OfficeCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dprRef = useRef(window.devicePixelRatio || 1)
  const renderRef = useRef<(() => void) | undefined>(undefined)
  const frameRef = useRef(0)
  const timeRef = useRef(0)

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const dpr = dprRef.current
    const newW = Math.round(rect.width * dpr)
    const newH = Math.round(rect.height * dpr)
    if (canvas.width !== newW || canvas.height !== newH) {
      canvas.width = newW
      canvas.height = newH
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const { width, height } = rect
    const colors = getThemeColors()
    const time = timeRef.current

    // Clear
    ctx.fillStyle = colors.wallSide
    ctx.fillRect(0, 0, width, height)

    // Center the grid
    const centerIso = toIso(GRID_COLS / 2, GRID_ROWS / 2)
    const offsetX = width / 2 - centerIso.x
    const offsetY = height / 2.5 - centerIso.y + 30

    ctx.save()
    ctx.translate(offsetX, offsetY)

    // Back walls
    drawBackWall(ctx, colors, 40)

    // Windows on back wall
    for (let c = 2; c < GRID_COLS; c += 3) {
      const { x, y } = toIso(c, 0)
      drawWindow(ctx, x + TILE_W / 4, y - 25, colors)
    }

    // Floor tiles (checkerboard)
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const { x, y } = toIso(c, r)
        const floorColor = (c + r) % 2 === 0 ? colors.floor1 : colors.floor2
        drawIsoTile(ctx, x, y, floorColor)
      }
    }

    // Decorative elements — plants in corners, coffee machine
    const plantPositions = [
      { col: 1, row: 1 },
      { col: GRID_COLS - 2, row: 1 },
      { col: 1, row: GRID_ROWS - 2 },
    ]
    for (const pos of plantPositions) {
      const { x, y } = toIso(pos.col, pos.row)
      drawPlant(ctx, x, y - 6, colors)
    }

    // Coffee machine
    const coffeePos = toIso(GRID_COLS - 2, GRID_ROWS - 2)
    drawCoffeeMachine(ctx, coffeePos.x, coffeePos.y - 4, colors)

    // Desks + chairs (draw before workers for layering)
    const desks = getDeskPositions()
    for (const desk of desks) {
      const { x, y } = toIso(desk.col, desk.row)
      drawDesk(ctx, x, y, colors)
      drawChair(ctx, x, y, colors)
    }

    // Workers at their desks
    if (snapshot) {
      for (const worker of snapshot.workers) {
        const desk = desks.find((d) => d.index === worker.deskIndex)
        if (!desk) continue
        const { x, y } = toIso(desk.col, desk.row)
        drawAvatar(ctx, x, y, worker, colors, time)
      }
    }

    ctx.restore()

    // Empty state overlay
    if (!snapshot || snapshot.workers.length === 0) {
      ctx.fillStyle = colors.emptyText
      ctx.font = '13px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('No active workers — start an agent session', width / 2, height - 40)
    }
  }, [snapshot])

  useEffect(() => {
    renderRef.current = render
  }, [render])

  // Animation loop for idle bobbing
  useEffect(() => {
    let running = true
    function loop(): void {
      if (!running) return
      timeRef.current = performance.now()
      renderRef.current?.()
      frameRef.current = requestAnimationFrame(loop)
    }
    // Only animate when there are workers
    if (snapshot && snapshot.workers.length > 0) {
      loop()
    } else {
      render()
    }
    return () => {
      running = false
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [snapshot, render])

  // Resize observer (stable, registered once)
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
