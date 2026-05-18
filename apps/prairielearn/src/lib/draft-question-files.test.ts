import { assert, describe, it } from 'vitest';

import * as error from '@prairielearn/error';

import {
  getEditorUrlWithSelectedDirectory,
  getEditorUrlWithSelectedFile,
} from './draft-question-file-url.js';
import {
  assertCanModifyDraftQuestionFilePath,
  getSelectedQuestionDirectory,
  getSelectedQuestionFilePath,
  normalizeQuestionFilePath,
} from './draft-question-files.js';

describe('selected question file helpers', () => {
  describe('normalizeQuestionFilePath', () => {
    it('normalizes relative file paths', () => {
      assert.equal(normalizeQuestionFilePath('clientFilesQuestion/../server.py'), 'server.py');
      assert.equal(
        normalizeQuestionFilePath(' ./clientFilesQuestion/data.txt '),
        'clientFilesQuestion/data.txt',
      );
    });

    it('rejects paths outside the question directory', () => {
      assert.throws(() => normalizeQuestionFilePath(''), error.HttpStatusError);
      assert.throws(() => normalizeQuestionFilePath('../infoCourse.json'), error.HttpStatusError);
      assert.throws(() => normalizeQuestionFilePath('/tmp/file.txt'), error.HttpStatusError);
      assert.throws(() => normalizeQuestionFilePath('client\\file.txt'), error.HttpStatusError);
      assert.throws(() => normalizeQuestionFilePath('client\0file.txt'), error.HttpStatusError);
    });
  });

  describe('getSelectedQuestionFilePath', () => {
    it('returns null when no file is selected', () => {
      assert.isNull(getSelectedQuestionFilePath(undefined));
      assert.isNull(getSelectedQuestionFilePath(null));
    });

    it('rejects repeated file query parameters', () => {
      assert.throws(() => getSelectedQuestionFilePath(['question.html']), error.HttpStatusError);
    });
  });

  describe('getSelectedQuestionDirectory', () => {
    it('returns null for the question root', () => {
      assert.isNull(getSelectedQuestionDirectory(undefined));
      assert.isNull(getSelectedQuestionDirectory(null));
      assert.isNull(getSelectedQuestionDirectory(''));
      assert.isNull(getSelectedQuestionDirectory('.'));
    });

    it('normalizes selected directories', () => {
      assert.equal(getSelectedQuestionDirectory('clientFilesQuestion/../tests'), 'tests');
    });

    it('rejects repeated directory query parameters', () => {
      assert.throws(() => getSelectedQuestionDirectory(['tests']), error.HttpStatusError);
    });
  });

  describe('embedded editor URLs', () => {
    it('builds selected file URLs', () => {
      assert.equal(
        getEditorUrlWithSelectedFile({
          editorUrl: '/pl/course/1/ai_generate_editor/2',
          filePath: 'clientFilesQuestion/data set.csv',
        }),
        '/pl/course/1/ai_generate_editor/2?file=clientFilesQuestion%2Fdata+set.csv&tab=all-files',
      );
    });

    it('builds selected directory URLs', () => {
      assert.equal(
        getEditorUrlWithSelectedDirectory({
          editorUrl: '/pl/course/1/ai_generate_editor/2',
          directory: 'clientFilesQuestion/assets',
        }),
        '/pl/course/1/ai_generate_editor/2?tab=all-files&dir=clientFilesQuestion%2Fassets',
      );
    });

    it('omits the directory parameter for the question root', () => {
      assert.equal(
        getEditorUrlWithSelectedDirectory({
          editorUrl: '/pl/course/1/ai_generate_editor/2',
          directory: null,
        }),
        '/pl/course/1/ai_generate_editor/2?tab=all-files',
      );
    });
  });

  describe('assertCanModifyDraftQuestionFilePath', () => {
    const course = { path: '/course' };

    it('rejects direct modifications to draft question info.json', () => {
      assert.throws(
        () =>
          assertCanModifyDraftQuestionFilePath({
            course,
            question: { draft: true, qid: 'draft-question' },
            fullPath: '/course/questions/draft-question/info.json',
          }),
        error.HttpStatusError,
      );
    });

    it('allows non-metadata files and finalized question metadata', () => {
      assert.doesNotThrow(() =>
        assertCanModifyDraftQuestionFilePath({
          course,
          question: { draft: true, qid: 'draft-question' },
          fullPath: '/course/questions/draft-question/question.html',
        }),
      );
      assert.doesNotThrow(() =>
        assertCanModifyDraftQuestionFilePath({
          course,
          question: { draft: false, qid: 'final-question' },
          fullPath: '/course/questions/final-question/info.json',
        }),
      );
    });
  });
});
