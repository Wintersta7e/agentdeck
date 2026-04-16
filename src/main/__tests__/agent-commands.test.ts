import { describe, it, expect } from 'vitest'
import { AGENT_PRINT_FLAGS } from '../node-runners'
import { AGENT_BINARY_MAP } from '../../shared/agents'

/**
 * Snapshot tests for the non-interactive command strings that the workflow
 * engine constructs per agent. These are the most fragile configuration in
 * the codebase — a CLI flag change by any agent silently breaks all workflow
 * nodes for that agent. These snapshots make breakage visible.
 */
describe('Agent command construction', () => {
  describe('AGENT_PRINT_FLAGS', () => {
    it('claude-code uses --print', () => {
      expect(AGENT_PRINT_FLAGS['claude-code']).toEqual(['--print'])
    })

    it('codex uses exec subcommand', () => {
      expect(AGENT_PRINT_FLAGS['codex']).toEqual(['exec'])
    })

    it('aider uses --message', () => {
      expect(AGENT_PRINT_FLAGS['aider']).toEqual(['--message'])
    })

    it('goose uses run -t', () => {
      expect(AGENT_PRINT_FLAGS['goose']).toEqual(['run', '-t'])
    })

    it('gemini-cli uses -p', () => {
      expect(AGENT_PRINT_FLAGS['gemini-cli']).toEqual(['-p'])
    })

    it('amazon-q uses chat --no-interactive --trust-all-tools', () => {
      expect(AGENT_PRINT_FLAGS['amazon-q']).toEqual([
        'chat',
        '--no-interactive',
        '--trust-all-tools',
      ])
    })

    it('opencode uses run', () => {
      expect(AGENT_PRINT_FLAGS['opencode']).toEqual(['run'])
    })

    it('has flags for every agent in AGENT_BINARY_MAP', () => {
      for (const agentId of Object.keys(AGENT_BINARY_MAP)) {
        expect(AGENT_PRINT_FLAGS[agentId]).toBeDefined()
      }
    })
  })

  describe('AGENT_BINARY_MAP', () => {
    it('maps all 7 agents to binaries', () => {
      expect(Object.keys(AGENT_BINARY_MAP)).toHaveLength(7)
    })

    it('snapshot of binary names', () => {
      expect(AGENT_BINARY_MAP).toMatchInlineSnapshot(`
        {
          "aider": "aider",
          "amazon-q": "q",
          "claude-code": "claude",
          "codex": "codex",
          "gemini-cli": "gemini",
          "goose": "goose",
          "opencode": "opencode",
        }
      `)
    })
  })

  describe('full command construction', () => {
    it('constructs expected command for each agent', () => {
      const commands: Record<string, string> = {}
      for (const [agentId, binary] of Object.entries(AGENT_BINARY_MAP)) {
        const flags = AGENT_PRINT_FLAGS[agentId] ?? []
        commands[agentId] = [binary, ...flags, '<prompt>'].join(' ')
      }

      expect(commands).toMatchInlineSnapshot(`
        {
          "aider": "aider --message <prompt>",
          "amazon-q": "q chat --no-interactive --trust-all-tools <prompt>",
          "claude-code": "claude --print <prompt>",
          "codex": "codex exec <prompt>",
          "gemini-cli": "gemini -p <prompt>",
          "goose": "goose run -t <prompt>",
          "opencode": "opencode run <prompt>",
        }
      `)
    })
  })
})
