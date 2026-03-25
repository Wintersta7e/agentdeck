import type { Workflow } from '../shared/types'

/** Matches {{VAR_NAME}} where name is uppercase + underscore + digits */
const VAR_RE = /\{\{([A-Z_][A-Z0-9_]*)\}\}/g

/**
 * Replace {{VAR}} placeholders in node prompts, commands, messages, and agentFlags.
 * Returns a new workflow with substituted values. Does not mutate the input.
 * Unresolved variables are left as-is (the agent sees the literal {{VAR}}).
 */
export function substituteVariables(workflow: Workflow, values: Record<string, string>): Workflow {
  function replace(s: string | undefined): string | undefined {
    if (s === undefined) return undefined
    return s.replace(VAR_RE, (match, name: string) => values[name] ?? match)
  }

  return {
    ...workflow,
    nodes: workflow.nodes.map((n) => ({
      ...n,
      prompt: replace(n.prompt),
      command: replace(n.command),
      message: replace(n.message),
      agentFlags: replace(n.agentFlags),
    })),
  }
}
