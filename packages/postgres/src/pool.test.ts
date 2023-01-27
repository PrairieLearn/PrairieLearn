import { assert } from 'chai';
import * as pgPool from './pool';

/**
 * Returns true if the property on `PostgresPool` should be considered
 * hidden - that is, if it should be available on the module's exports.
 */
function isHiddenProperty(property: string) {
  switch (property) {
    case 'pool':
    case 'alsClient':
    case 'searchSchema':
      return true;
    default:
      return false;
  }
}

describe('sqldb', () => {
  it('exports the full PostgresPool interface', () => {
    const pool = new pgPool.PostgresPool();

    Object.getOwnPropertyNames(pool)
      .filter((n) => !isHiddenProperty(n))
      .forEach((prop) => {
        assert.property(pgPool, prop);
        assert.ok((pgPool as any)[prop]);
      });

    Object.getOwnPropertyNames(Object.getPrototypeOf(pool)).forEach((prop) => {
      assert.property(pgPool, prop);
      assert.ok((pgPool as any)[prop]);
    });
  });

  it('should not have extra properties', () => {
    const pool = new pgPool.PostgresPool();

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
