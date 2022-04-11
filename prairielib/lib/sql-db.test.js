/* eslint-env jest */
const sqldb = require('./sql-db');

/**
 * Returns true if the property on `PostgresPool` should be considered
 * hidden - that is, if it should be available on the module's exports.
 */
function isHiddenProperty(property) {
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
    const pool = new sqldb.PostgresPool();

    Object.getOwnPropertyNames(pool)
      .filter((n) => !isHiddenProperty(n))
      .forEach((prop) => {
        expect(sqldb).toHaveProperty(prop);
        expect(sqldb[prop]).toBeDefined();
      });

    Object.getOwnPropertyNames(Object.getPrototypeOf(pool)).forEach((prop) => {
      expect(sqldb).toHaveProperty(prop);
      expect(sqldb[prop]).toBeDefined();
    });
  });

  it('should not have extra properties', () => {
    const pool = new sqldb.PostgresPool();

    const knownProperties = [
      ...Object.getOwnPropertyNames(pool),
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(pool)),
      'PostgresPool',
    ];

    Object.getOwnPropertyNames(pool).forEach((prop) => {
      expect(knownProperties).toContain(prop);
    });
  });
});
