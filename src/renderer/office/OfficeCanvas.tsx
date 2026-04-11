import React, { useRef, useEffect } from 'react'
import type { OfficeSnapshot, OfficeWorker } from '../../shared/office-types'
import { AGENTS } from '../../shared/agents'

interface OfficeCanvasProps {
  snapshot: OfficeSnapshot | null
}

// ── Pixel art palette (Stardew Valley-inspired warm tones) ────────
const PALETTE = {
  bg: '#2a1f1e',
  floorA: '#8b7355',
  floorB: '#7a6548',
  wallTop: '#5c4a3a',
  wallFront: '#4a3c2e',
  wallDark: '#3d3028',
  deskTop: '#a08060',
  deskFront: '#806040',
  deskSide: '#6a5035',
  screenOff: '#1a2030',
  screenOn: '#40c060',
  screenIdle: '#304050',
  screenText: '#80ff80',
  chairBack: '#604030',
  chairSeat: '#705038',
  plantGreen: '#3a8040',
  plantDark: '#2a6030',
  potBrown: '#8a6040',
  windowFrame: '#6a5545',
  windowGlass: '#6090b0',
  windowGlassLight: '#80b0d0',
  shadow: 'rgba(0,0,0,0.25)',
  textLight: '#e0d0b8',
  textDim: '#a09080',
  bubbleBg: '#3d3028',
  bubbleBorder: '#60a060',
  // Worker colors per activity
  bodyWorking: '#4a90d0',
  bodyIdle: '#7a8888',
  bodyCoffee: '#c08040',
  bodySpawning: '#9070c0',
  skinTone: '#f0c0a0',
  hair: '#604030',
}

// ── Internal resolution: render at this size, then upscale ────────
const INTERNAL_W = 320
const INTERNAL_H = 200

// ── Isometric grid (coarser for pixel art) ────────────────────────
const TILE_W = 16
const TILE_H = 8
const GRID_COLS = 12
const GRID_ROWS = 10
const DESK_COLS = 5
const DESK_ROWS = 4

function toIso(col: number, row: number): { x: number; y: number } {
  return {
    x: (col - row) * (TILE_W / 2),
    y: (col + row) * (TILE_H / 2),
  }
}

function getDeskPos(index: number): { col: number; row: number } {
  const c = index % DESK_COLS
  const r = Math.floor(index / DESK_COLS)
  return { col: 2 + c * 2, row: 2 + r * 2 }
}

// ── Pixel drawing helpers ─────────────────────────────────────────

function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), w, h)
}

function isoTile(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string): void {
  const hw = TILE_W / 2
  const hh = TILE_H / 2
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(cx, cy - hh)
  ctx.lineTo(cx + hw, cy)
  ctx.lineTo(cx, cy + hh)
  ctx.lineTo(cx - hw, cy)
  ctx.closePath()
  ctx.fill()
}

// ── Scene elements ────────────────────────────────────────────────

function drawWalls(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  // Back wall (top edge)
  for (let c = 0; c < GRID_COLS; c++) {
    const { x, y } = toIso(c, 0)
    const sx = ox + x
    const sy = oy + y
    px(ctx, sx - TILE_W / 2, sy - 24, TILE_W, 24, PALETTE.wallTop)
  }
  // Side wall (left edge)
  for (let r = 0; r < GRID_ROWS; r++) {
    const { x, y } = toIso(0, r)
    const sx = ox + x
    const sy = oy + y
    px(ctx, sx - TILE_W / 2 - 4, sy - 24, 5, 28, PALETTE.wallFront)
  }
  // Windows on back wall
  for (let c = 2; c < GRID_COLS; c += 3) {
    const { x, y } = toIso(c, 0)
    const sx = ox + x
    const sy = oy + y - 16
    px(ctx, sx - 5, sy, 10, 10, PALETTE.windowFrame)
    px(ctx, sx - 4, sy + 1, 3, 3, PALETTE.windowGlass)
    px(ctx, sx + 1, sy + 1, 3, 3, PALETTE.windowGlassLight)
    px(ctx, sx - 4, sy + 5, 3, 3, PALETTE.windowGlassLight)
    px(ctx, sx + 1, sy + 5, 3, 3, PALETTE.windowGlass)
  }
}

function drawFloor(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const { x, y } = toIso(c, r)
      isoTile(ctx, ox + x, oy + y, (c + r) % 2 === 0 ? PALETTE.floorA : PALETTE.floorB)
    }
  }
}

