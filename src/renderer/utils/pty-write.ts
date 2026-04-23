/**
 * Fire-and-forget wrapper around pty.write that converts the { ok, error }
 * ack into a structured log entry when the write fails, and catches any
 * IPC-transport rejection so no unhandledRejection leaks from call sites
 * that only discarded the result with `void`.
 *
 * Use this for keystroke / paste / onData / filter paths where a per-failure
 * toast would be too noisy. User-initiated paths that want a toast on
 * failure (DiffReviewScreen "Request changes", ContextTab templates)
 * continue to chain `.then/.catch` inline against the raw promise.
 */
export function safeWrite(sessionId: string, data: string): void {
  window.agentDeck.pty
    .write(sessionId, data)
    .then((result) => {
      if (!result.ok) {
        void window.agentDeck.log.send('warn', 'pty-write', 'pty.write returned !ok', {
          sessionId,
          error: result.error,
        })
      }
    })
    .catch((err: unknown) => {
      void window.agentDeck.log.send('error', 'pty-write', 'pty.write promise rejected', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      })
    })
}
