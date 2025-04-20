import { assert } from 'chai';

import { formatQueryWithErrorPosition } from './error.js';

describe('formatQueryWithErrorPosition', () => {
  it('formats a query', () => {
    const formattedQuery = formatQueryWithErrorPosition('SELECT\n  foo bar baz\nFROM table;', 18);
    assert.equal(
      formattedQuery,
      'SELECT\n  foo bar baz\n          ^\n          |\n          + ERROR POSITION SHOWN ABOVE\n\nFROM table;',
    );
  });
});
