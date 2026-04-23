import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import './Mascot.css'

type MascotState = 'greet' | 'idle' | 'bored' | 'working' | 'alert' | 'sleep' | 'hover'

interface MascotProps {
  /** Pixel size. Default 140. */
  size?: number
  onClick?: () => void
}

/**
 * "Pixel" the ops-room cat — Phase 4 mascot, ported from
 * `reference/jsx/mascot.jsx`. Reads live state from the store:
 * running sessions → working / bored, error notifications → alert,
 * local hour 23–5 → sleep. Hover overrides. Reduced-motion disables
 * every animation, keeping the pose static.
 */
export function Mascot({ size = 140, onClick }: MascotProps): React.JSX.Element {
  const runningCount = useAppStore(
    (s) => Object.values(s.sessions).filter((sess) => sess.status === 'running').length,
  )
  const errorCount = useAppStore(
    (s) =>
      Object.values(s.sessions).filter((sess) => sess.status === 'error').length +
      s.notifications.filter((n) => n.type === 'error').length,
  )

  const [hovering, setHovering] = useState(false)
  const [greeting, setGreeting] = useState(true)
  // Tick = seconds elapsed since mount (float). requestAnimationFrame
  // drives it at display refresh rate so breathing / tail swing / paw
  // taps / blink feel continuous instead of the 1 Hz steps the
  // prototype shipped with.
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const t1 = window.setTimeout(() => setGreeting(false), 2600)
    const start = performance.now()
    let rafId = 0
    const step = (now: number): void => {
      setTick((now - start) / 1000)
      rafId = window.requestAnimationFrame(step)
    }
    rafId = window.requestAnimationFrame(step)
    return () => {
      window.clearTimeout(t1)
      window.cancelAnimationFrame(rafId)
    }
  }, [])

  const state = useMemo<MascotState>(() => {
    const hour = new Date().getHours()
    if (greeting) return 'greet'
    if (hovering) return 'hover'
    if (errorCount > 0) return 'alert'
    if (hour >= 23 || hour < 6) return 'sleep'
    if (runningCount >= 1) return 'working'
    return 'bored'
  }, [greeting, hovering, errorCount, runningCount])

  const breath = 1 + Math.sin(tick * 0.9) * 0.012

  return (
    <div
      className={`mascot mascot--${state}`}
      style={{ width: size, height: size }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={onClick}
      role={onClick ? 'button' : 'img'}
      aria-label={`Mascot · ${stateLabel(state, runningCount)}`}
    >
      <svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        className="mascot__svg"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="mascot-fur" cx="50%" cy="35%" r="65%">
            <stop offset="0%" className="mascot__fur-stop-in" />
            <stop offset="100%" className="mascot__fur-stop-out" />
          </radialGradient>
          <radialGradient id="mascot-puddle" cx="50%" cy="50%" r="50%">
            <stop offset="0%" className="mascot__puddle-stop-in" />
            <stop offset="100%" className="mascot__puddle-stop-out" />
          </radialGradient>
        </defs>

        {/* shadow puddle */}
        <ellipse cx="60" cy="108" rx="30" ry="4" fill="url(#mascot-puddle)" />

        <Tail state={state} tick={tick} />

        <g transform={`translate(60 74) scale(${breath.toFixed(4)}) translate(-60 -74)`}>
          <ellipse cx="60" cy="82" rx="28" ry="22" fill="url(#mascot-fur)" />
          <ellipse cx="60" cy="88" rx="18" ry="12" className="mascot__belly" />

          <Head state={state} tick={tick} />
          <Paws state={state} tick={tick} />
        </g>
      </svg>

      <div className="mascot__label">{stateLabel(state, runningCount)}</div>
    </div>
  )
}

function stateLabel(s: MascotState, running: number): string {
  switch (s) {
    case 'greet':
      return 'hi'
    case 'bored':
      return 'idle · nothing running'
    case 'working':
      return running === 1 ? 'watching 1 session' : `watching ${running} sessions`
    case 'alert':
      return 'alert'
    case 'sleep':
      return 'dozing'
    case 'hover':
      return 'you rang?'
    default:
      return 'standing by'
  }
}

/* ─── Sub-pieces ─────────────────────────────────────────────── */

interface SubProps {
  state: MascotState
  tick: number
}

