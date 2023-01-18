const filePaths = require('../lib/file-paths');
const assert = require('chai').assert;

describe('File paths', () => {
  describe('parentContainsChild function', () => {
    it('works with valid absolute paths', async () => {
      assert.ok(filePaths.parentContainsChild('/PrairieLearn', '/PrairieLearn/tests'));
      assert.ok(filePaths.parentContainsChild('/', '/PrairieLearn/tests'));
      assert.ok(
        filePaths.parentContainsChild('/PrairieLearn', '/PrairieLearn/exampleCourse/questions')
      );
      assert.ok(
        filePaths.parentContainsChild(
          '/PrairieLearn/exampleCourse',
          '/PrairieLearn/exampleCourse/questions'
        )
      );
    });

    it('works with valid relative paths', async () => {
      assert.ok(filePaths.parentContainsChild('PrairieLearn', 'PrairieLearn/tests'));
      assert.ok(
        filePaths.parentContainsChild('PrairieLearn', 'PrairieLearn/exampleCourse/questions')
      );
      assert.ok(
        filePaths.parentContainsChild(
          'PrairieLearn/exampleCourse',
          'PrairieLearn/exampleCourse/questions'
        )
      );
    });

    it('works with valid absolute over relative paths', async () => {
      assert.ok(filePaths.parentContainsChild('/PrairieLearn', 'tests'));
      assert.ok(filePaths.parentContainsChild('/PrairieLearn', 'exampleCourse/questions'));
      assert.ok(
        filePaths.parentContainsChild('/PrairieLearn/exampleCourse', 'exampleCourse/questions')
      );
    });

    it('works with absolute paths that are not contained', async () => {
      assert.notOk(filePaths.parentContainsChild('/PrairieLearn', '/tmp'));
      assert.notOk(
        filePaths.parentContainsChild('/PrairieLearn/exampleCourse', '/PrairieLearn/tests')
      );
      assert.notOk(
        filePaths.parentContainsChild(
          '/PrairieLearn/exampleCourse/questions',
          '/PrairieLearn/exampleCourse'
        )
      );
    });

    it('works with relative paths that are not contained', async () => {
      assert.notOk(filePaths.parentContainsChild('PrairieLearn', '/PrairieLearn/tests'));
      assert.notOk(filePaths.parentContainsChild('PrairieLearn', 'tmp'));
    });

    it('works with same path', async () => {
      assert.ok(filePaths.parentContainsChild('/PrairieLearn', '/PrairieLearn'));
      assert.ok(filePaths.parentContainsChild('/PrairieLearn', '/PrairieLearn/.'));
      assert.ok(filePaths.parentContainsChild('/tmp', '/tmp'));
      assert.notOk(filePaths.parentContainsChild('/PrairieLearn', '/PrairieLearn', false));
      assert.notOk(filePaths.parentContainsChild('/PrairieLearn', '/PrairieLearn/.', false));
      assert.notOk(filePaths.parentContainsChild('/tmp', '/tmp', false));
    });

    it('works with paths using .. that are outside parent', async () => {
      assert.notOk(filePaths.parentContainsChild('/PrairieLearn', '/PrairieLearn/..'));
      assert.notOk(filePaths.parentContainsChild('/PrairieLearn', '/PrairieLearn/../etc'));
      assert.notOk(filePaths.parentContainsChild('/PrairieLearn', '/PrairieLearn/tests/../../etc'));
      assert.notOk(filePaths.parentContainsChild('/PrairieLearn', '../etc'));
      assert.notOk(filePaths.parentContainsChild('/PrairieLearn', '/PrairieLearn/tests/..', false));
    });

    it('works with paths using .. that are still inside parent', async () => {
      assert.ok(
        filePaths.parentContainsChild('/PrairieLearn', '/PrairieLearn/tests/../exampleCourse')
      );
      assert.ok(filePaths.parentContainsChild('/PrairieLearn', '/PrairieLearn/tests/..'));
    });
  });
});
