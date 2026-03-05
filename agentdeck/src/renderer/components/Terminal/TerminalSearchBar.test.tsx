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
    expect(addon.findNext).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ incremental: true }),
    )
  })

  it('calls findPrevious on Shift+Enter', () => {
    render(<TerminalSearchBar searchAddon={addon as never} visible={true} onClose={onClose} />)
    const input = screen.getByPlaceholderText('Find...')
    fireEvent.change(input, { target: { value: 'error' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(addon.findPrevious).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ incremental: true }),
    )
  })

  it('calls onClose on Escape', () => {
    render(<TerminalSearchBar searchAddon={addon as never} visible={true} onClose={onClose} />)
    const input = screen.getByPlaceholderText('Find...')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('clears decorations on close via Escape', () => {
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

  // ─── T1: Incremental search on input change ───────────────────────
  it('triggers incremental findNext as the user types', () => {
    render(<TerminalSearchBar searchAddon={addon as never} visible={true} onClose={onClose} />)
    const input = screen.getByPlaceholderText('Find...')
    fireEvent.change(input, { target: { value: 'hello' } })
    expect(addon.findNext).toHaveBeenCalledWith(
      'hello',
      expect.objectContaining({ incremental: true }),
    )
  })

  // ─── T2: Empty query clears decorations and resets count ──────────
  it('clears decorations and resets count when query is emptied', () => {
    render(<TerminalSearchBar searchAddon={addon as never} visible={true} onClose={onClose} />)
    const input = screen.getByPlaceholderText('Find...')
    // Type something, get results
    fireEvent.change(input, { target: { value: 'error' } })
    act(() => addon._fireResults(0, 3))
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
    // Clear the input
    fireEvent.change(input, { target: { value: '' } })
    expect(addon.clearDecorations).toHaveBeenCalled()
    expect(screen.queryByText('1 of 3')).toBeNull()
    expect(screen.queryByText('No results')).toBeNull()
  })

  // ─── T3: Toggle re-search with active query ──────────────────────
  it('re-searches with regex enabled when toggling regex with an active query', () => {
    render(<TerminalSearchBar searchAddon={addon as never} visible={true} onClose={onClose} />)
    const input = screen.getByPlaceholderText('Find...')
    fireEvent.change(input, { target: { value: 'err.*' } })
    addon.findNext.mockClear()

    const regexBtn = screen.getByTitle('Use Regex (Alt+R)')
    fireEvent.click(regexBtn)

    expect(addon.findNext).toHaveBeenCalledWith(
      'err.*',
      expect.objectContaining({ regex: true, incremental: true }),
    )
  })

  it('re-searches with caseSensitive when toggling case with an active query', () => {
    render(<TerminalSearchBar searchAddon={addon as never} visible={true} onClose={onClose} />)
    const input = screen.getByPlaceholderText('Find...')
    fireEvent.change(input, { target: { value: 'Error' } })
    addon.findNext.mockClear()

    const caseBtn = screen.getByTitle('Match Case (Alt+C)')
    fireEvent.click(caseBtn)

    expect(addon.findNext).toHaveBeenCalledWith(
      'Error',
      expect.objectContaining({ caseSensitive: true }),
    )
  })

  // ─── T4: Close button (X) ────────────────────────────────────────
  it('closes and clears decorations when clicking the X button', () => {
    render(<TerminalSearchBar searchAddon={addon as never} visible={true} onClose={onClose} />)
    const closeBtn = screen.getByTitle('Close (Esc)')
    fireEvent.click(closeBtn)
    expect(addon.clearDecorations).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  // ─── T5: Nav buttons disabled when no results ────────────────────
  it('disables nav buttons when there are no results', () => {
    render(<TerminalSearchBar searchAddon={addon as never} visible={true} onClose={onClose} />)
    const prevBtn = screen.getByTitle('Previous Match (Shift+Enter)')
    const nextBtn = screen.getByTitle('Next Match (Enter)')
    expect(prevBtn).toBeDisabled()
    expect(nextBtn).toBeDisabled()
  })

  it('enables nav buttons when there are results', () => {
    render(<TerminalSearchBar searchAddon={addon as never} visible={true} onClose={onClose} />)
    const input = screen.getByPlaceholderText('Find...')
    fireEvent.change(input, { target: { value: 'test' } })
    act(() => addon._fireResults(0, 3))
    const prevBtn = screen.getByTitle('Previous Match (Shift+Enter)')
    const nextBtn = screen.getByTitle('Next Match (Enter)')
    expect(prevBtn).not.toBeDisabled()
    expect(nextBtn).not.toBeDisabled()
  })

  // ─── T6: Invalid regex doesn't crash ─────────────────────────────
  it('does not crash on invalid regex pattern', () => {
    addon.findNext.mockImplementation((): boolean => {
      throw new SyntaxError('Invalid regular expression: /[/: Unterminated character class')
    })
    render(<TerminalSearchBar searchAddon={addon as never} visible={true} onClose={onClose} />)
    const input = screen.getByPlaceholderText('Find...')
    // Should not throw
    expect(() => {
      fireEvent.change(input, { target: { value: '[' } })
    }).not.toThrow()
  })

  it('does not crash on invalid regex with Enter', () => {
    addon.findNext.mockImplementation((): boolean => {
      throw new SyntaxError('Invalid regular expression')
    })
    render(<TerminalSearchBar searchAddon={addon as never} visible={true} onClose={onClose} />)
    const input = screen.getByPlaceholderText('Find...')
    fireEvent.change(input, { target: { value: '[' } })
    expect(() => {
      fireEvent.keyDown(input, { key: 'Enter' })
    }).not.toThrow()
  })
})
