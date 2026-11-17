import { describe, expect, it } from 'vitest';

import { pruneRowSelection } from './use-prune-row-selection.js';

describe('pruneRowSelection', () => {
  it('removes selections for rows that are no longer present', () => {
    expect(pruneRowSelection({ first: true, second: true }, new Set(['second']))).toEqual({
      second: true,
    });
  });
});
