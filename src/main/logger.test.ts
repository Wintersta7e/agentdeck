import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock electron app and fs before importing
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/mock-logs'),
  },
}))

vi.mock('fs', () => {
  const chunks: string[] = []
  const mockStream = {
    write: vi.fn((line: string) => {
      chunks.push(line)
    }),
    end: vi.fn(),
    on: vi.fn().mockReturnThis(),
  }
  return {
    mkdirSync: vi.fn(),
    statSync: vi.fn(() => ({ size: 0 })),
    renameSync: vi.fn(),
    createWriteStream: vi.fn(() => mockStream),
    __mockStream: mockStream,
    __chunks: chunks,
  }
})

import { createLogger, initLogger, closeLogger } from './logger'
import * as fs from 'fs'

const mockStream = (
  fs as unknown as {
    __mockStream: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
  }
).__mockStream
const chunks = (fs as unknown as { __chunks: string[] }).__chunks

beforeEach(() => {
  vi.clearAllMocks()
  chunks.length = 0
  // Initialize logger to set up the stream
  initLogger()
})

afterEach(() => {
  closeLogger()
})

describe('createLogger', () => {
  it('returns an object with info, warn, error, debug methods', () => {
    const log = createLogger('test-mod')
    expect(typeof log.info).toBe('function')
    expect(typeof log.warn).toBe('function')
    expect(typeof log.error).toBe('function')
    expect(typeof log.debug).toBe('function')
  })

  it('writes INFO level messages', () => {
    const log = createLogger('mymod')
    log.info('hello world')

    expect(mockStream.write).toHaveBeenCalled()
    const line = chunks[0]
    expect(line).toContain('[INFO]')
    expect(line).toContain('[mymod]')
    expect(line).toContain('hello world')
  })

  it('writes WARN level messages', () => {
    const log = createLogger('mymod')
    log.warn('something bad')

    const line = chunks[0]
    expect(line).toContain('[WARN]')
    expect(line).toContain('something bad')
  })

  it('writes ERROR level messages', () => {
    const log = createLogger('mymod')
    log.error('crash', { code: 500 })

    const line = chunks[0]
    expect(line).toContain('[ERROR]')
    expect(line).toContain('crash')
    expect(line).toContain('500')
  })

  it('includes JSON data when provided', () => {
    const log = createLogger('mymod')
    log.info('event', { key: 'value' })

    const line = chunks[0]
    expect(line).toContain('"key":"value"')
  })

  it('filters DEBUG when AGENTDECK_DEBUG is not set', () => {
    // process.env.AGENTDECK_DEBUG is not set in test environment
    const log = createLogger('mymod')
    log.debug('debug msg')

    // DEBUG should be filtered — no write for this message
    // Note: other writes may exist from initLogger, so check specifically
    const debugLines = chunks.filter((c) => c.includes('[DEBUG]') && c.includes('debug msg'))
    expect(debugLines).toHaveLength(0)
  })

  it('includes timestamp in log format', () => {
    const log = createLogger('mymod')
    log.info('time check')

    const line = chunks.find((c) => c.includes('time check'))
    // Timestamp format: [YYYY-MM-DD HH:MM:SS.mmm]
    expect(line).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\]/)
  })
})

describe('closeLogger', () => {
  it('ends the stream', () => {
    closeLogger()
    expect(mockStream.end).toHaveBeenCalled()
  })
})

describe('log rotation', () => {
  it('rotates when file exceeds 2MB', () => {
    // Mock statSync to return a file larger than 2MB
    vi.mocked(fs.statSync).mockReturnValue({ size: 3 * 1024 * 1024 } as never)

    // Re-init to trigger rotation
    initLogger()
    expect(fs.renameSync).toHaveBeenCalled()
  })
})