function Tail({ state, tick }: SubProps): React.JSX.Element {
  const rate = state === 'working' ? 1.6 : state === 'alert' ? 3.2 : state === 'sleep' ? 0.3 : 0.7
  const swing = state === 'sleep' ? 3 : state === 'alert' ? 14 : 10
  const a = Math.sin(tick * rate) * swing
  return (
    <g
      transform={`translate(90 82) rotate(${a.toFixed(2)})`}
      style={{ transformOrigin: '90px 82px' }}
    >
      <path
        d="M0 0 Q18 -4 26 -18 Q28 -22 26 -24 Q22 -22 22 -18 Q18 -6 -2 -2 Z"
        className="mascot__tail"
      />
      <path d="M10 -4 Q18 -10 22 -18" className="mascot__tail-stripe" />
    </g>
  )
}

function Head({ state, tick }: SubProps): React.JSX.Element {
  const tilt = state === 'alert' ? -2 : state === 'sleep' ? 4 : Math.sin(tick * 1.3) * 2
  const eyeOpen = state !== 'sleep' && state !== 'bored'
  return (
    <g transform={`translate(60 52) rotate(${tilt.toFixed(2)}) translate(-60 -52)`}>
      <Ears state={state} />
      <ellipse cx="60" cy="52" rx="24" ry="21" className="mascot__head" />
      <ellipse cx="60" cy="56" rx="15" ry="11" className="mascot__face-mask" />
      <path d="M54 35 Q60 32 66 35 L63 41 Q60 38 57 41 Z" className="mascot__forehead" />

      {eyeOpen ? (
        <OpenEyes state={state} tick={tick} />
      ) : state === 'sleep' ? (
        <SleepEyes />
      ) : (
        <SleepyEyes />
      )}

      <path d="M58 58 L62 58 L60 61 Z" className="mascot__nose" />
      <Mouth state={state} tick={tick} />

      <g className="mascot__whiskers" strokeLinecap="round">
        <line x1="44" y1="60" x2="36" y2="58" />
        <line x1="44" y1="62" x2="36" y2="63" />
        <line x1="76" y1="60" x2="84" y2="58" />
        <line x1="76" y1="62" x2="84" y2="63" />
      </g>

      {state === 'sleep' && (
        <g className="mascot__zzz">
          <text x="82" y="34" fontSize="9">
            z
          </text>
          <text x="88" y="28" fontSize="11">
            Z
          </text>
          <text x="95" y="20" fontSize="13">
            Z
          </text>
        </g>
      )}

      {state === 'alert' && (
        <g className="mascot__bang">
          <text x="86" y="30" fontSize="16">
            !
          </text>
        </g>
      )}

      {state === 'greet' && (
        <g className="mascot__greet-spark">
          <circle cx="95" cy="22" r="1.5">
            <animate attributeName="opacity" values="0;1;0" dur="1.4s" repeatCount="indefinite" />
          </circle>
          <circle cx="100" cy="30" r="1">
            <animate
              attributeName="opacity"
              values="0;1;0"
              dur="1.4s"
              begin="0.3s"
              repeatCount="indefinite"
            />
          </circle>
          <circle cx="91" cy="30" r="1">
            <animate
              attributeName="opacity"
              values="0;1;0"
              dur="1.4s"
              begin="0.6s"
              repeatCount="indefinite"
            />
          </circle>
        </g>
      )}
    </g>
  )
}

function Ears({ state }: { state: MascotState }): React.JSX.Element {
  const lRot = state === 'alert' ? -10 : state === 'sleep' ? 10 : 0
  const rRot = state === 'alert' ? 10 : state === 'sleep' ? -10 : 0
  return (
    <g>
      <g transform={`rotate(${lRot} 46 36)`}>
        <path d="M40 42 L44 28 L52 38 Z" className="mascot__ear" />
        <path d="M43 39 L45 32 L49 37 Z" className="mascot__ear-inner" />
      </g>
      <g transform={`rotate(${rRot} 74 36)`}>
        <path d="M80 42 L76 28 L68 38 Z" className="mascot__ear" />
        <path d="M77 39 L75 32 L71 37 Z" className="mascot__ear-inner" />
      </g>
    </g>
  )
}

