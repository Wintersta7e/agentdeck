import { readdir } from 'fs/promises'
import { wslPathToWindows } from './wsl-utils'
import type { AgentType, DetectedStack, StackBadge } from '../shared/types'

interface DetectionRule {
  file: string
  badge: StackBadge
  label: string
  detail: string
}

const RULES: DetectionRule[] = [
  { file: 'pom.xml', badge: 'Java', label: 'Java', detail: 'Maven (pom.xml)' },
  { file: 'build.gradle', badge: 'Java', label: 'Java', detail: 'Gradle (build.gradle)' },
  { file: 'package.json', badge: 'JS', label: 'JavaScript', detail: 'Node.js (package.json)' },
  { file: 'Cargo.toml', badge: 'Rust', label: 'Rust', detail: 'Cargo (Cargo.toml)' },
  { file: 'pyproject.toml', badge: 'Python', label: 'Python', detail: 'pyproject.toml' },
  { file: 'setup.py', badge: 'Python', label: 'Python', detail: 'setup.py' },
  { file: 'requirements.txt', badge: 'Python', label: 'Python', detail: 'requirements.txt' },
  { file: 'go.mod', badge: 'Go', label: 'Go', detail: 'Go module (go.mod)' },
]

const CONTEXT_FILES = ['AGENTS.md', 'CLAUDE.md']

export async function detectStack(
  projectPath: string,
  distro = 'Ubuntu-24.04',
): Promise<DetectedStack | null> {
  // Detect if it's already a Windows path or a WSL path
  let windowsPath: string
  if (/^[A-Za-z]:/.test(projectPath)) {
    windowsPath = projectPath
  } else {
    windowsPath = wslPathToWindows(projectPath, distro)
  }

  let entries: string[]
  try {
    entries = await readdir(windowsPath)
  } catch (err: unknown) {
    // If UNC path via wsl.localhost failed, try wsl$ fallback
    if (windowsPath.startsWith('\\\\wsl.localhost\\')) {
      const fallbackPath = windowsPath.replace('\\\\wsl.localhost\\', '\\\\wsl$\\')
      try {
        entries = await readdir(fallbackPath)
      } catch {
        console.error(`[detect-stack] Failed to read directory ${windowsPath}:`, err)
        return null
      }
    } else {
      const code = (err as NodeJS.ErrnoException)?.code
      if (code === 'ENOENT') return null
      console.error(`[detect-stack] Failed to read directory ${windowsPath}:`, err)
      return null
    }
  }

  const entrySet = new Set(entries)
  const items: { label: string; detail: string }[] = []
  let badge: StackBadge = 'Other'
  let foundBadge = false

  for (const rule of RULES) {
    if (entrySet.has(rule.file)) {
      items.push({ label: rule.label, detail: rule.detail })
      if (!foundBadge) {
        badge = rule.badge
        foundBadge = true
      }
    }
  }

  // .sln / .csproj glob match
  const hasDotnet = entries.some((e) => e.endsWith('.sln') || e.endsWith('.csproj'))
  if (hasDotnet) {
    items.push({ label: '.NET', detail: '.NET solution' })
    if (!foundBadge) {
      badge = '.NET'
      foundBadge = true
    }
  }

  // Upgrade JS to TS if tsconfig.json present
  if (entrySet.has('tsconfig.json') && badge === 'JS') {
    badge = 'TS'
    const jsItem = items.find((i) => i.label === 'JavaScript')
    if (jsItem) {
      jsItem.label = 'TypeScript'
      jsItem.detail = 'TypeScript (tsconfig.json + package.json)'
    }
  } else if (entrySet.has('tsconfig.json')) {
    items.push({ label: 'TypeScript', detail: 'tsconfig.json' })
  }

  if (entrySet.has('.git')) {
    items.push({ label: 'Git', detail: 'Git repository' })
  }

  const contextFiles = CONTEXT_FILES.filter((f) => entrySet.has(f))
  for (const cf of contextFiles) {
    items.push({ label: cf, detail: `Context file: ${cf}` })
  }

  const suggestedAgent: AgentType = 'claude-code'
  const suggestedCommands = [`cd "${projectPath.replace(/"/g, '\\"')}"`, 'claude']

  return { badge, items, suggestedAgent, suggestedCommands, contextFiles }
}
