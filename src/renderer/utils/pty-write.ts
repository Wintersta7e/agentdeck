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
        // The logger IPC can itself reject (logger disk full, main-side
        // crash). Last-resort swallow here: the original !ok info is
        // already captured in the send args, and re-logging a failed log
        // has no useful recipient.
        window.agentDeck.log
          .send('warn', 'pty-write', 'pty.write returned !ok', {
            sessionId,
            error: result.error,
          })
          .catch(() => {
            /* logger itself failed; nothing more we can do */
          })
      }
    })
    .catch((err: unknown) => {
      // Inside the terminal .catch there is no outer handler — a bare
      // `void log.send(...)` would become an unhandledRejection if the
      // logger IPC rejects. Swallow the logger's own error.
      window.agentDeck.log
        .send('error', 'pty-write', 'pty.write promise rejected', {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        })
        .catch(() => {
          /* logger itself failed; nothing more we can do */
        })
    })
}
