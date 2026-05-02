/**
 * ANSI / terminal escape-sequence stripper. Shared by main-process log
 * adapters (`node-runners.ts`, `pty-manager.ts`, `workflow-history.ts`)
 * and renderer-side terminal helpers.
 *
 * Coverage: CSI parameter sequences, OSC strings (BEL or ESC-`\`-terminated),
 * G0/G1/G2/G3 charset designators, single-char escapes (ESC `=>NOMDEHc78`).
 *
 * `ANSI_ESCAPES_RE` matches escape sequences only — no carriage returns.
 * `stripAnsi(s)` strips both, matching legacy `node-runners` behaviour for
 * log scrapers that compare against rendered text.
 */

export const ANSI_ESCAPES_RE =
  /\x1b\[[0-9;?]*[a-zA-Z~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()#][A-Z0-9]|\x1b[=>NOMDEHc78]/g

export function stripAnsi(s: string): string {
  return s.replace(ANSI_ESCAPES_RE, '').replace(/\r/g, '')
}