function OpenEyes({ state, tick }: SubProps): React.JSX.Element {
  const working = state === 'working'
  const hover = state === 'hover'
  const dx = working ? Math.sin(tick * 1.8) * 1.2 : hover ? 1.2 : 0
  // Blink briefly (150 ms) every ~5 s. tick is seconds since mount.
  const blinkPhase = tick % 5
  const blink = blinkPhase < 0.15 ? 0.2 : 1
  return (
    <g>
      <ellipse
        cx="52"
        cy="52"
        rx="3.4"
        ry={(3.4 * blink).toFixed(2)}
        className="mascot__eye-white"
      />
      <ellipse
        cx="68"
        cy="52"
        rx="3.4"
        ry={(3.4 * blink).toFixed(2)}
        className="mascot__eye-white"
      />
      <circle
        cx={(52 + dx).toFixed(2)}
        cy="52.5"
        r={1.6}
        className="mascot__pupil"
        opacity={blink}
      />
      <circle
        cx={(68 + dx).toFixed(2)}
        cy="52.5"
        r={1.6}
        className="mascot__pupil"
        opacity={blink}
      />
      <circle
        cx={(51 + dx).toFixed(2)}
        cy="51"
        r={0.6}
        className="mascot__catchlight"
        opacity={blink}
      />
      <circle
        cx={(67 + dx).toFixed(2)}
        cy="51"
        r={0.6}
        className="mascot__catchlight"
        opacity={blink}
      />
    </g>
  )
}

function SleepyEyes(): React.JSX.Element {
  return (
    <g className="mascot__eye-line" strokeLinecap="round" fill="none">
      <path d="M48 53 Q52 55 56 53" />
      <path d="M64 53 Q68 55 72 53" />
    </g>
  )
}

function SleepEyes(): React.JSX.Element {
  return (
    <g className="mascot__eye-line mascot__eye-line--sleep" strokeLinecap="round" fill="none">
      <path d="M48 54 Q52 52 56 54" />
      <path d="M64 54 Q68 52 72 54" />
    </g>
  )
}

function Mouth({ state, tick }: SubProps): React.JSX.Element {
  if (state === 'alert') {
    return (
      <path d="M56 66 Q60 63 64 66" className="mascot__mouth" fill="none" strokeLinecap="round" />
    )
  }
  if (state === 'sleep') {
    return (
      <path d="M57 65 Q60 68 63 65" className="mascot__mouth" fill="none" strokeLinecap="round" />
    )
  }
  if (state === 'bored') {
    const s = 1 + Math.sin(tick * 0.6) * 0.4
    return (
      <ellipse
        cx="60"
        cy="66"
        rx={(2.2 * s).toFixed(2)}
        ry={(2.8 * s).toFixed(2)}
        className="mascot__yawn"
      />
    )
  }
  return (
    <g className="mascot__mouth" fill="none" strokeLinecap="round">
      <path d="M60 62 Q57 66 54 63" />
      <path d="M60 62 Q63 66 66 63" />
    </g>
  )
}

function Paws({ state, tick }: SubProps): React.JSX.Element {
  const working = state === 'working'
  const left = working ? Math.abs(Math.sin(tick * 2.8)) * -3 : 0
  const right = working ? Math.abs(Math.sin(tick * 2.8 + Math.PI)) * -3 : 0
  const greet = state === 'greet'
  return (
    <g>
      <g transform={`translate(0 ${left.toFixed(2)})`}>
        <ellipse cx="46" cy="98" rx="7" ry="5" className="mascot__paw" />
        <ellipse cx="46" cy="99" rx="4.5" ry="2.8" className="mascot__paw-pad" />
      </g>
      {greet ? (
        <g className="mascot__paw-wave" style={{ transformOrigin: '76px 90px' }}>
          <ellipse cx="76" cy="90" rx="7" ry="5" className="mascot__paw" />
          <ellipse cx="76" cy="91" rx="4.5" ry="2.8" className="mascot__paw-pad" />
        </g>
      ) : (
        <g transform={`translate(0 ${right.toFixed(2)})`}>
          <ellipse cx="74" cy="98" rx="7" ry="5" className="mascot__paw" />
          <ellipse cx="74" cy="99" rx="4.5" ry="2.8" className="mascot__paw-pad" />
        </g>
      )}
    </g>
  )
}
