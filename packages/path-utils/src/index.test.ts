import { assert } from 'chai';

import { contains, isContainedRelativePath } from './index.js';

describe('File paths', () => {
  describe('contains function', () => {
    it('works with valid absolute paths', async () => {
      assert.ok(contains('/PrairieLearn', '/PrairieLearn/tests'));
      assert.ok(contains('/', '/PrairieLearn/tests'));
      assert.ok(contains('/PrairieLearn', '/PrairieLearn/exampleCourse/questions'));
      assert.ok(contains('/PrairieLearn/exampleCourse', '/PrairieLearn/exampleCourse/questions'));
    });

    it('works with valid absolute over relative paths', async () => {
      assert.ok(contains('/PrairieLearn', 'tests'));
      assert.ok(contains('/PrairieLearn', 'exampleCourse/questions'));
      assert.ok(contains('/PrairieLearn/exampleCourse', 'questions'));
    });

    it('works with absolute paths that are not contained', async () => {
      assert.notOk(contains('/PrairieLearn', '/tmp'));
      assert.notOk(contains('/PrairieLearn/exampleCourse', '/PrairieLearn/tests'));
      assert.notOk(
        contains('/PrairieLearn/exampleCourse/questions', '/PrairieLearn/exampleCourse'),
      );
    });

    it('works with same path', async () => {
      assert.ok(contains('/PrairieLearn', '/PrairieLearn'));
      assert.ok(contains('/PrairieLearn', '/PrairieLearn/.'));
      assert.ok(contains('/tmp', '/tmp'));
      assert.notOk(contains('/PrairieLearn', '/PrairieLearn', false));
      assert.notOk(contains('/PrairieLearn', '/PrairieLearn/.', false));
      assert.notOk(contains('/tmp', '/tmp', false));
    });

    it('works with paths using .. that are outside parent', async () => {
      assert.notOk(contains('/PrairieLearn', '/PrairieLearn/..'));
      assert.notOk(contains('/PrairieLearn', '/PrairieLearn/../etc'));
      assert.notOk(contains('/PrairieLearn', '/PrairieLearn/tests/../../etc'));
      assert.notOk(contains('/PrairieLearn', '../etc'));
      assert.notOk(contains('/PrairieLearn', 'tests/../../etc'));
      assert.notOk(contains('/PrairieLearn', '/PrairieLearn/tests/..', false));
      assert.notOk(contains('/PrairieLearn', 'tests/..', false));
    });

    it('works with paths using .. that are still inside parent', async () => {
      assert.ok(contains('/PrairieLearn', '/PrairieLearn/tests/../exampleCourse'));
      assert.ok(contains('/PrairieLearn', '/PrairieLearn/tests/..'));
      assert.ok(contains('/PrairieLearn', 'tests/../exampleCourse'));
      assert.ok(contains('/PrairieLearn', 'tests/..'));
    });
  });

  describe('isContainedRelativePath function', () => {
    it('works if path is contained', async () => {
      assert.ok(isContainedRelativePath('PrairieLearn'));
      assert.ok(isContainedRelativePath('PrairieLearn/../etc'));
      assert.ok(isContainedRelativePath('PrairieLearn/..'));
    });

    it('works if path is not contained', async () => {
      assert.notOk(isContainedRelativePath('PrairieLearn/..', false));
      assert.notOk(isContainedRelativePath('/PrairieLearn'));
      assert.notOk(isContainedRelativePath('../PrairieLearn'));
      assert.notOk(isContainedRelativePath('PrairieLearn/../../etc'));
    });
  });
});
