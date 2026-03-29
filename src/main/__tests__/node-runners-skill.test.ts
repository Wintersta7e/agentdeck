import { describe, it, expect } from 'vitest'
import { extractSkillPrefix } from '../node-runners'

// ── Skill prefix extraction ──────────────────────────────────────
//
// Tests the exported extractSkillPrefix function used in runAgentNode
// to build a Codex skill invocation prefix (`$skill-name `) from a
// workflow node's skillId. Returns prefix with trailing space.

describe('skill prefix extraction', () => {
  it('returns $skill-name for codex with valid global skillId', () => {
    expect(extractSkillPrefix('global:lint-fix', 'codex')).toBe('$lint-fix ')
  })

  it('returns $skill-name for codex with valid project skillId', () => {
    expect(extractSkillPrefix('project:deploy', 'codex')).toBe('$deploy ')
  })

  it('returns null for non-codex agent (claude-code)', () => {
    expect(extractSkillPrefix('global:lint-fix', 'claude-code')).toBeNull()
  })

  it('returns null for non-codex agent (aider)', () => {
    expect(extractSkillPrefix('global:lint-fix', 'aider')).toBeNull()
  })

  it('returns null for non-codex agent (goose)', () => {
    expect(extractSkillPrefix('global:lint-fix', 'goose')).toBeNull()
  })

  it('returns null when skillId is undefined', () => {
    expect(extractSkillPrefix(undefined, 'codex')).toBeNull()
  })

  it('returns null for empty skill name after split', () => {
    expect(extractSkillPrefix('global:', 'codex')).toBeNull()
  })

  it('returns null for unsafe skill name with spaces', () => {
    expect(extractSkillPrefix('global:foo bar', 'codex')).toBeNull()
  })

  it('returns null for unsafe skill name with special chars', () => {
    expect(extractSkillPrefix('global:foo@bar', 'codex')).toBeNull()
  })

  it('returns null for unsafe skill name with slashes', () => {
    expect(extractSkillPrefix('global:foo/bar', 'codex')).toBeNull()
  })

  it('handles names with underscores', () => {
    expect(extractSkillPrefix('global:code_review', 'codex')).toBe('$code_review ')
  })

  it('handles names with digits', () => {
    expect(extractSkillPrefix('project:fix2024', 'codex')).toBe('$fix2024 ')
  })

  it('handles single character name', () => {
    expect(extractSkillPrefix('global:a', 'codex')).toBe('$a ')
  })

  it('returns null for empty string skillId', () => {
    expect(extractSkillPrefix('', 'codex')).toBeNull()
  })

  it('handles skillId with no colon (bare name)', () => {
    // split(':').pop() on 'lint-fix' returns 'lint-fix'
    expect(extractSkillPrefix('lint-fix', 'codex')).toBe('$lint-fix ')
  })
})
