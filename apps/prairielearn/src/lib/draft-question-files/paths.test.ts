import { assert, describe, it } from 'vitest';

import {
  ModifiableQuestionFilePathSchema,
  QuestionRelativeDirectorySchema,
  QuestionRelativeFilePathSchema,
} from './paths.js';
import { QUESTION_FILE_NAME_PATTERN } from './paths.shared.js';

describe('draft question file path schemas', () => {
  describe('QuestionRelativeFilePathSchema', () => {
    it('trims and normalizes relative file paths', () => {
      assert.equal(
        QuestionRelativeFilePathSchema.parse(' ./clientFilesQuestion/data.txt '),
        'clientFilesQuestion/data.txt',
      );
    });

    it('rejects paths outside the question directory or containing `..`', () => {
      for (const value of [
        '',
        '../infoCourse.json',
        'clientFilesQuestion/../server.py',
        '/tmp/file.txt',
        'client\\file.txt',
        'client\0file.txt',
      ]) {
        assert.isFalse(QuestionRelativeFilePathSchema.safeParse(value).success);
      }
    });
  });

  describe('QuestionRelativeDirectorySchema', () => {
    it('treats the question root as null', () => {
      assert.isNull(QuestionRelativeDirectorySchema.parse(''));
      assert.isNull(QuestionRelativeDirectorySchema.parse('.'));
    });

    it('normalizes selected directories', () => {
      assert.equal(QuestionRelativeDirectorySchema.parse(' ./tests '), 'tests');
    });

    it('rejects directories containing `..`', () => {
      assert.isFalse(
        QuestionRelativeDirectorySchema.safeParse('clientFilesQuestion/../tests').success,
      );
    });
  });

  describe('ModifiableQuestionFilePathSchema', () => {
    it('rejects modifications to draft question info.json', () => {
      assert.isFalse(ModifiableQuestionFilePathSchema.safeParse('info.json').success);
    });

    it('allows non-metadata files', () => {
      assert.equal(ModifiableQuestionFilePathSchema.parse('question.html'), 'question.html');
      assert.equal(
        ModifiableQuestionFilePathSchema.parse('clientFilesQuestion/info.json'),
        'clientFilesQuestion/info.json',
      );
    });
  });

  describe('QUESTION_FILE_NAME_PATTERN', () => {
    it.each([
      'server.py',
      'question.html',
      'clientFilesQuestion/data.csv',
      'tests/test_1.py',
      'data',
    ])('accepts %s', (value) => {
      assert.isTrue(QUESTION_FILE_NAME_PATTERN.test(value));
    });

    // The draft editor keeps files inside the question directory, so `..` must be
    // rejected to stay consistent with `ModifiableQuestionFilePathSchema`.
    it.each([
      '',
      '..',
      '../escape.py',
      'foo/../bar.py',
      'foo/..',
      '.hidden',
      'my file.py',
      '/server.py',
    ])('rejects %s', (value) => {
      assert.isFalse(QUESTION_FILE_NAME_PATTERN.test(value));
    });
  });
});
