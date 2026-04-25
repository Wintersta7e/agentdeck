import type { McpServerEntry } from '../../../../shared/types'

interface Props {
  servers: McpServerEntry[]
}

/**
 * Configured MCP servers. Each row: name, transport-type badge, scope badge,
 * command/url summary, and a status dot. Empty state: "No MCP servers configured."
 */
export function McpSection({ servers }: Props): React.JSX.Element {
  return (
    <section className="env-tab__section">
      <h3 className="env-tab__section-title">MCP servers</h3>
      {servers.length === 0 ? (
        <div className="env-tab__empty-hint">No MCP servers configured.</div>
      ) : (
        <ul className="env-tab__mcp">
          {servers.map((server) => {
            const summary = server.command ?? server.url ?? ''
            const status = server.status ?? 'configured'
            return (
              <li key={`${server.scope}-${server.name}`} className="env-tab__mcp-row">
                <div className="env-tab__mcp-line">
                  <span
                    className={`env-tab__mcp-status env-tab__mcp-status--${status}`}
                    aria-label={`status: ${status}`}
                    title={status}
                  />
                  <span className="env-tab__mcp-name">{server.name}</span>
                  <span className="env-tab__mcp-type-badge">{server.type}</span>
                  <span className={`env-tab__scope-badge env-tab__scope-badge--${server.scope}`}>
                    {server.scope}
                  </span>
                </div>
                {summary && (
                  <code className="env-tab__mcp-summary" title={summary}>
                    {summary}
                  </code>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
