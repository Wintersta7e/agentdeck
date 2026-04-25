import { useState, useMemo, useCallback } from 'react'
import type { SkillEntry } from '../../../../shared/types'

interface Props {
  skills: SkillEntry[]
}

const PREVIEW_LIMIT = 5

/**
 * Skills grouped by scope (USER, PROJECT). Shows the first 5 names per scope
 * with a "show all" toggle for the remainder. Empty state: "No skills found."
 */
export function SkillsSection({ skills }: Props): React.JSX.Element {
  const [showAll, setShowAll] = useState<{ user: boolean; project: boolean }>({
    user: false,
    project: false,
  })

  const grouped = useMemo(() => {
    const user: SkillEntry[] = []
    const project: SkillEntry[] = []
    for (const s of skills) {
      if (s.scope === 'project') project.push(s)
      else user.push(s)
    }
    user.sort((a, b) => a.name.localeCompare(b.name))
    project.sort((a, b) => a.name.localeCompare(b.name))
    return { user, project }
  }, [skills])

  const toggle = useCallback((scope: 'user' | 'project'): void => {
    setShowAll((prev) => ({ ...prev, [scope]: !prev[scope] }))
  }, [])

  return (
    <section className="env-tab__section">
      <h3 className="env-tab__section-title">Skills</h3>
      {grouped.user.length === 0 && grouped.project.length === 0 ? (
        <div className="env-tab__empty-hint">No skills found.</div>
      ) : (
        <div className="env-tab__skills">
          {(['user', 'project'] as const).map((scope) => {
            const list = grouped[scope]
            if (list.length === 0) return null
            const open = showAll[scope]
            const visible = open ? list : list.slice(0, PREVIEW_LIMIT)
            const hasMore = list.length > PREVIEW_LIMIT
            return (
              <div key={scope} className="env-tab__skills-group">
                <div className="env-tab__skills-group-header">
                  <span className={`env-tab__scope-badge env-tab__scope-badge--${scope}`}>
                    {scope}
                  </span>
                  <span className="env-tab__skills-count">{list.length}</span>
                </div>
                <ul className="env-tab__skills-list">
                  {visible.map((skill) => (
                    <li
                      key={`${skill.scope}-${skill.path}`}
                      className="env-tab__skills-item"
                      title={skill.path}
                    >
                      {skill.name}
                    </li>
                  ))}
                </ul>
                {hasMore && (
                  <button
                    type="button"
                    className="env-tab__skills-toggle"
                    onClick={() => toggle(scope)}
                    aria-expanded={open}
                  >
                    {open ? 'Show less' : `Show all (${list.length})`}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
