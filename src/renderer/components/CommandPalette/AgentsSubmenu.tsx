import { useEffect, useRef } from 'react'
import { ArrowLeft, SquareCheck, Square } from 'lucide-react'

interface AgentOption {
  id: string
  label: string
  desc: string
}

interface AgentsSubmenuProps {
  agents: AgentOption[]
  visibleAgents: string[] | null
  selectedIndex: number
  onSelectIndex: (index: number | ((prev: number) => number)) => void
  onToggle: (agentId: string) => void
  onBack: () => void
}

export function AgentsSubmenu({
  agents,
  visibleAgents,
  selectedIndex,
  onSelectIndex,
  onToggle,
  onBack,
}: AgentsSubmenuProps): React.JSX.Element {
  const selectedIndexRef = useRef(selectedIndex)
  useEffect(() => {
    selectedIndexRef.current = selectedIndex
  }, [selectedIndex])

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onBack()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        onSelectIndex((prev) => Math.min(prev + 1, agents.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        onSelectIndex((prev) => Math.max(prev - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        const agent = agents[selectedIndexRef.current]
        if (agent) {
          onToggle(agent.id)
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [agents, onBack, onSelectIndex, onToggle])

  return (
    <div className="palette-results">
      <div className="cp-submenu-header">
        <button className="cp-back-btn" onClick={onBack}>
          <ArrowLeft size={12} /> back
        </button>
        <span>Pinned Agents</span>
      </div>
      {agents.map((a, i) => {
        const current = visibleAgents ?? agents.map((ag) => ag.id)
        const isVisible = current.includes(a.id)
        return (
          <div
            key={a.id}
            className={`cp-agent-item${selectedIndex === i ? ' selected' : ''}`}
            onClick={() => {
              onToggle(a.id)
            }}
            onMouseEnter={() => onSelectIndex(i)}
          >
            <span className={`cp-agent-check${isVisible ? ' checked' : ''}`}>
              {isVisible ? <SquareCheck size={14} /> : <Square size={14} />}
            </span>
            <span className="cp-agent-label">{a.label}</span>
            <span className="cp-agent-desc">{a.desc}</span>
          </div>
        )
      })}
    </div>
  )
}
