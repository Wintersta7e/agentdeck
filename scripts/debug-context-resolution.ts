/* eslint-disable no-console */
import { AGENTS } from '../src/shared/agents'
import { DETECTORS } from '../src/main/active-model-detectors/index'
import { getEffectiveContextWindow } from '../src/shared/context-window'

async function main() {
  const defaults = Object.fromEntries(AGENTS.map((a) => [a.id, a.contextWindow]))
  console.log('agent           ctx        source                 model')
  console.log('-------------   --------   --------------------   -----')
  for (const a of AGENTS) {
    const reader = DETECTORS[a.id]
    const det = await reader()
    const r = getEffectiveContextWindow({
      agentId: a.id,
      activeModel: det.modelId,
      cliContextOverride: det.cliContextOverride,
      overrides: { agent: {}, model: {} },
      agentDefaults: defaults,
    })
    console.log(
      `${a.id.padEnd(15)} ${String(r.value).padStart(8)}   ${r.source.padEnd(20)}   ${r.modelId ?? '(none)'}`,
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
