import { assert, describe, it } from 'vitest';

import { getFastSyncStrategy } from './index.js';

describe('isFastSyncPossible', () => {
  it('handles no changes', () => {
    assert.isNull(getFastSyncStrategy([]));
  });

  describe('question changes', () => {
    it('handles question JSON change', () => {
      const strategy = getFastSyncStrategy(['questions/foo/info.json']);
      assert.equal(strategy?.type, 'Question');
      assert.equal(strategy?.pathPrefix, 'questions/foo/info.json');
    });

    it('handles change to single file from a question', () => {
      const strategy = getFastSyncStrategy(['questions/foo/server.py']);
      assert.equal(strategy?.type, 'Question');
      assert.equal(strategy?.pathPrefix, 'questions/foo/server.py');
    });

    it('handles changes to multiple files from the same question', () => {
      const strategy = getFastSyncStrategy([
        'questions/foo/server.py',
        'questions/foo/question.html',
      ]);
      assert.equal(strategy?.type, 'Question');
      assert.equal(strategy?.pathPrefix, 'questions/foo');
    });

    it('handles changes to files from multiple questions', () => {
      assert.isNull(getFastSyncStrategy(['questions/foo/server.py', 'questions/bar/server.py']));
    });

    it('handles changes to both question and non-question files', () => {
      assert.isNull(getFastSyncStrategy(['questions/foo/server.py', 'infoCourse.json']));
    });
  });
});
