import { assert } from 'chai';
import parsePostgresInterval = require('postgres-interval');

import { IdSchema, IntervalSchema } from './db-types';

describe('IdSchema', () => {
  it('parses a valid id', () => {
    const id = IdSchema.parse('123');
    assert.equal(id, '123');
  });

  it('parses a nullable id', () => {
    const id = IdSchema.nullable().parse(null);
    assert.equal(id, null);
  });

  it('parses an optional id', () => {
    const id = IdSchema.optional().parse(undefined);
    assert.equal(id, undefined);
  });

  it('rejects a negative ID', () => {
    const result = IdSchema.safeParse('-1');
    assert.isFalse(result.success);
  });

  it('rejects a non-numeric ID', () => {
    const result = IdSchema.safeParse('abc');
    assert.isFalse(result.success);
  });
});

describe('IntervalSchema', () => {
  it('handles a PostgresInterval object', () => {
    const interval = IntervalSchema.parse(parsePostgresInterval('1 year 2 months 3 days'));
    assert.equal(interval, 37000800000);
  });

  it('parses an interval with date', () => {
    const interval = IntervalSchema.parse('1 year 2 months 3 days');
    assert.equal(interval, 37000800000);
  });

  it('parses an interval with time', () => {
    const interval = IntervalSchema.parse('04:05:06.7');
    assert.equal(interval, 14706700);
  });

  it('parses an interval with microsecond-precision time', () => {
    const interval = IntervalSchema.parse('01:02:03.456789');
    assert.equal(interval, 3723456.789);
  });

  it('parses a complex interval', () => {
    const interval = IntervalSchema.parse('1 years 2 mons 3 days 04:05:06.789');
    assert.equal(interval, 37015506789);
  });

  it('parses interval with negative months', () => {
    const interval = IntervalSchema.parse('-10 mons 3 days 04:05:06.789');
    assert.equal(interval, -25646093211);
  });

  it('parses interval with negative years and months', () => {
    const interval = IntervalSchema.parse('-1 years -2 months 3 days 04:05:06.789');
    assert.equal(interval, -36467693211);
  });

  it('parses interval with negative years, months, and days', () => {
    const interval = IntervalSchema.parse('-1 years -2 months -3 days 04:05:06.789');
    assert.equal(interval, -36986093211);
  });

  it('parses a negative interval', () => {
    const interval = IntervalSchema.parse('-1 years -2 months -3 days -04:05:06.789');
    assert.equal(interval, -37015506789);
  });
});
