type ThemeListener = (themeId: string) => void

const listeners = new Set<ThemeListener>()
let observer: MutationObserver | null = null

// PERF-15: Cache accent RGB so getXtermTheme can read it without getComputedStyle
let cachedAccentRgb = ''
export function getCachedAccentRgb(): string {
  return cachedAccentRgb
}

function ensureObserver(): void {
  if (observer) return
  observer = new MutationObserver(() => {
    const t = document.documentElement.dataset.theme ?? ''
    // PERF-15: Update accent cache after theme change settles
    requestAnimationFrame(() => {
      cachedAccentRgb = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent-rgb')
        .trim()
    })
    for (const fn of listeners) fn(t)
  })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
}

export function subscribeTheme(fn: ThemeListener): () => void {
  listeners.add(fn)
  ensureObserver()
  return () => {
    listeners.delete(fn)
    if (listeners.size === 0 && observer) {
      observer.disconnect()
      observer = null
    }
  }
}
