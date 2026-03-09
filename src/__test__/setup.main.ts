/**
 * Vitest setup for main-process tests.
 * Mocks Electron APIs and node-pty so tests run in plain Node.
 */
import { vi } from 'vitest'

// ── Electron mock ──────────────────────────────────────────
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => `/tmp/mock-electron/${name}`),
    getName: vi.fn(() => 'agentdeck-test'),
    getVersion: vi.fn(() => '0.0.0-test'),
    on: vi.fn(),
    quit: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    webContents: {
      send: vi.fn(),
      on: vi.fn(),
    },
    on: vi.fn(),
    isDestroyed: vi.fn(() => false),
    loadURL: vi.fn(),
    show: vi.fn(),
  })),
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`)),
    decryptString: vi.fn((b: Buffer) => b.toString().replace(/^enc:/, '')),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
}))

// ── node-pty mock ──────────────────────────────────────────
vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    pid: 12345,
  })),
}))
