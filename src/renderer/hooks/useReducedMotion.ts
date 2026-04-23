/**
 * Deliberately always returns `false`.
 *
 * AgentDeck's semantic animations (scope sweep, session pulse, mascot,
 * workflow edges, etc.) must not be disabled by OS-level reduced-motion
 * preferences. Windows 11 silently flips `prefers-reduced-motion: reduce`
 * when battery saver / performance mode kicks in, which would leave key
 * status indicators dead (see the v5.1.2 workflow-animation fix + the
 * user's "don't gate the animations" directive on the v6.0 redesign).
 *
 * Kept as a hook shape so existing call sites compile without changes.
 */
export function useReducedMotion(): boolean {
  return false
}
