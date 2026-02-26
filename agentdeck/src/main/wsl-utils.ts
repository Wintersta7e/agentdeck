import { execFileSync } from 'child_process'

export function wslPathToWindows(wslPath: string, distro = 'Ubuntu-24.04'): string {
  return `\\\\wsl$\\${distro}\\${wslPath.replace(/\//g, '\\')}`
}

export function getDefaultDistro(): string {
  try {
    const output = execFileSync('wsl.exe', ['-l', '--quiet'], { encoding: 'utf16le' })
    const first = output
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)[0]
    return first ?? 'Ubuntu-24.04'
  } catch {
    return 'Ubuntu-24.04'
  }
}
