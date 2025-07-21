import { assert, describe, test } from 'vitest';

import { getFastSyncStrategy } from './index.js';

describe('isFastSyncPossible', () => {
  describe('question changes', () => {
    test('handles question JSON change', () => {
      const strategy = getFastSyncStrategy(['questions/foo/info.json']);
      assert.equal(strategy?.type, 'QuestionJson');
      assert.equal(strategy?.pathPrefix, 'questions/foo/info.json');
    });

    test('handles change to single file from a question', () => {
      const strategy = getFastSyncStrategy(['questions/foo/server.py']);
      assert.equal(strategy?.type, 'QuestionFiles');
      assert.equal(strategy?.pathPrefix, 'questions/foo/server.py');
    });

    test('handles changes to multiple files from the same question', () => {
      const strategy = getFastSyncStrategy([
        'questions/foo/server.py',
        'questions/foo/question.html',
      ]);
      assert.equal(strategy?.type, 'QuestionFiles');
      assert.equal(strategy?.pathPrefix, 'questions/foo');
    });

    test('handles changes to files from multiple questions', () => {
      assert.isNull(getFastSyncStrategy(['questions/foo/server.py', 'questions/bar/server.py']));
    });

    test('handles changes to both question and non-question files', () => {
      assert.isNull(getFastSyncStrategy(['questions/foo/server.py', 'infoCourse.json']));
    });
  });
});
