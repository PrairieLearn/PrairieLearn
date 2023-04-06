import { assert } from 'chai';
import { PostgresPool } from './pool';
import * as pgPool from './default-pool';

/**
 * Properties on {@link PostgresPool} that should not be available on the default
 * pool's exports.
 */
const HIDDEN_PROPERTIES = new Set([
  // Private members
  'pool',
  'alsClient',
  'searchSchema',
  '_queryCount',
  'queryValidatedCursorInternal',
  // Getters
  'totalCount',
  'idleCount',
  'waitingCount',
  'queryCount',
]);

describe('sqldb', () => {
  it('exports the full PostgresPool interface', () => {
    const pool = new PostgresPool();

    Object.getOwnPropertyNames(pool)
      .filter((n) => !HIDDEN_PROPERTIES.has(n))
      .forEach((prop) => {
        assert.property(pgPool, prop);
        assert.ok((pgPool as any)[prop]);
      });

    Object.getOwnPropertyNames(Object.getPrototypeOf(pool))
      .filter((n) => !HIDDEN_PROPERTIES.has(n))
      .forEach((prop) => {
        assert.property(pgPool, prop);
        assert.ok((pgPool as any)[prop]);
      });
  });

  it('should not have extra properties', () => {
    const pool = new PostgresPool();

    const knownProperties = [
      ...Object.getOwnPropertyNames(pool),
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(pool)),
      'PostgresPool',
    ];

    Object.getOwnPropertyNames(pool).forEach((prop) => {
      assert.include(knownProperties, prop);
    });
  });
});
