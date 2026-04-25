import { useAppStore } from '../store/appStore'
import type { Session, OpenSessionSeed, AgentType } from '../../shared/types'

/**
 * Clone a finished session's launch configuration and open a new session with
 * it. The immutable spawn-time snapshot (resolvedContextWindow / source) is
 * intentionally NOT copied — the new session captures its own fresh snapshot
 * so the v6.0.1 immutability-at-spawn rule is honored.
 *
 * Returns the new session id.
 */
export function rerunSession(old: Session): string {
  const seed: OpenSessionSeed = {
    projectId: old.projectId,
    agentOverride: old.agentOverride,
    agentFlagsOverride: old.agentFlagsOverride,
    initialPrompt: old.initialPrompt,
    branchMode: old.branchMode,
    initialBranch: old.initialBranch,
    costCap: old.costCap,
    runMode: old.runMode,
    approve: old.approve,
    model: old.model,
    // resolvedContextWindow / resolvedContextSource intentionally NOT copied —
    // re-captured below so the new session's context is freshly resolved.
    seedTemplateId: old.seedTemplateId,
  }
  const newId = useAppStore.getState().openSession(seed)
  // Re-capture fresh model + context window for the new session
  // (v6.0.1 immutability-at-spawn). If agentOverride is undefined we skip —
  // captureSessionSnapshot requires an agent id.
  const agentId: AgentType | undefined = old.agentOverride
  if (agentId) {
    void useAppStore.getState().captureSessionSnapshot(newId, agentId)
  }
  return newId
}
