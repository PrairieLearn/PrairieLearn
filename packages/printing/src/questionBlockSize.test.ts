import { assert, describe, it } from 'vitest';

import { QUESTION_BLOCK_SIZES } from './questionBlockSize.js';

describe('QUESTION_BLOCK_SIZES', () => {
  it('contains the supported automatic and fixed question sizes', () => {
    assert.deepEqual(QUESTION_BLOCK_SIZES, ['auto', 'third', 'half', 'full']);
  });
});
