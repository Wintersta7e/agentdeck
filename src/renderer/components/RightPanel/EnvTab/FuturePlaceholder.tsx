interface Props {
  agentName: string
}

/**
 * Shown above the Paths footer for `supportLevel: 'future'` agents
 * (gemini-cli, amazon-q, opencode) — their hook/skill/MCP surfaces aren't
 * resolved yet, but the WSL/path footer still renders for debug visibility.
 */
export function FuturePlaceholder({ agentName }: Props): React.JSX.Element {
  return (
    <div className="env-tab__placeholder">
      <p>{agentName} environment surface is not yet supported.</p>
      <p className="env-tab__placeholder-hint">
        Hooks, skills, and MCP servers will appear here once support lands.
      </p>
    </div>
  )
}
