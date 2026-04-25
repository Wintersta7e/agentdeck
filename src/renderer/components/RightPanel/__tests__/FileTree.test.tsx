import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { FileTree } from '../FileTree'

describe('FileTree', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as unknown as { window: { agentDeck: unknown } }).window.agentDeck = {
      files: {
        listDir: vi.fn().mockImplementation(async ({ path: p }: { path: string }) => {
          if (p === '/proj') {
            return {
              entries: [
                { name: 'src', isDir: true },
                { name: 'README.md', isDir: false, size: 100, mtime: 1700000000000 },
              ],
              gitignored: [],
            }
          }
          if (p === '/proj/src') {
            return {
              entries: [{ name: 'index.ts', isDir: false, size: 50, mtime: 1700000000000 }],
              gitignored: [],
            }
          }
          return { entries: [], gitignored: [] }
        }),
        openExternal: vi.fn().mockResolvedValue(undefined),
      },
    }
  })

  it('lists entries on mount and renders folder before file', async () => {
    render(<FileTree projectPath="/proj" rootPath="/proj" />)
    await waitFor(() => expect(screen.getByText('src')).toBeInTheDocument())
    expect(screen.getByText('README.md')).toBeInTheDocument()
    const items = screen.getAllByRole('treeitem')
    expect(items[0]?.textContent).toContain('src')
    expect(items[1]?.textContent).toContain('README.md')
  })

  it('lazy-loads children on folder click', async () => {
    render(<FileTree projectPath="/proj" rootPath="/proj" />)
    await waitFor(() => expect(screen.getByText('src')).toBeInTheDocument())
    fireEvent.click(screen.getByText('src'))
    await waitFor(() => expect(screen.getByText('index.ts')).toBeInTheDocument())
  })

  it('opens file via shell.openPath when clicked, passing scope', async () => {
    render(<FileTree projectPath="/proj" rootPath="/proj" />)
    await waitFor(() => expect(screen.getByText('README.md')).toBeInTheDocument())
    fireEvent.click(screen.getByText('README.md'))
    await waitFor(() => {
      const calls = vi.mocked(window.agentDeck.files.openExternal).mock.calls
      expect(calls[0]?.[0]).toEqual({ path: '/proj/README.md', projectPath: '/proj' })
    })
  })

  it('shows error message when listDir rejects', async () => {
    vi.mocked(window.agentDeck.files.listDir).mockRejectedValueOnce(new Error('boom'))
    render(<FileTree projectPath="/proj" rootPath="/proj" />)
    await waitFor(() => expect(screen.getByText(/Failed to load/)).toBeInTheDocument())
  })

  it('ArrowDown moves focus through visible nodes', async () => {
    render(<FileTree projectPath="/proj" rootPath="/proj" />)
    await waitFor(() => expect(screen.getByText('src')).toBeInTheDocument())
    const tree = screen.getByRole('tree')
    fireEvent.focus(tree)
    fireEvent.keyDown(tree, { key: 'ArrowDown' })
    await waitFor(() => {
      const active = tree.querySelector('[data-active="true"]')
      expect(active?.textContent).toContain('README.md')
    })
  })

  it('Enter on a file invokes openExternal', async () => {
    render(<FileTree projectPath="/proj" rootPath="/proj" />)
    await waitFor(() => expect(screen.getByText('README.md')).toBeInTheDocument())
    const tree = screen.getByRole('tree')
    fireEvent.focus(tree)
    fireEvent.keyDown(tree, { key: 'ArrowDown' }) // active = README.md
    fireEvent.keyDown(tree, { key: 'Enter' })
    await waitFor(() => {
      expect(window.agentDeck.files.openExternal).toHaveBeenCalled()
    })
  })

  it('ArrowRight expands a folder', async () => {
    render(<FileTree projectPath="/proj" rootPath="/proj" />)
    await waitFor(() => expect(screen.getByText('src')).toBeInTheDocument())
    const tree = screen.getByRole('tree')
    fireEvent.focus(tree)
    // active starts on src (first row)
    fireEvent.keyDown(tree, { key: 'ArrowRight' })
    await waitFor(() => expect(screen.getByText('index.ts')).toBeInTheDocument())
  })

  it('ArrowUp moves focus to previous visible node', async () => {
    render(<FileTree projectPath="/proj" rootPath="/proj" />)
    await waitFor(() => expect(screen.getByText('src')).toBeInTheDocument())
    const tree = screen.getByRole('tree')
    fireEvent.focus(tree)
    fireEvent.keyDown(tree, { key: 'ArrowDown' }) // README.md
    fireEvent.keyDown(tree, { key: 'ArrowUp' }) // src
    await waitFor(() => {
      const active = tree.querySelector('[data-active="true"]')
      expect(active?.textContent).toContain('src')
    })
  })

  it('Home jumps to first visible, End to last visible', async () => {
    render(<FileTree projectPath="/proj" rootPath="/proj" />)
    await waitFor(() => expect(screen.getByText('src')).toBeInTheDocument())
    const tree = screen.getByRole('tree')
    fireEvent.focus(tree)
    fireEvent.keyDown(tree, { key: 'End' })
    await waitFor(() => {
      const active = tree.querySelector('[data-active="true"]')
      expect(active?.textContent).toContain('README.md')
    })
    fireEvent.keyDown(tree, { key: 'Home' })
    await waitFor(() => {
      const active = tree.querySelector('[data-active="true"]')
      expect(active?.textContent).toContain('src')
    })
  })

  it('ArrowLeft collapses an expanded folder', async () => {
    render(<FileTree projectPath="/proj" rootPath="/proj" />)
    await waitFor(() => expect(screen.getByText('src')).toBeInTheDocument())
    const tree = screen.getByRole('tree')
    fireEvent.focus(tree)
    fireEvent.keyDown(tree, { key: 'ArrowRight' }) // expand src
    await waitFor(() => expect(screen.getByText('index.ts')).toBeInTheDocument())
    fireEvent.keyDown(tree, { key: 'ArrowLeft' }) // collapse src
    await waitFor(() => {
      expect(screen.queryByText('index.ts')).not.toBeInTheDocument()
    })
  })

  it('Space activates like Enter (toggles folder)', async () => {
    render(<FileTree projectPath="/proj" rootPath="/proj" />)
    await waitFor(() => expect(screen.getByText('src')).toBeInTheDocument())
    const tree = screen.getByRole('tree')
    fireEvent.focus(tree)
    // active starts on src
    fireEvent.keyDown(tree, { key: ' ' })
    await waitFor(() => expect(screen.getByText('index.ts')).toBeInTheDocument())
  })
})
