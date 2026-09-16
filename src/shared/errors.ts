/**
 * Render an `unknown` caught value as log text.
 *
 * `String(err)` is wrong for the object case — a rejected plain object logs as
 * "[object Object]", which is exactly the detail the log existed to capture.
 * Use this wherever the caught value is still `unknown`; once it is narrowed to
 * an Error, `err.message` is enough on its own.
 */
export function errText(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null) {
    try {
      // Declared `string`, but stringify returns undefined when a toJSON()
      // hands back undefined.
      const json = JSON.stringify(err) as string | undefined
      return json ?? '[unserializable]'
    } catch {
      return '[unserializable]'
    }
  }
  return String(err)
}
