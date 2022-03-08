/* eslint-env jest */
const sqldb = require('./sql-db');

describe('sqldb', () => {
  it('exports the full PostgresPool interface', () => {
    const pool = new sqldb.PostgresPool();

    Object.getOwnPropertyNames(pool).forEach((prop) => {
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
