import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG'

const LOG_FILE = 'agentdeck.log'
const MAX_SIZE = 2 * 1024 * 1024 // 2 MB
const DEBUG_ENABLED = !!process.env['AGENTDECK_DEBUG']

let stream: fs.WriteStream | null = null
let logDir = ''

function timestamp(): string {
  const d = new Date()
  const pad2 = (n: number): string => String(n).padStart(2, '0')
  const pad3 = (n: number): string => String(n).padStart(3, '0')
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`
}

function rotate(logPath: string): void {
  try {
    const stats = fs.statSync(logPath)
    if (stats.size >= MAX_SIZE) {
      const backup = logPath + '.1'
      // Overwrite any existing backup
      fs.renameSync(logPath, backup)
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      console.error(`[logger] rotate error: ${String(err)}`)
    }
  }
}

export function initLogger(): void {
  logDir = app.getPath('logs')
  fs.mkdirSync(logDir, { recursive: true })

  const logPath = path.join(logDir, LOG_FILE)
  rotate(logPath)

  stream = fs.createWriteStream(logPath, { flags: 'a' })
  stream.on('error', (err) => {
    console.error(`[logger] write stream error: ${String(err)}`)
    stream = null
  })
}

function write(level: LogLevel, mod: string, message: string, data?: unknown): void {
  if (level === 'DEBUG' && !DEBUG_ENABLED) return

  let extra = ''
  if (data !== undefined) {
    try {
      extra = ' ' + JSON.stringify(data)
    } catch {
      extra = ' [unserializable]'
    }
  }
  const line = `[${timestamp()}] [${level}]${level.length < 5 ? ' ' : ''} [${mod}] ${message}${extra}\n`

  stream?.write(line)

  // Mirror to console
  switch (level) {
    case 'ERROR':
      console.error(line.trimEnd())
      break
    case 'WARN':
      console.warn(line.trimEnd())
      break
    case 'DEBUG':
      // eslint-disable-next-line no-console -- logger is the sanctioned output channel
      console.debug(line.trimEnd())
      break
    default:
      // eslint-disable-next-line no-console -- logger is the sanctioned output channel
      console.log(line.trimEnd())
  }
}

export interface Logger {
  info: (message: string, data?: unknown) => void
  warn: (message: string, data?: unknown) => void
  error: (message: string, data?: unknown) => void
  debug: (message: string, data?: unknown) => void
}

export function createLogger(mod: string): Logger {
  return {
    info: (message, data?) => write('INFO', mod, message, data),
    warn: (message, data?) => write('WARN', mod, message, data),
    error: (message, data?) => write('ERROR', mod, message, data),
    debug: (message, data?) => write('DEBUG', mod, message, data),
  }
}

export function closeLogger(): void {
  if (stream) {
    stream.end()
    stream = null
  }
}

export function getLogPath(): string {
  return path.join(logDir, LOG_FILE)
}
