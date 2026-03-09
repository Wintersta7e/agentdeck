import { EventEmitter } from 'events'

/**
 * Internal event bus for PTY data/exit events.
 *
 * pty-manager.ts sends data to the renderer via `webContents.send()`, which
 * is a one-way main->renderer IPC channel that does NOT fire events on the
 * main-process EventEmitter. To let the workflow engine (which lives in
 * the main process) capture PTY output, pty-manager also emits on this bus:
 *
 *   ptyBus.emit(`data:${sessionId}`, data)
 *   ptyBus.emit(`exit:${sessionId}`, exitCode)
 *
 * Extracted to its own module to break the circular dependency between
 * pty-manager and workflow-engine.
 */
export const ptyBus = new EventEmitter()
ptyBus.setMaxListeners(200)
