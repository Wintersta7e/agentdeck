import { execFileSync } from 'child_process'

export function wslPathToWindows(wslPath: string, distro = 'Ubuntu-24.04'): string {
  // /mnt/X/... paths map directly to Windows drives — no UNC needed
  const mntMatch = wslPath.match(/^\/mnt\/([a-zA-Z])\/(.*)$/)
  if (mntMatch && mntMatch[1] && mntMatch[2] !== undefined) {
    const drive = mntMatch[1].toUpperCase()
    const rest = mntMatch[2].replace(/\//g, '\\')
    return `${drive}:\\${rest}`
  }
  // Other WSL paths (e.g. /home/...) → \\wsl.localhost\distro\path
  if (!/^[A-Za-z0-9_. -]+$/.test(distro)) {
    throw new Error(`Invalid WSL distro name: ${distro}`)
  }
  return `\\\\wsl.localhost\\${distro}${wslPath.replace(/\//g, '\\')}`
}

export function getDefaultDistro(): string {
  try {
    const output = execFileSync('wsl.exe', ['-l', '--quiet'], { encoding: 'utf16le' })
    const first = output
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)[0]
    if (!first) {
      console.warn('wsl-utils: wsl.exe returned no distros, falling back to Ubuntu-24.04')
    }
    return first ?? 'Ubuntu-24.04'
  } catch (err) {
    console.error('wsl-utils: failed to detect WSL distro, falling back to Ubuntu-24.04', err)
    return 'Ubuntu-24.04'
  }
}