function drawDesk(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  worker: OfficeWorker | undefined,
  time: number,
): void {
  // Desk body
  px(ctx, sx - 6, sy - 2, 12, 3, PALETTE.deskTop)
  px(ctx, sx - 6, sy + 1, 12, 2, PALETTE.deskFront)
  // Legs
  px(ctx, sx - 5, sy + 3, 1, 3, PALETTE.deskSide)
  px(ctx, sx + 4, sy + 3, 1, 3, PALETTE.deskSide)

  // Monitor
  px(ctx, sx - 3, sy - 8, 6, 5, '#1a1a2a')
  // Screen content
  if (worker?.activity === 'working') {
    // Active: green scrolling text effect
    const textLine = Math.floor(time / 200) % 4
    px(ctx, sx - 2, sy - 7 + textLine, 4, 1, PALETTE.screenText)
    px(ctx, sx - 2, sy - 7, 4, 4, PALETTE.screenOn)
    // Scrolling text lines
    for (let i = 0; i < 3; i++) {
      const lineW = 2 + ((time / 100 + i * 37) % 3)
      px(ctx, sx - 1, sy - 6 + i, Math.min(lineW, 3), 1, PALETTE.screenText)
    }
  } else if (worker) {
    px(ctx, sx - 2, sy - 7, 4, 4, PALETTE.screenIdle)
  } else {
    px(ctx, sx - 2, sy - 7, 4, 4, PALETTE.screenOff)
  }
  // Monitor stand
  px(ctx, sx, sy - 3, 1, 1, '#333')

  // Chair (in front of desk)
  px(ctx, sx - 2, sy + 5, 4, 2, PALETTE.chairSeat)
  px(ctx, sx - 2, sy + 3, 4, 2, PALETTE.chairBack)
}

function drawPlant(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  // Pot
  px(ctx, sx - 2, sy, 4, 3, PALETTE.potBrown)
  // Leaves (pixel clusters)
  px(ctx, sx - 2, sy - 3, 4, 3, PALETTE.plantGreen)
  px(ctx, sx - 1, sy - 5, 2, 2, PALETTE.plantGreen)
  px(ctx, sx - 3, sy - 2, 1, 2, PALETTE.plantDark)
  px(ctx, sx + 2, sy - 2, 1, 2, PALETTE.plantDark)
}

function drawCoffeeMachine(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  px(ctx, sx - 3, sy - 6, 6, 6, PALETTE.deskSide)
  px(ctx, sx - 2, sy - 5, 4, 4, PALETTE.wallDark)
  // Cup
  px(ctx, sx - 1, sy - 1, 2, 2, '#e0e0e0')
  // Indicator light
  px(ctx, sx, sy - 5, 1, 1, '#ff4040')
}

function drawWorker(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  worker: OfficeWorker,
  time: number,
): void {
  const bodyColor =
    worker.activity === 'working'
      ? PALETTE.bodyWorking
      : worker.activity === 'idle-coffee'
        ? PALETTE.bodyCoffee
        : worker.activity === 'spawning'
          ? PALETTE.bodySpawning
          : PALETTE.bodyIdle

  // Bobbing
  let bob = 0
  if (worker.activity === 'working') {
    bob = Math.floor(Math.sin(time / 300 + worker.deskIndex) * 1.5)
  } else if (worker.activity === 'idle-coffee') {
    bob = Math.floor(Math.sin(time / 600 + worker.deskIndex) * 1)
  }

  const wy = sy - 12 + bob

  // Shadow
  ctx.fillStyle = PALETTE.shadow
  ctx.fillRect(sx - 2, sy + 1, 5, 1)

  // Body
  px(ctx, sx - 2, wy + 4, 4, 5, bodyColor)
  // Head
  px(ctx, sx - 2, wy, 4, 4, PALETTE.skinTone)
  // Hair
  px(ctx, sx - 2, wy - 1, 4, 2, PALETTE.hair)
  // Eyes
  px(ctx, sx - 1, wy + 1, 1, 1, '#222')
  px(ctx, sx + 1, wy + 1, 1, 1, '#222')

  // Agent icon badge (colored dot)
  const agentDef = AGENTS.find((a) => a.id === worker.agentId)
  if (agentDef) {
    ctx.font = '5px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#fff'
    ctx.fillText(agentDef.icon, sx, wy + 7)
  }

  // Activity speech bubble (when working)
  if (worker.lastActivityTitle && worker.activity === 'working') {
    const label = worker.lastActivityTitle.slice(0, 14)
    ctx.font = '4px sans-serif'
    const metrics = ctx.measureText(label)
    const bw = Math.ceil(metrics.width) + 4
    const bx = sx + 5
    const by = wy - 2

    // Bubble
    px(ctx, bx, by - 3, bw, 7, PALETTE.bubbleBg)
    px(ctx, bx, by - 4, bw, 1, PALETTE.bubbleBorder)
    px(ctx, bx, by + 4, bw, 1, PALETTE.bubbleBorder)
    px(ctx, bx - 1, by - 3, 1, 7, PALETTE.bubbleBorder)
    px(ctx, bx + bw, by - 3, 1, 7, PALETTE.bubbleBorder)
    // Tail
    px(ctx, bx - 1, by, 1, 1, PALETTE.bubbleBg)
    // Text
    ctx.fillStyle = PALETTE.textLight
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, bx + 2, by + 1)
  }

  // Name below
  ctx.font = '4px sans-serif'
  ctx.fillStyle = PALETTE.textDim
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(worker.projectName.slice(0, 10), sx, sy + 3)
}

