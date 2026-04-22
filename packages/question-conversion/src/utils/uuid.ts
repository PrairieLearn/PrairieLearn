import { v5 as uuidv5 } from 'uuid';

const NAMESPACE = 'ba8a2d84-9b41-4aec-9eca-13cdabe2f2ce'; // UUID NAMESPACE_URL

/**
 * Generate a deterministic UUID v5 from source identifiers.
 * Produces the same UUID for the same inputs across runs.
 */
export function stableUuid(sourceId: string, ...parts: string[]): string {
  const seed = JSON.stringify([sourceId, ...parts]);
  return uuidv5(seed, NAMESPACE);
}
