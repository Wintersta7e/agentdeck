import type { AgentEnvSnapshot } from '../../../../shared/types'

interface Props {
  paths: AgentEnvSnapshot['paths']
}

/**
 * Debug-tier footer of the EnvTab. Renders only the path slots that resolved
 * to a non-null value so empty rows don't clutter the surface. Includes both
 * the per-agent USER/PROJECT roots and the legacy WSL footer fields
 * (agentdeckRoot, templateUserRoot, wslDistro, wslHome, projectAgentdeckDir)
 * that were carried forward from the v5 EnvTab for parity.
 */
export function PathsSection({ paths }: Props): React.JSX.Element {
  const rows: { label: string; value: string | null }[] = [
    { label: 'USER', value: paths.userConfigDir },
    { label: 'PROJECT', value: paths.projectConfigDir },
    { label: 'agentdeckRoot', value: paths.agentdeckRoot },
    { label: 'templateUserRoot', value: paths.templateUserRoot },
    { label: 'WSL distro', value: paths.wslDistro },
    { label: 'WSL home', value: paths.wslHome },
    { label: 'project .agentdeck', value: paths.projectAgentdeckDir },
  ]
  const visible = rows.filter((r) => r.value)
  return (
    <section className="env-tab__section">
      <h3 className="env-tab__section-title">Paths</h3>
      {visible.length === 0 ? (
        <div className="env-tab__empty-hint">No paths resolved.</div>
      ) : (
        <dl className="env-tab__list">
          {visible.map((r) => (
            <div className="env-tab__row" key={r.label}>
              <dt>{r.label}</dt>
              <dd title={r.value ?? undefined}>{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
