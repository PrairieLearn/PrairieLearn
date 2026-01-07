import parsePostgresInterval from 'postgres-interval';
import { assert, describe, it } from 'vitest';

import {
  ArrayFromCheckboxSchema,
  ArrayFromStringOrArraySchema,
  BooleanFromCheckboxSchema,
  DatetimeLocalStringSchema,
  IdSchema,
  IntegerFromStringOrEmptySchema,
  IntervalSchema,
  UniqueUidsFromStringSchema,
} from './index.js';

describe('BooleanFromCheckboxSchema', () => {
  it('parses a checked checkbox', () => {
    const result = BooleanFromCheckboxSchema.parse('on');
    assert.isTrue(result);
  });
  it('parses an unchecked checkbox', () => {
    const result = BooleanFromCheckboxSchema.parse(undefined);
    assert.isFalse(result);
  });
  it('parses a checkbox with an empty string', () => {
    const result = BooleanFromCheckboxSchema.parse('');
    assert.isFalse(result);
  });
  it('parses a checkbox with a non-empty string', () => {
    const result = BooleanFromCheckboxSchema.parse('checked');
    assert.isTrue(result);
  });
});

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

describe('DatetimeLocalStringSchema', () => {
  it('parses a valid datetime-local string without seconds', () => {
    const result = DatetimeLocalStringSchema.parse('2024-01-15T14:30');
    assert.equal(result, '2024-01-15T14:30:00');
  });

  it('parses a valid datetime-local string with seconds', () => {
    const result = DatetimeLocalStringSchema.parse('2024-01-15T14:30:45');
    assert.equal(result, '2024-01-15T14:30:45');
  });

  it('rejects an invalid format (missing time)', () => {
    const result = DatetimeLocalStringSchema.safeParse('2024-01-15');
    assert.isFalse(result.success);
  });

  it('rejects an invalid format (ISO with timezone)', () => {
    const result = DatetimeLocalStringSchema.safeParse('2024-01-15T14:30:00Z');
    assert.isFalse(result.success);
  });

  it('rejects an empty string', () => {
    const result = DatetimeLocalStringSchema.safeParse('');
    assert.isFalse(result.success);
  });

  it('rejects an invalid date', () => {
    const result = DatetimeLocalStringSchema.safeParse('2024-13-45T25:99');
    assert.isFalse(result.success);
  });
});

describe('IntegerFromStringOrEmptySchema', () => {
  it('parses a valid integer string', () => {
    const result = IntegerFromStringOrEmptySchema.parse('123');
    assert.equal(result, 123);
  });

  it('parses an empty string as null', () => {
    const result = IntegerFromStringOrEmptySchema.parse('');
    assert.equal(result, null);
  });

  it('rejects a non-integer string', () => {
    const result = IntegerFromStringOrEmptySchema.safeParse('abc');
    assert.isFalse(result.success);
  });

  it('rejects a decimal string', () => {
    const result = IntegerFromStringOrEmptySchema.safeParse('123.45');
    assert.isFalse(result.success);
  });
});

describe('ArrayFromStringOrArraySchema', () => {
  it('parses a string to an array', () => {
    const result = ArrayFromStringOrArraySchema.parse('a');
    assert.deepEqual(result, ['a']);
  });

  it('parses an array to itself', () => {
    const result = ArrayFromStringOrArraySchema.parse(['a', 'b', 'c']);
    assert.deepEqual(result, ['a', 'b', 'c']);
  });

  it('rejects an integer', () => {
    const result = ArrayFromStringOrArraySchema.safeParse(123);
    assert.isFalse(result.success);
  });

  it('rejects an object', () => {
    const result = ArrayFromStringOrArraySchema.safeParse({ a: 1 });
    assert.isFalse(result.success);
  });
});

describe('ArrayFromCheckboxSchema', () => {
  it('parses a missing value', () => {
    const result = ArrayFromCheckboxSchema.parse(undefined);
    assert.deepEqual(result, []);
  });

  it('parses a single string value', () => {
    const result = ArrayFromCheckboxSchema.parse('a');
    assert.deepEqual(result, ['a']);
  });

  it('parses an array of strings', () => {
    const result = ArrayFromCheckboxSchema.parse(['a', 'b', 'c']);
    assert.deepEqual(result, ['a', 'b', 'c']);
  });
});

describe('UniqueUidsFromStringSchema', () => {
  it('parses a single UID', () => {
    const result = UniqueUidsFromStringSchema(10).parse('user@example.com');
    assert.deepEqual(result, ['user@example.com']);
  });

  it('parses UIDs with mixed separators', () => {
    const result = UniqueUidsFromStringSchema(10).parse(
      'user1@example.com, user2@example.com; user3@example.com',
    );
    assert.deepEqual(result, ['user1@example.com', 'user2@example.com', 'user3@example.com']);
  });

  it('deduplicates UIDs', () => {
    const result = UniqueUidsFromStringSchema(10).parse(
      'user@example.com, user@example.com, user@example.com',
    );
    assert.deepEqual(result, ['user@example.com']);
  });

  it('trims whitespace from UIDs', () => {
    const result = UniqueUidsFromStringSchema(10).parse(
      '  user1@example.com  ,  user2@example.com  ',
    );
    assert.deepEqual(result, ['user1@example.com', 'user2@example.com']);
  });

  it('rejects when UIDs exceed limit', () => {
    const result = UniqueUidsFromStringSchema(2).safeParse('a@b.com, b@c.com, c@d.com');
    assert.isFalse(result.success);
    if (!result.success) {
      assert.include(result.error.issues[0].message, 'Cannot provide more than 2 UIDs');
    }
  });

  it('rejects invalid email addresses', () => {
    const result = UniqueUidsFromStringSchema(10).safeParse('invalid-email');
    assert.isFalse(result.success);
    if (!result.success) {
      assert.include(result.error.issues[0].message, 'Invalid UID format: invalid-email');
    }
  });

  it('rejects when any email in list is invalid', () => {
    const result = UniqueUidsFromStringSchema(10).safeParse(
      'user@example.com, not-an-email, not-an-email-2',
    );
    assert.isFalse(result.success);
    if (!result.success) {
      assert.include(result.error.issues[0].message, 'Invalid UID format: not-an-email');
      assert.include(result.error.issues[1].message, 'Invalid UID format: not-an-email-2');
    }
  });
});
