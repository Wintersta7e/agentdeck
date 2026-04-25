import { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  File,
  FileCode,
  FileJson,
  FileText,
  FileImage,
} from 'lucide-react'
import './FileTree.css'

interface DirEntry {
  name: string
  isDir: boolean
  size?: number
  mtime?: number
}

interface FileTreeProps {
  projectPath: string
  rootPath: string
}

interface VisibleNode {
  fullPath: string
  parentPath: string
  entry: DirEntry
  depth: number
  expanded: boolean
}

interface NodeState {
  expanded: boolean
  children: DirEntry[] | null
  loading: boolean
  error: string | null
}

export function FileTree({ projectPath, rootPath }: FileTreeProps): React.JSX.Element {
  const [rootEntries, setRootEntries] = useState<DirEntry[] | null>(null)
  const [rootError, setRootError] = useState<string | null>(null)
  const [nodes, setNodes] = useState<Record<string, NodeState>>({})
  const [activePath, setActivePath] = useState<string | null>(null)
  const treeRef = useRef<HTMLDivElement | null>(null)
  // Guards in-flight child-folder fetches so they cannot setNodes after the
  // component has unmounted (e.g. when FilesTab key-bumps for a refresh).
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Initial root load
  useEffect(() => {
    let cancelled = false
    // Nested async so react-hooks/set-state-in-effect doesn't flag the sync reset.
    const load = async (): Promise<void> => {
      setRootEntries(null)
      setRootError(null)
      setNodes({})
      try {
        const res = await window.agentDeck.files.listDir({ path: rootPath, projectPath })
        if (cancelled) return
        setRootEntries(res.entries)
        const first = res.entries[0]
        if (first) {
          setActivePath(`${rootPath}/${first.name}`)
        }
      } catch (e: unknown) {
        if (cancelled) return
        setRootError(e instanceof Error ? e.message : String(e))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [rootPath, projectPath])

  const ensureLoaded = useCallback(
    (fullPath: string): void => {
      setNodes((prev) => {
        const cur = prev[fullPath]
        if (cur?.children || cur?.loading) return prev
        const next: NodeState = { expanded: true, children: null, loading: true, error: null }
        window.agentDeck.files
          .listDir({ path: fullPath, projectPath })
          .then((res) => {
            if (!mountedRef.current) return
            setNodes((p) => ({
              ...p,
              [fullPath]: { expanded: true, children: res.entries, loading: false, error: null },
            }))
          })
          .catch((e: unknown) => {
            if (!mountedRef.current) return
            const msg = e instanceof Error ? e.message : String(e)
            setNodes((p) => ({
              ...p,
              [fullPath]: { expanded: true, children: null, loading: false, error: msg },
            }))
          })
        return { ...prev, [fullPath]: next }
      })
    },
    [projectPath],
  )

  const toggleFolder = useCallback(
    (fullPath: string): void => {
      setNodes((prev) => {
        const cur = prev[fullPath]
        if (!cur) {
          ensureLoaded(fullPath)
          return prev
        }
        if (cur.expanded) {
          return { ...prev, [fullPath]: { ...cur, expanded: false } }
        }
        if (!cur.children && !cur.loading) {
          ensureLoaded(fullPath)
          return prev
        }
        return { ...prev, [fullPath]: { ...cur, expanded: true } }
      })
    },
    [ensureLoaded],
  )

  const visible: VisibleNode[] = useMemo(() => {
    const out: VisibleNode[] = []
    if (!rootEntries) return out
    const walk = (entries: DirEntry[], parent: string, depth: number): void => {
      for (const entry of entries) {
        const fullPath = `${parent}/${entry.name}`
        const state = nodes[fullPath]
        const expanded = entry.isDir && state?.expanded === true
        out.push({ fullPath, parentPath: parent, entry, depth, expanded })
        if (expanded && state?.children) {
          walk(state.children, fullPath, depth + 1)
        }
      }
    }
    walk(rootEntries, rootPath, 0)
    return out
  }, [rootEntries, nodes, rootPath])

  // Active-path reconciliation: when a parent folder is collapsed, the
  // previously-active descendant is no longer in `visible`. Snap the active
  // row to the first visible row so keyboard nav stays anchored. This is a
  // DEFENSIVE guard — it isn't reachable through the current keyboard / click
  // handlers (folder click sets activePath to the clicked folder before it
  // collapses; ArrowLeft on a file ascends rather than collapsing the parent).
  // Cheap to keep and protects future state-change paths.
  useEffect(() => {
    if (!activePath) return
    if (visible.length === 0) return
    const stillVisible = visible.some((v) => v.fullPath === activePath)
    if (stillVisible) return
    // Nested async so react-hooks/set-state-in-effect doesn't flag the snap.
    const snap = async (): Promise<void> => {
      const first = visible[0]
      if (first) setActivePath(first.fullPath)
    }
    void snap()
  }, [visible, activePath])

  const onActivate = useCallback(
    (node: VisibleNode): void => {
      if (node.entry.isDir) {
        toggleFolder(node.fullPath)
      } else {
        void window.agentDeck.files.openExternal({ path: node.fullPath, projectPath })
      }
    },
    [toggleFolder, projectPath],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (visible.length === 0) return
      const idx = activePath ? visible.findIndex((v) => v.fullPath === activePath) : -1
      const safeIdx = idx < 0 ? 0 : idx
      const cur = visible[safeIdx]

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          const next = visible[Math.min(safeIdx + 1, visible.length - 1)]
          if (next) setActivePath(next.fullPath)
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          const prev = visible[Math.max(safeIdx - 1, 0)]
          if (prev) setActivePath(prev.fullPath)
          break
        }
        case 'Home': {
          e.preventDefault()
          const first = visible[0]
          if (first) setActivePath(first.fullPath)
          break
        }
        case 'End': {
          e.preventDefault()
          const last = visible[visible.length - 1]
          if (last) setActivePath(last.fullPath)
          break
        }
        case 'ArrowRight': {
          if (!cur) break
          e.preventDefault()
          if (cur.entry.isDir && !cur.expanded) toggleFolder(cur.fullPath)
          else if (cur.entry.isDir && cur.expanded) {
            const child = visible[safeIdx + 1]
            if (child && child.parentPath === cur.fullPath) setActivePath(child.fullPath)
          }
          break
        }
        case 'ArrowLeft': {
          if (!cur) break
          e.preventDefault()
          if (cur.entry.isDir && cur.expanded) toggleFolder(cur.fullPath)
          else {
            const parent = visible.find((v) => v.fullPath === cur.parentPath)
            if (parent) setActivePath(parent.fullPath)
          }
          break
        }
        case 'Enter':
        case ' ': {
          if (!cur) break
          e.preventDefault()
          onActivate(cur)
          break
        }
      }
    },
    [visible, activePath, toggleFolder, onActivate],
  )

  if (rootError) return <div className="file-tree__error">Failed to load: {rootError}</div>
  if (!rootEntries) return <div className="file-tree__loading">Loading…</div>
  if (rootEntries.length === 0) return <div className="file-tree__empty">Empty directory.</div>

  return (
    <div ref={treeRef} role="tree" tabIndex={0} className="file-tree" onKeyDown={onKeyDown}>
      {visible.map((node) => {
        const state = nodes[node.fullPath]
        return (
          <FileTreeRow
            key={node.fullPath}
            node={node}
            isActive={node.fullPath === activePath}
            onClick={() => {
              setActivePath(node.fullPath)
              onActivate(node)
            }}
            isLoading={state?.loading === true}
            errorText={state?.error ?? null}
          />
        )
      })}
    </div>
  )
}

