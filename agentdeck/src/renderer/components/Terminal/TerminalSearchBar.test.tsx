import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { act } from 'react'
import { TerminalSearchBar } from './TerminalSearchBar'

// Mock SearchAddon
function makeMockSearchAddon() {
  const listeners = new Set<(e: { resultIndex: number; resultCount: number }) => void>()
  return {
    findNext: vi.fn((): boolean => true),
    findPrevious: vi.fn((): boolean => true),
    clearDecorations: vi.fn((): void => undefined),
    onDidChangeResults: vi.fn((cb: (e: { resultIndex: number; resultCount: number }) => void) => {
      listeners.add(cb)
      return { dispose: () => listeners.delete(cb) }
    }),
    _fireResults(resultIndex: number, resultCount: number) {
      for (const cb of listeners) cb({ resultIndex, resultCount })
    },
  }
}

describe('TerminalSearchBar', () => {
  let addon: ReturnType<typeof makeMockSearchAddon>
  const onClose = vi.fn()

  afterEach(() => cleanup())

  beforeEach(() => {
    addon = makeMockSearchAddon()
    onClose.mockClear()
  })

  it('renders nothing when not visible', () => {
    const { container } = render(
      <TerminalSearchBar searchAddon={addon as never} visible={false} onClose={onClose} />,
    )
    expect(container.querySelector('.term-search-bar')).toBeNull()
  })

  it('renders search input when visible', () => {
    render(<TerminalSearchBar searchAddon={addon as never} visible={true} onClose={onClose} />)
    expect(screen.getByPlaceholderText('Find...')).toBeInTheDocument()
  })

  it('calls findNext on Enter', () => {
    render(<TerminalSearchBar searchAddon={addon as never} visible={true} onClose={onClose} />)
    const input = screen.getByPlaceholderText('Find...')
    fireEvent.change(input, { target: { value: 'error' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(addon.findNext).toHaveBeenCalled()
  })

  it('calls findPrevious on Shift+Enter', () => {
    render(<TerminalSearchBar searchAddon={addon as never} visible={true} onClose={onClose} />)
    const input = screen.getByPlaceholderText('Find...')
    fireEvent.change(input, { target: { value: 'error' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(addon.findPrevious).toHaveBeenCalled()
  })

  it('calls onClose on Escape', () => {
    render(<TerminalSearchBar searchAddon={addon as never} visible={true} onClose={onClose} />)
    const input = screen.getByPlaceholderText('Find...')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('clears decorations on close', () => {
    render(<TerminalSearchBar searchAddon={addon as never} visible={true} onClose={onClose} />)
    const input = screen.getByPlaceholderText('Find...')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(addon.clearDecorations).toHaveBeenCalled()
  })

  it('displays result count from onDidChangeResults', () => {
    render(<TerminalSearchBar searchAddon={addon as never} visible={true} onClose={onClose} />)
    const input = screen.getByPlaceholderText('Find...')
    fireEvent.change(input, { target: { value: 'error' } })
    act(() => addon._fireResults(2, 5))
    expect(screen.getByText('3 of 5')).toBeInTheDocument()
  })

  it('shows "No results" when result count is 0', () => {
    render(<TerminalSearchBar searchAddon={addon as never} visible={true} onClose={onClose} />)
    const input = screen.getByPlaceholderText('Find...')
    fireEvent.change(input, { target: { value: 'nonexistent' } })
    act(() => addon._fireResults(-1, 0))
    expect(screen.getByText('No results')).toBeInTheDocument()
  })

  it('toggles regex mode', () => {
    render(<TerminalSearchBar searchAddon={addon as never} visible={true} onClose={onClose} />)
    const regexBtn = screen.getByTitle('Use Regex (Alt+R)')
    fireEvent.click(regexBtn)
    expect(regexBtn.classList.contains('active')).toBe(true)
  })
})
