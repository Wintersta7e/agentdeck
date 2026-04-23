/// <reference types="node" />
// src/shared/__tests__/no-direct-contextwindow-reads.test.ts
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = join(__dirname, '../../..')
const SCAN_DIRS = [join(ROOT, 'src', 'renderer'), join(ROOT, 'src', 'main')]

/**
 * Files allowed to read `.contextWindow` directly.
 * Registry declaration, resolver, IPC handler, and fallback loading placeholders.
 *
 * The fallback files use `ctx.value ?? agent.contextWindow` pattern — safe during
 * loading when async context resolution hasn't completed yet. Primary value source
 * is always useEffectiveContext hook.
 */
const WHITELIST = new Set<string>([
  'src/shared/agents.ts',
  'src/shared/context-window.ts',
  'src/main/ipc/ipc-agents.ts',
  'src/renderer/components/home/AgentChipB1.tsx',
  'src/renderer/screens/AgentsScreen/AgentsScreen.tsx',
  'src/renderer/screens/NewSessionScreen/NewSessionScreen.tsx',
])

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

describe('no direct contextWindow reads outside whitelist', () => {
  it('has no matches for agent.contextWindow or AGENTS[*].contextWindow', () => {
    const offenders: Array<{ file: string; line: number; text: string }> = []
    for (const d of SCAN_DIRS) {
      for (const f of walk(d)) {
        const rel = relative(ROOT, f).replace(/\\/g, '/')
        if (WHITELIST.has(rel)) continue
        const src = readFileSync(f, 'utf8')
        const lines = src.split(/\r?\n/)
        for (let i = 0; i < lines.length; i++) {
          if (/\b(?:agent|AGENTS\[[^\]]+\])\.contextWindow\b/.test(lines[i]!)) {
            offenders.push({ file: rel, line: i + 1, text: lines[i]!.trim() })
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