// ── Main canvas component ─────────────────────────────────────────

export function OfficeCanvas({ snapshot }: OfficeCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const frameRef = useRef(0)
  const snapshotRef = useRef(snapshot)

  // Keep snapshot ref current for the animation loop
  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Create offscreen canvas at internal resolution
    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement('canvas')
      offscreenRef.current.width = INTERNAL_W
      offscreenRef.current.height = INTERNAL_H
    }
    const offscreen = offscreenRef.current
    const octx = offscreen.getContext('2d')
    if (!octx) return

    let running = true

    function render(): void {
      if (!running || !canvas || !ctx || !octx) return

      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const newW = Math.round(rect.width * dpr)
      const newH = Math.round(rect.height * dpr)
      if (canvas.width !== newW || canvas.height !== newH) {
        canvas.width = newW
        canvas.height = newH
      }

      const time = performance.now()
      const snap = snapshotRef.current

      // ── Draw to offscreen at internal resolution ──
      octx.fillStyle = PALETTE.bg
      octx.fillRect(0, 0, INTERNAL_W, INTERNAL_H)

      // Grid center
      const center = toIso(GRID_COLS / 2, GRID_ROWS / 2)
      const ox = INTERNAL_W / 2 - center.x
      const oy = 50 - center.y + 20

      // Walls + windows
      drawWalls(octx, ox, oy)

      // Floor
      drawFloor(octx, ox, oy)

      // Decorations
      const plantPositions = [
        { col: 1, row: 1 },
        { col: GRID_COLS - 2, row: 1 },
        { col: 1, row: GRID_ROWS - 2 },
      ]
      for (const pos of plantPositions) {
        const { x, y } = toIso(pos.col, pos.row)
        drawPlant(octx, ox + x, oy + y - 4)
      }

      const coffeeP = toIso(GRID_COLS - 2, GRID_ROWS - 2)
      drawCoffeeMachine(octx, ox + coffeeP.x, oy + coffeeP.y - 2)

      // Build worker lookup
      const workerByDesk = new Map<number, OfficeWorker>()
      if (snap) {
        for (const w of snap.workers) workerByDesk.set(w.deskIndex, w)
      }

      // Desks + workers (back to front for layering)
      for (let r = 0; r < DESK_ROWS; r++) {
        for (let c = 0; c < DESK_COLS; c++) {
          const idx = r * DESK_COLS + c
          const dPos = getDeskPos(idx)
          const { x, y } = toIso(dPos.col, dPos.row)
          const dx = ox + x
          const dy = oy + y
          const w = workerByDesk.get(idx)
          drawDesk(octx, dx, dy, w, time)
          if (w) {
            drawWorker(octx, dx, dy, w, time)
          }
        }
      }

      // Empty state message
      if (!snap || snap.workers.length === 0) {
        octx.font = '6px sans-serif'
        octx.fillStyle = PALETTE.textDim
        octx.textAlign = 'center'
        octx.textBaseline = 'middle'
        octx.fillText('No active workers', INTERNAL_W / 2, INTERNAL_H - 12)
        octx.fillText('Start an agent session to see them here', INTERNAL_W / 2, INTERNAL_H - 5)
      }

      // ── Upscale to display canvas with nearest-neighbor ──
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = false
      const displayW = rect.width
      const displayH = rect.height

      // Scale to fit, maintaining aspect ratio
      const scaleX = displayW / INTERNAL_W
      const scaleY = displayH / INTERNAL_H
      const scale = Math.max(scaleX, scaleY)
      const drawW = INTERNAL_W * scale
      const drawH = INTERNAL_H * scale
      const drawX = (displayW - drawW) / 2
      const drawY = (displayH - drawH) / 2

      ctx.fillStyle = PALETTE.bg
      ctx.fillRect(0, 0, displayW, displayH)
      ctx.drawImage(offscreen, drawX, drawY, drawW, drawH)

      frameRef.current = requestAnimationFrame(render)
    }

    render()

    return () => {
      running = false
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  // Resize handling
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => {
      // The animation loop auto-handles resize on next frame
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  return <canvas ref={canvasRef} aria-label="Office diorama view" role="img" />
}
