import type { Workflow, WorkflowNode } from '../shared/types'

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

  function substituteNode(n: WorkflowNode): WorkflowNode {
    switch (n.type) {
      case 'agent':
        return { ...n, prompt: replace(n.prompt), agentFlags: replace(n.agentFlags) }
      case 'shell':
        return { ...n, command: replace(n.command) }
      case 'checkpoint':
        return { ...n, message: replace(n.message) }
      case 'condition':
        return n
    }
  }

  return {
    ...workflow,
    nodes: workflow.nodes.map(substituteNode),
  }
}
