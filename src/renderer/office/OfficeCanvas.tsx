import React, { useRef, useEffect } from 'react'
import type { OfficeSnapshot, OfficeWorker } from '../../shared/office-types'
import { AGENTS } from '../../shared/agents'

interface OfficeCanvasProps {
  snapshot: OfficeSnapshot | null
}

// ── Stardew Valley-inspired warm palette ──────────────────────────
const P = {
  bg: '#2a1f1e',
  floorA: '#c4a882',
  floorB: '#b89b74',
  wallBack: '#7a6650',
  wallSide: '#6a5842',
  wallDark: '#5a4a36',
  trim: '#8a7660',
  deskTop: '#c0a070',
  deskFront: '#9a7a50',
  deskLeg: '#7a6040',
  screenOff: '#1a2030',
  screenOn: '#30b050',
  screenGlow: '#40ff80',
  screenIdle: '#304858',
  chairSeat: '#8a6848',
  chairBack: '#7a5838',
  plantLeaf: '#5aaa50',
  plantDark: '#3a7a30',
  pot: '#b07848',
  windowFrame: '#8a7660',
  glass: '#88bbdd',
  glassBright: '#aaddee',
  shadow: 'rgba(0,0,0,0.2)',
  textLight: '#f0e0c8',
  textMuted: '#b0a090',
  bubbleBg: '#4a3e30',
  bubbleBorder: '#70b070',
  // Body colors per activity
  working: '#5090d0',
  idle: '#889898',
  coffee: '#d09050',
  spawning: '#a080d0',
  skin: '#f5c8a0',
  hair: '#6a4530',
  rugA: '#a05040',
  rugB: '#8a4038',
}

// ── Internal resolution ───────────────────────────────────────────
const IW = 480
const IH = 320

// ── Isometric constants ───────────────────────────────────────────
const TW = 32 // tile width
const TH = 16 // tile height
const COLS = 10
const ROWS = 8

// Only 6 desks — 3 columns x 2 rows, well spaced
const DESK_POSITIONS = [
  { col: 2, row: 2, idx: 0 },
  { col: 5, row: 2, idx: 1 },
  { col: 8, row: 2, idx: 2 },
  { col: 2, row: 5, idx: 3 },
  { col: 5, row: 5, idx: 4 },
  { col: 8, row: 5, idx: 5 },
]

function toIso(col: number, row: number): { x: number; y: number } {
  return {
    x: (col - row) * (TW / 2),
    y: (col + row) * (TH / 2),
  }
}

// ── Drawing helpers ───────────────────────────────────────────────

function rect(
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

function isoTile(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
  w = TW,
  h = TH,
): void {
  const hw = w / 2
  const hh = h / 2
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(cx, cy - hh)
  ctx.lineTo(cx + hw, cy)
  ctx.lineTo(cx, cy + hh)
  ctx.lineTo(cx - hw, cy)
  ctx.closePath()
  ctx.fill()
}

// ── Scene drawing ─────────────────────────────────────────────────

function drawWalls(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const wallH = 50

  // Back wall: solid polygon from top-left to top-right of floor
  const tl = toIso(0, 0)
  const tr = toIso(COLS, 0)
  ctx.fillStyle = P.wallBack
  ctx.beginPath()
  ctx.moveTo(ox + tl.x, oy + tl.y)
  ctx.lineTo(ox + tr.x, oy + tr.y)
  ctx.lineTo(ox + tr.x, oy + tr.y - wallH)
  ctx.lineTo(ox + tl.x, oy + tl.y - wallH)
  ctx.closePath()
  ctx.fill()

  // Left wall: solid polygon from top-left to bottom-left of floor
  const bl = toIso(0, ROWS)
  ctx.fillStyle = P.wallSide
  ctx.beginPath()
  ctx.moveTo(ox + tl.x, oy + tl.y)
  ctx.lineTo(ox + bl.x, oy + bl.y)
  ctx.lineTo(ox + bl.x, oy + bl.y - wallH)
  ctx.lineTo(ox + tl.x, oy + tl.y - wallH)
  ctx.closePath()
  ctx.fill()

  // Trim line at wall-floor junction (back)
  ctx.strokeStyle = P.trim
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(ox + tl.x, oy + tl.y)
  ctx.lineTo(ox + tr.x, oy + tr.y)
  ctx.stroke()

  // Windows on back wall
  const windowSpacing = (tr.x - tl.x) / 4
  for (let i = 1; i <= 3; i++) {
    const wx = ox + tl.x + windowSpacing * i
    const baseY = oy + tl.y + (tr.y - tl.y) * (i / 4)
    const wy = baseY - wallH + 10
    // Frame
    rect(ctx, wx - 10, wy, 20, 18, P.windowFrame)
    // Glass panes (2x2 grid)
    rect(ctx, wx - 8, wy + 2, 7, 6, P.glass)
    rect(ctx, wx + 1, wy + 2, 7, 6, P.glassBright)
    rect(ctx, wx - 8, wy + 10, 7, 6, P.glassBright)
    rect(ctx, wx + 1, wy + 10, 7, 6, P.glass)
  }
}

function drawFloor(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const { x, y } = toIso(c, r)
      isoTile(ctx, ox + x, oy + y, (c + r) % 2 === 0 ? P.floorA : P.floorB)
    }
  }
  // Area rug in the center
  for (let r = 3; r < 5; r++) {
    for (let c = 4; c < 7; c++) {
      const { x, y } = toIso(c, r)
      isoTile(ctx, ox + x, oy + y, (c + r) % 2 === 0 ? P.rugA : P.rugB, TW - 2, TH - 1)
    }
  }
}

