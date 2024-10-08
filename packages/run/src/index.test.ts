import { assert } from 'chai';

import { run } from './index.js';

describe('run', () => {
  it('runs a function', () => {
    const result = run(() => 1);
    assert.equal(result, 1);
  });

  it('runs an async function', async () => {
    const result = await run(async () => 1);
    assert.equal(result, 1);
  });
});
