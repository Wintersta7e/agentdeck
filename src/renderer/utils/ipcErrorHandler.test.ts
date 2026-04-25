import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the store before importing the module under test
const mockAddNotification = vi.fn()
vi.mock('../store/appStore', () => ({
  useAppStore: {
    getState: () => ({
      addNotification: mockAddNotification,
    }),
  },
}))

import { handleIpcError } from './ipcErrorHandler'

describe('handleIpcError', () => {
  beforeEach(() => {
    mockAddNotification.mockClear()
  })

  it('maps "non-null object" to friendly message', () => {
    handleIpcError(new Error('store:saveProject requires a non-null object'))
    expect(mockAddNotification).toHaveBeenCalledWith(
      'error',
      'Invalid data \u2014 please check your inputs',
    )
  })

  it('maps "Invalid id" to friendly message', () => {
    handleIpcError(new Error('Invalid id: abc-123'))
    expect(mockAddNotification).toHaveBeenCalledWith(
      'error',
      'Could not find that item \u2014 it may have been deleted',
    )
  })

  it('maps "Maximum concurrent sessions" to friendly message', () => {
    handleIpcError(new Error('Maximum concurrent sessions reached'))
    expect(mockAddNotification).toHaveBeenCalledWith(
      'error',
      'Too many terminals open \u2014 close some before opening more',
    )
  })

  it('maps "PTY manager not initialized" to friendly message', () => {
    handleIpcError(new Error('PTY manager not initialized'))
    expect(mockAddNotification).toHaveBeenCalledWith(
      'error',
      'Terminal system not ready \u2014 try again in a moment',
    )
  })

  it('maps "ENOENT" to friendly message', () => {
    handleIpcError(new Error('ENOENT: no such file'))
    expect(mockAddNotification).toHaveBeenCalledWith(
      'error',
      'File or folder not found \u2014 check the path and try again',
    )
  })

  it('maps "EACCES" to friendly message', () => {
    handleIpcError(new Error('EACCES: permission denied'))
    expect(mockAddNotification).toHaveBeenCalledWith(
      'error',
      'Permission denied \u2014 check file permissions',
    )
  })

  it('prepends context to friendly messages when provided', () => {
    handleIpcError(new Error('ENOENT: no such file'), 'Failed to save project')
    expect(mockAddNotification).toHaveBeenCalledWith(
      'error',
      'Failed to save project: File or folder not found \u2014 check the path and try again',
    )
  })

  it('falls back to context with "please try again" for unknown errors', () => {
    handleIpcError(new Error('Some unknown IPC error'), 'Failed to load data')
    expect(mockAddNotification).toHaveBeenCalledWith(
      'error',
      'Failed to load data \u2014 please try again',
    )
  })

  it('shows generic fallback when no context and no match', () => {
    handleIpcError(new Error('Totally unexpected'))
    expect(mockAddNotification).toHaveBeenCalledWith(
      'error',
      'Something went wrong \u2014 please try again',
    )
  })

  it('handles string errors', () => {
    handleIpcError('raw string error', 'Saving')
    expect(mockAddNotification).toHaveBeenCalledWith('error', 'Saving \u2014 please try again')
  })

  it('handles non-Error objects', () => {
    handleIpcError({ code: 42 })
    expect(mockAddNotification).toHaveBeenCalledWith(
      'error',
      'Something went wrong \u2014 please try again',
    )
  })

  it('calls addNotification exactly once per invocation', () => {
    handleIpcError(new Error('test'))
    expect(mockAddNotification).toHaveBeenCalledTimes(1)
  })
})
