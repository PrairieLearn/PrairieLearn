import { assert, describe, it } from 'vitest';

import {
  ModifiableQuestionFilePathSchema,
  QuestionRelativeDirectorySchema,
  QuestionRelativeFilePathSchema,
} from './paths.js';

describe('draft question file path schemas', () => {
  describe('QuestionRelativeFilePathSchema', () => {
    it('trims and normalizes relative file paths', () => {
      assert.equal(
        QuestionRelativeFilePathSchema.parse('clientFilesQuestion/../server.py'),
        'server.py',
      );
      assert.equal(
        QuestionRelativeFilePathSchema.parse(' ./clientFilesQuestion/data.txt '),
        'clientFilesQuestion/data.txt',
      );
    });

    it('rejects paths outside the question directory', () => {
      for (const value of [
        '',
        '../infoCourse.json',
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
      assert.equal(QuestionRelativeDirectorySchema.parse('clientFilesQuestion/../tests'), 'tests');
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
});