function drawDesk(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  worker: OfficeWorker | undefined,
  time: number,
): void {
  // Desktop surface
  rect(ctx, cx - 12, cy - 4, 24, 5, P.deskTop)
  rect(ctx, cx - 12, cy + 1, 24, 3, P.deskFront)
  // Legs
  rect(ctx, cx - 10, cy + 4, 2, 6, P.deskLeg)
  rect(ctx, cx + 8, cy + 4, 2, 6, P.deskLeg)

  // Monitor
  rect(ctx, cx - 6, cy - 16, 12, 10, '#1a1a2a')
  rect(ctx, cx - 1, cy - 6, 2, 2, '#333')

  // Screen content
  if (worker?.activity === 'working') {
    rect(ctx, cx - 5, cy - 15, 10, 8, P.screenOn)
    // Scrolling text lines
    const offset = Math.floor(time / 150) % 6
    for (let i = 0; i < 4; i++) {
      const lineLen = 3 + ((offset + i * 17) % 6)
      rect(ctx, cx - 4, cy - 14 + i * 2, Math.min(lineLen, 8), 1, P.screenGlow)
    }
  } else if (worker) {
    rect(ctx, cx - 5, cy - 15, 10, 8, P.screenIdle)
    rect(ctx, cx - 2, cy - 12, 4, 1, '#506878')
  } else {
    rect(ctx, cx - 5, cy - 15, 10, 8, P.screenOff)
  }

  // Chair
  rect(ctx, cx - 4, cy + 8, 8, 4, P.chairSeat)
  rect(ctx, cx - 4, cy + 5, 8, 3, P.chairBack)
}

function drawPlant(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  rect(ctx, cx - 4, cy + 2, 8, 5, P.pot)
  rect(ctx, cx - 3, cy + 1, 6, 2, P.pot)
  // Leaves
  ctx.fillStyle = P.plantLeaf
  ctx.beginPath()
  ctx.arc(cx, cy - 5, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = P.plantDark
  ctx.beginPath()
  ctx.arc(cx - 3, cy - 3, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = P.plantLeaf
  ctx.beginPath()
  ctx.arc(cx + 2, cy - 7, 5, 0, Math.PI * 2)
  ctx.fill()
}

function drawWorker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  worker: OfficeWorker,
  time: number,
): void {
  const bodyColor =
    worker.activity === 'working'
      ? P.working
      : worker.activity === 'idle-coffee'
        ? P.coffee
        : worker.activity === 'spawning'
          ? P.spawning
          : P.idle

  // Worker sits IN the chair behind the desk.
  // cy is the desk's iso center. Chair is at cy+5..cy+12.
  // Worker's body starts at chair level, head peeks above the monitor.
  const chairY = cy + 4 // top of chair back
  let bob = 0
  if (worker.activity === 'working') {
    bob = Math.round(Math.sin(time / 350 + worker.deskIndex * 1.2) * 1)
  }

  // Head peeking above the monitor (monitor top is at cy-16)
  const headY = cy - 20 + bob
  rect(ctx, cx - 5, headY, 10, 8, P.skin)
  // Hair
  rect(ctx, cx - 5, headY - 2, 10, 4, P.hair)
  // Eyes
  rect(ctx, cx - 3, headY + 3, 2, 2, '#222')
  rect(ctx, cx + 1, headY + 3, 2, 2, '#222')
  // Mouth (smile when working)
  if (worker.activity === 'working') {
    rect(ctx, cx - 1, headY + 6, 2, 1, '#c08880')
  }

  // Shoulders visible just above desk surface (cy-4 is desk top)
  rect(ctx, cx - 6, cy - 6 + bob, 12, 3, bodyColor)

  // Arms resting on desk (on top of the desk surface)
  if (worker.activity === 'working') {
    const armBob = Math.round(Math.sin(time / 200 + worker.deskIndex) * 1)
    rect(ctx, cx - 10, cy - 3 + armBob, 4, 2, P.skin)
    rect(ctx, cx + 6, cy - 3 - armBob, 4, 2, P.skin)
  } else {
    rect(ctx, cx - 10, cy - 3, 4, 2, P.skin)
    rect(ctx, cx + 6, cy - 3, 4, 2, P.skin)
  }

  // Body visible below desk (between desk bottom and chair)
  rect(ctx, cx - 4, cy + 4 + bob, 8, 4, bodyColor)

  // Agent icon + project name rendered at DISPLAY resolution (not internal)
  // so they're readable. We store positions and draw them in a second pass.
  // For now, use larger font that survives the upscale.
  const agentDef = AGENTS.find((a) => a.id === worker.agentId)
  ctx.font = 'bold 10px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = P.textLight
  ctx.fillText(`${agentDef?.icon ?? '?'} ${worker.projectName.slice(0, 10)}`, cx, chairY + 12)

  // Speech bubble when working with activity
  if (worker.lastActivityTitle && worker.activity === 'working') {
    const label = worker.lastActivityTitle.slice(0, 14)
    ctx.font = 'bold 9px sans-serif'
    const tw = ctx.measureText(label).width
    const bw = tw + 10
    const bx = cx + 12
    const by = headY + 2

    // Bubble body
    ctx.fillStyle = P.bubbleBg
    ctx.strokeStyle = P.bubbleBorder
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(bx, by - 7, bw, 14, 4)
    ctx.fill()
    ctx.stroke()
    // Tail
    ctx.fillStyle = P.bubbleBg
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(bx - 5, by + 2)
    ctx.lineTo(bx, by + 4)
    ctx.closePath()
    ctx.fill()
    // Text
    ctx.fillStyle = P.textLight
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, bx + 5, by)
  }
}

