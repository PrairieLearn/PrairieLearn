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
    // The callback function can modify the map via the `this` parameter.
    // Materialize the entries into an array before mapping to avoid issues with
    // mutation during iteration.
    // eslint-disable-next-line unicorn/prefer-array-from-map
    return Array.from(this.entries()).map(([k, v]) => fn(k, v, this));
  }
}
