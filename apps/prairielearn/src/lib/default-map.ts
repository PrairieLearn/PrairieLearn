/**
 * A data structure that mirrors Python's `defaultdict`. When `getOrCreate(...)`
 * is called with a key that does not exist, a new value is created using
 * the provided factory function, stored in the map, and returned.
 */
export class DefaultMap<K, V> extends Map<K, V> {
  constructor(private readonly factory: () => V) {
    super();
  }

  getOrCreate(key: K): V {
    if (!this.has(key)) {
      this.set(key, this.factory());
    }
    // Non-null assertion because we just ensured presence
    return super.get(key)!;
  }

  map<T>(fn: (key: K, value: V, map: Map<K, V>) => T): T[] {
    return Array.from(this.entries()).map(([k, v]) => fn(k, v, this));
  }
}