// ── Main component ────────────────────────────────────────────────

export function OfficeCanvas({ snapshot }: OfficeCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const frameRef = useRef(0)
  const snapshotRef = useRef(snapshot)

  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const mainCtx = canvas.getContext('2d')
    if (!mainCtx) return

    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement('canvas')
      offscreenRef.current.width = IW
      offscreenRef.current.height = IH
    }
    const offscreen = offscreenRef.current
    const ctx = offscreen.getContext('2d')
    if (!ctx) return

    let running = true

    function render(): void {
      if (!running || !canvas || !mainCtx || !ctx) return

      const viewRect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const newW = Math.round(viewRect.width * dpr)
      const newH = Math.round(viewRect.height * dpr)
      if (canvas.width !== newW || canvas.height !== newH) {
        canvas.width = newW
        canvas.height = newH
      }

      const time = performance.now()
      const snap = snapshotRef.current

      // ── Draw to offscreen ──
      ctx.fillStyle = P.bg
      ctx.fillRect(0, 0, IW, IH)

      // Center the isometric grid
      const center = toIso(COLS / 2, ROWS / 2)
      const ox = IW / 2 - center.x
      const oy = IH / 2 - center.y - 10

      drawWalls(ctx, ox, oy)
      drawFloor(ctx, ox, oy)

      // Plants
      const plantSpots = [toIso(0.5, 1), toIso(COLS - 1, 0.5), toIso(0.5, ROWS - 1)]
      for (const ps of plantSpots) {
        drawPlant(ctx, ox + ps.x, oy + ps.y - 8)
      }

      // Worker lookup
      const workerByDesk = new Map<number, OfficeWorker>()
      if (snap) {
        for (const w of snap.workers) {
          if (w.deskIndex < DESK_POSITIONS.length) {
            workerByDesk.set(w.deskIndex, w)
          }
        }
      }

      // Desks + workers (back-to-front by row for depth)
      for (const desk of DESK_POSITIONS) {
        const { x, y } = toIso(desk.col, desk.row)
        const dx = ox + x
        const dy = oy + y
        const w = workerByDesk.get(desk.idx)
        drawDesk(ctx, dx, dy, w, time)
        if (w) drawWorker(ctx, dx, dy, w, time)
      }

      // Empty state
      if (!snap || snap.workers.length === 0) {
        ctx.font = '10px sans-serif'
        ctx.fillStyle = P.textMuted
        ctx.textAlign = 'center'
        ctx.fillText('No active workers — start an agent session', IW / 2, IH - 20)
      }

      // ── Upscale to display canvas ──
      mainCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      mainCtx.imageSmoothingEnabled = false
      const dw = viewRect.width
      const dh = viewRect.height
      const scale = Math.min(dw / IW, dh / IH)
      const drawW = IW * scale
      const drawH = IH * scale
      mainCtx.fillStyle = P.bg
      mainCtx.fillRect(0, 0, dw, dh)
      mainCtx.drawImage(offscreen, (dw - drawW) / 2, (dh - drawH) / 2, drawW, drawH)

      frameRef.current = requestAnimationFrame(render)
    }

    render()
    return () => {
      running = false
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => {
      /* animation loop handles it */
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  return <canvas ref={canvasRef} aria-label="Office diorama view" role="img" />
}
