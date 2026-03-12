import { useEffect, useRef } from 'react'
import { subscribeTheme } from '../../utils/themeObserver'
import { useReducedMotion } from '../../hooks/useReducedMotion'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  alpha: number
}

const COUNT = 40

const CANVAS_STYLE: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  zIndex: 0,
}

function drawHex(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    const px = x + r * Math.cos(angle)
    const py = y + r * Math.sin(angle)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

export function ParticleField(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Respect reduced motion preference
    if (reducedMotion) return

    let animId = 0
    const particles: Particle[] = []

    const resize = (): void => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()

    // Read accent colour from CSS custom properties (mutable so theme changes take effect)
    const readAccentRgb = (): string =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim() ||
      '245, 166, 35'
    let accentRgb = readAccentRgb()
    const unsubTheme = subscribeTheme(() => {
      accentRgb = readAccentRgb()
    })

    // Initialise particles
    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.3 + 0.1,
      })
    }

    const draw = (): void => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        // Wrap around edges
        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0

        drawHex(ctx, p.x, p.y, p.r)
        ctx.fillStyle = `rgba(${accentRgb}, ${p.alpha})`
        ctx.fill()
      }
      animId = requestAnimationFrame(draw)
    }

    draw()

    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const ro = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(resize, 80)
    })
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(animId)
      if (resizeTimer) clearTimeout(resizeTimer)
      ro.disconnect()
      unsubTheme()
    }
  }, [reducedMotion])

  return <canvas ref={canvasRef} style={CANVAS_STYLE} />
}
