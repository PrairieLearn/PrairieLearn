import { assert, describe, test } from 'vitest';

import { isFastSyncPossible } from './index.js';

describe('isFastSyncPossible', () => {
  describe('question changes', () => {
    test('handles question JSON change', () => {
      assert.isTrue(isFastSyncPossible(['questions/foo/info.json']));
    });

    test('handles change to single file from a question', () => {
      assert.isTrue(isFastSyncPossible(['questions/foo/server.py']));
    });

    test('handles changes to multiple files from the same question', () => {
      assert.isTrue(isFastSyncPossible(['questions/foo/server.py', 'questions/foo/question.html']));
    });

    test('handles changes to files from multiple questions', () => {
      assert.isFalse(isFastSyncPossible(['questions/foo/server.py', 'questions/bar/server.py']));
    });

    test('handles changes to both question and non-question files', () => {
      assert.isFalse(isFastSyncPossible(['questions/foo/server.py', 'infoCourse.json']));
    });
  });
});
