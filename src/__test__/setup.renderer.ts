/**
 * Vitest setup for renderer-process tests.
 * Mocks the window.agentDeck bridge and imports jest-dom matchers.
 */
import { vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Enable React act() environment for jsdom tests
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// ── window.agentDeck IPC bridge mock ───────────────────────
const mockAgentDeck = {
  pty: {
    spawn: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(() => vi.fn()),
    onActivity: vi.fn(() => vi.fn()),
    onExit: vi.fn(() => vi.fn()),
  },
  projects: {
    list: vi.fn(async () => []),
    get: vi.fn(async () => null),
    create: vi.fn(async () => ({ id: 'test-id' })),
    update: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  },
  templates: {
    list: vi.fn(async () => []),
    save: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  },
  pickFolder: vi.fn(async () => null),
  readProjectFile: vi.fn(async () => null),
  layout: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
  },
  theme: {
    set: vi.fn(async () => {}),
  },
  agents: {
    setVisible: vi.fn(async () => {}),
  },
}

Object.defineProperty(globalThis, 'agentDeck', {
  value: mockAgentDeck,
  writable: true,
  configurable: true,
})

// Also on window for components that use window.agentDeck
Object.defineProperty(window, 'agentDeck', {
  value: mockAgentDeck,
  writable: true,
  configurable: true,
})
