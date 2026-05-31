/**
 * Trim an insertion-ordered Map down to at most `capacity` entries by
 * removing the oldest keys. JavaScript Maps preserve insertion order, so
 * `keys().next().value` is the least-recently-inserted entry.
 *
 * Used as a cheap LRU eviction primitive after a `set()` that may have
 * pushed the map past its cap. Pass `onEvict` to run cleanup against the
 * evicted value (e.g. close a watcher, dispose a handle).
 *
 * Returns the number of entries evicted.
 */
export function evictOldestFromMap<K, V>(
  map: Map<K, V>,
  capacity: number,
  onEvict?: (key: K, value: V) => void,
): number {
  let evicted = 0
  while (map.size > capacity) {
    const iter = map.keys().next()
    if (iter.done) break
    const key = iter.value
    const value = map.get(key)
    map.delete(key)
    if (onEvict && value !== undefined) onEvict(key, value)
    evicted++
  }
  return evicted
}
