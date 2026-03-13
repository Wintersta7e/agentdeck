import './CornerAccent.css'

type Position = 'tl' | 'tr' | 'bl' | 'br'

interface CornerAccentProps {
  position: Position
  size?: number | undefined
  intensity?: number | undefined
}

export function CornerAccent({ position, size, intensity }: CornerAccentProps) {
  const style: Record<string, string> = {}
  if (size !== undefined) style['--ca-size'] = `${size}px`
  if (intensity !== undefined) style['--ca-intensity'] = `${intensity}`

  return <div className={`corner-accent corner-accent--${position}`} style={style} />
}
