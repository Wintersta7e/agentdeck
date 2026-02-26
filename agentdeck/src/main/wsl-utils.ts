import { execFileSync } from 'child_process'

export function wslPathToWindows(wslPath: string, distro = 'Ubuntu-24.04'): string {
  if (!/^[A-Za-z0-9_. -]+$/.test(distro)) {
    throw new Error(`Invalid WSL distro name: ${distro}`)
  }
  return `\\\\wsl.localhost\\${distro}\\${wslPath.replace(/\//g, '\\')}`
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
