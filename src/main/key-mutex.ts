/**
 * Creates a per-key async mutex.
 *
 * Operations submitted with the same key run strictly in submission order;
 * operations on different keys run independently. A rejected operation does
 * not block the next one for its key (each op runs regardless of how the
 * previous one settled). The internal chain for a key is dropped once it
 * settles, so the backing map never grows unbounded.
 *
 * Use a single constant key when a store needs one global write lock
 * (e.g. serializing all mutations of one JSON file).
 */
export function createKeyMutex(): <T>(key: string, fn: () => T | PromiseLike<T>) => Promise<T> {
  const chains = new Map<string, Promise<unknown>>()
  return function serialize<T>(key: string, fn: () => T | PromiseLike<T>): Promise<T> {
    const prev = chains.get(key) ?? Promise.resolve()
    const next = prev.then(
      () => fn(),
      () => fn(),
    )
    chains.set(key, next as Promise<unknown>)
    return next.finally(() => {
      if (chains.get(key) === next) chains.delete(key)
    }) as Promise<T>
  }
}
