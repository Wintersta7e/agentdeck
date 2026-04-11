import React, { useRef, useEffect } from 'react'
import type { OfficeSnapshot } from '../../shared/office-types'

interface OfficeCanvasProps {
  snapshot: OfficeSnapshot | null
}

export function OfficeCanvas({ snapshot }: OfficeCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1

    function resize(): void {
      if (!canvas || !ctx) return
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()

    const observer = new ResizeObserver(() => resize())
    observer.observe(canvas)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas.getBoundingClientRect()

    // Clear
    ctx.clearRect(0, 0, width, height)

    if (!snapshot || snapshot.workers.length === 0) {
      // Empty state
      ctx.fillStyle = 'var(--text3)'
      ctx.font = '14px var(--font-mono)'
      ctx.textAlign = 'center'
      ctx.fillText('No active workers', width / 2, height / 2)
      return
    }

    // Placeholder: draw desk positions for each worker
    const workers = snapshot.workers
    const deskSpacing = 80
    const startX = 100
    const startY = 100

    for (const w of workers) {
      const col = w.deskIndex % 5
      const row = Math.floor(w.deskIndex / 5)
      const x = startX + col * deskSpacing
      const y = startY + row * deskSpacing

      // Desk
      ctx.fillStyle =
        w.activity === 'working' ? '#4ade80' : w.activity === 'idle-coffee' ? '#fbbf24' : '#94a3b8'
      ctx.fillRect(x - 15, y - 15, 30, 30)

      // Label
      ctx.fillStyle = '#e2e8f0'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(w.projectName.slice(0, 8), x, y + 28)
    }
  }, [snapshot])

  return <canvas ref={canvasRef} />
}