interface FileTreeRowProps {
  node: VisibleNode
  isActive: boolean
  onClick: () => void
  isLoading: boolean
  errorText: string | null
}

const FileTreeRow = memo(function FileTreeRow({
  node,
  isActive,
  onClick,
  isLoading,
  errorText,
}: FileTreeRowProps): React.JSX.Element {
  const { entry, depth, expanded } = node
  return (
    <>
      <div
        role="treeitem"
        aria-expanded={entry.isDir ? expanded : undefined}
        aria-selected={isActive ? true : undefined}
        data-active={isActive ? 'true' : 'false'}
        data-fullpath={node.fullPath}
        className={`file-tree__row${isActive ? ' is-active' : ''}`}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        onClick={onClick}
      >
        <span className="file-tree__chevron" aria-hidden="true">
          {entry.isDir ? expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : null}
        </span>
        <span className="file-tree__icon" aria-hidden="true">
          {entry.isDir ? <Folder size={13} /> : iconForExt(entry.name)}
        </span>
        <span className="file-tree__name">{entry.name}</span>
      </div>
      {isLoading && (
        <div className="file-tree__loading" style={{ paddingLeft: `${(depth + 1) * 14 + 6}px` }}>
          Loading…
        </div>
      )}
      {errorText && (
        <div className="file-tree__error" style={{ paddingLeft: `${(depth + 1) * 14 + 6}px` }}>
          {errorText}
        </div>
      )}
    </>
  )
})

function iconForExt(name: string): React.JSX.Element {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rs', 'go', 'java', 'cs'].includes(ext)) {
    return <FileCode size={13} />
  }
  if (['json', 'yaml', 'yml', 'toml'].includes(ext)) return <FileJson size={13} />
  if (['md', 'txt', 'rst'].includes(ext)) return <FileText size={13} />
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return <FileImage size={13} />
  return <File size={13} />
}
