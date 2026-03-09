type ThemeListener = (themeId: string) => void

const listeners = new Set<ThemeListener>()
let observer: MutationObserver | null = null

function ensureObserver(): void {
  if (observer) return
  observer = new MutationObserver(() => {
    const t = document.documentElement.dataset.theme ?? ''
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
