import { assert, describe, it } from 'vitest';

import {
  ModifiableQuestionFilePathSchema,
  OptionalSelectedDirectorySchema,
  OptionalSelectedFilePathSchema,
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

  describe('OptionalSelectedFilePathSchema', () => {
    it('returns null when no file is selected', () => {
      assert.isNull(OptionalSelectedFilePathSchema.parse(undefined));
      assert.isNull(OptionalSelectedFilePathSchema.parse(null));
    });

    it('returns null for malformed input rather than throwing', () => {
      assert.isNull(OptionalSelectedFilePathSchema.parse(['question.html']));
      assert.isNull(OptionalSelectedFilePathSchema.parse('../escape.txt'));
    });

    it('normalizes a valid selected file path', () => {
      assert.equal(OptionalSelectedFilePathSchema.parse('tests/../question.html'), 'question.html');
    });
  });

  describe('OptionalSelectedDirectorySchema', () => {
    it('returns null for the question root or malformed input', () => {
      assert.isNull(OptionalSelectedDirectorySchema.parse(undefined));
      assert.isNull(OptionalSelectedDirectorySchema.parse(''));
      assert.isNull(OptionalSelectedDirectorySchema.parse(['tests']));
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
