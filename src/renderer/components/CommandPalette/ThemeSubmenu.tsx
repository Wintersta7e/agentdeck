import { useCallback, useEffect, useRef } from 'react'
import { ArrowLeft, Check } from 'lucide-react'

interface ThemeOption {
  id: string
  label: string
  accent: string
}

interface ThemeGroup {
  label: string
  themes: ThemeOption[]
}

interface ThemeSubmenuProps {
  themeGroups: ThemeGroup[]
  allThemes: ThemeOption[]
  currentTheme: string
  selectedIndex: number
  onSelectIndex: (index: number | ((prev: number) => number)) => void
  onSelect: (themeId: string, x?: number, y?: number) => void
  onBack: () => void
  previewOriginalRef: React.RefObject<string>
}

export function ThemeSubmenu({
  themeGroups,
  allThemes,
  currentTheme,
  selectedIndex,
  onSelectIndex,
  onSelect,
  onBack,
  previewOriginalRef,
}: ThemeSubmenuProps): React.JSX.Element {
  const selectedIndexRef = useRef(selectedIndex)
  useEffect(() => {
    selectedIndexRef.current = selectedIndex
  }, [selectedIndex])

  const handleBack = useCallback(() => {
    document.documentElement.dataset.theme = previewOriginalRef.current
    onBack()
  }, [previewOriginalRef, onBack])

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        document.documentElement.dataset.theme = previewOriginalRef.current
        onBack()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        onSelectIndex((prev) => {
          const nextIdx = Math.min(prev + 1, allThemes.length - 1)
          const nextTheme = allThemes[nextIdx]
          if (nextTheme) document.documentElement.dataset.theme = nextTheme.id
          return nextIdx
        })
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        onSelectIndex((prev) => {
          const nextIdx = Math.max(prev - 1, 0)
          const nextTheme = allThemes[nextIdx]
          if (nextTheme) document.documentElement.dataset.theme = nextTheme.id
          return nextIdx
        })
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const selected = allThemes[selectedIndexRef.current]
        if (selected) {
          onSelect(selected.id)
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [allThemes, onBack, onSelect, onSelectIndex, previewOriginalRef])

  return (
    <div className="palette-results">
      <div className="cp-submenu-header">
        <button className="cp-back-btn" onClick={handleBack}>
          <ArrowLeft size={12} /> back
        </button>
        <span>Change theme</span>
      </div>
      {themeGroups.map((group, gi) => {
        const groupOffset = themeGroups.slice(0, gi).reduce((sum, g) => sum + g.themes.length, 0)
        return (
          <div key={group.label} className="cp-theme-group">
            <div className="cp-theme-group-label">{group.label}</div>
            {group.themes.map((t, ti) => {
              const flatIdx = groupOffset + ti
              return (
                <div
                  key={t.id || 'default'}
                  className={`cp-theme-item${selectedIndex === flatIdx ? ' selected' : ''}${currentTheme === t.id ? ' active' : ''}`}
                  onClick={(e) => {
                    onSelect(t.id, e.clientX, e.clientY)
                  }}
                  onMouseEnter={() => {
                    onSelectIndex(flatIdx)
                    document.documentElement.dataset.theme = t.id
                  }}
                >
                  <span className="cp-theme-swatch" style={{ background: t.accent }} />
                  <span className="cp-theme-label">{t.label}</span>
                  {currentTheme === t.id && (
                    <span className="cp-theme-check">
                      <Check size={12} />
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
