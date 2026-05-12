export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}
