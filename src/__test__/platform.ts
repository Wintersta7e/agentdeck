import { beforeEach, afterEach } from 'vitest'

/**
 * Pin `process.platform` for a suite.
 *
 * Command routing is platform-dependent (see `src/main/host.ts`): on Windows
 * everything goes through `wsl.exe`, natively it does not. A suite that asserts
 * one shape has to say which platform it is describing, or it silently passes
 * or fails depending on the machine the tests run on.
 */
export function usePlatform(platform: NodeJS.Platform): void {
  const real = process.platform
  const set = (value: NodeJS.Platform): void => {
    Object.defineProperty(process, 'platform', { value, configurable: true })
  }
  beforeEach(() => {
    set(platform)
  })
  afterEach(() => {
    set(real)
  })
}
