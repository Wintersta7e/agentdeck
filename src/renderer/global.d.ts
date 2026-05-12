import type { AgentDeckBridge } from '../shared/bridge'

declare global {
  interface Window {
    agentDeck: AgentDeckBridge
  }
}

interface ViewTransition {
  finished: Promise<void>
  ready: Promise<void>
  updateCallbackDone: Promise<void>
}

interface StartViewTransitionOptions {
  update: () => void
  types?: string[]
}

interface Document {
  startViewTransition?: (
    callbackOrOptions: (() => void) | StartViewTransitionOptions,
  ) => ViewTransition
}

declare module '*.css'
