interface AmbientGlowProps {
  color: string
  position: [x: number, y: number]
  size: number
  skew: number
}

export function AmbientGlow({ color, position, size, skew }: AmbientGlowProps) {
  const [x, y] = position
  return (
    <div
      className="ambient-glow"
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: `${size}px`,
        height: `${size}px`,
        transform: `translate(-50%, -50%) skewX(${skew}deg)`,
        background: `radial-gradient(ellipse, ${color} 0%, transparent 70%)`,
        filter: 'blur(50px)',
        opacity: 'var(--ambient-glow-opacity)',
        pointerEvents: 'none',
        transition: 'left 2s ease, top 2s ease',
      }}
      aria-hidden="true"
    />
  )
}
