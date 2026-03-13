import type { ReactNode } from 'react'
import { CornerAccent } from './CornerAccent'
import './PanelBox.css'

type Corner = 'tl' | 'tr' | 'bl' | 'br'
type GlowDirection = 'left' | 'right' | 'top' | 'bottom' | 'none'

interface PanelBoxProps {
  corners: Corner[] | 'all'
  glow: GlowDirection
  intensity?: number | undefined
  pulse?: boolean | undefined
  className?: string | undefined
  children: ReactNode
}

const ALL_CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br']

export function PanelBox({ corners, glow, intensity, pulse, className, children }: PanelBoxProps) {
  const cornerList = corners === 'all' ? ALL_CORNERS : corners
  const classes = [
    'panel-box',
    glow !== 'none' ? `panel-box--glow-${glow}` : '',
    pulse ? 'panel-box--pulse' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      {cornerList.map((pos) => (
        <CornerAccent key={pos} position={pos} intensity={intensity} />
      ))}
      {children}
    </div>
  )
}
