export function showFatalInitError(err: unknown): void {
  const root = document.getElementById('root')
  if (!root) return

  const heading = document.createElement('h2')
  heading.textContent = 'Failed to initialize AgentDeck'
  const pre = document.createElement('pre')
  pre.textContent = String(err)
  root.style.cssText = 'color:#e05c5c;padding:32px;font-family:monospace'
  root.appendChild(heading)
  root.appendChild(pre)
}
