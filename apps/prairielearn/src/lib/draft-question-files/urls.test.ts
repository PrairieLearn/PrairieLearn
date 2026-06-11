import { assert, describe, it } from 'vitest';

import { getDraftQuestionFileUrls, resolveSelectionNavigation } from './urls.js';

describe('resolveSelectionNavigation', () => {
  it('routes files and directories to the All files tab', () => {
    assert.deepEqual(
      resolveSelectionNavigation({ kind: 'file', path: 'clientFilesQuestion/data.csv' }),
      { tab: 'all-files', selection: { kind: 'file', path: 'clientFilesQuestion/data.csv' } },
    );
    assert.deepEqual(resolveSelectionNavigation({ kind: 'dir', path: 'tests' }), {
      tab: 'all-files',
      selection: { kind: 'dir', path: 'tests' },
    });
    assert.deepEqual(resolveSelectionNavigation({ kind: 'dir', path: null }), {
      tab: 'all-files',
      selection: { kind: 'dir', path: null },
    });
  });

  it('routes question.html and server.py to the Files tab with the selection cleared', () => {
    assert.deepEqual(resolveSelectionNavigation({ kind: 'file', path: 'question.html' }), {
      tab: 'files',
      selection: { kind: 'dir', path: null },
    });
    assert.deepEqual(resolveSelectionNavigation({ kind: 'file', path: 'server.py' }), {
      tab: 'files',
      selection: { kind: 'dir', path: null },
    });
  });

  it('does not special-case nested files with reserved names', () => {
    assert.deepEqual(resolveSelectionNavigation({ kind: 'file', path: 'tests/server.py' }), {
      tab: 'all-files',
      selection: { kind: 'file', path: 'tests/server.py' },
    });
  });
});

describe('getDraftQuestionFileUrls', () => {
  it('builds question-scoped file URLs', () => {
    assert.deepEqual(
      getDraftQuestionFileUrls({
        urlPrefix: '/pl/course/1',
        questionId: '2',
        qid: '__drafts__/draft_3',
        filePath: 'notes.txt',
      }),
      {
        downloadUrl:
          '/pl/course/1/question/2/file_download/questions/__drafts__/draft_3/notes.txt?attachment=notes.txt',
        fileViewUrl: '/pl/course/1/question/2/file_view/questions/__drafts__/draft_3/notes.txt',
        imageUrl: '/pl/course/1/question/2/file_download/questions/__drafts__/draft_3/notes.txt',
        pdfUrl:
          '/pl/course/1/question/2/file_download/questions/__drafts__/draft_3/notes.txt?type=application/pdf#view=FitH',
      },
    );
  });

  it('percent-encodes path segments without encoding slashes', () => {
    const { downloadUrl } = getDraftQuestionFileUrls({
      urlPrefix: '/pl/course/1',
      questionId: '2',
      qid: 'q1',
      filePath: 'clientFilesQuestion/data set.csv',
    });
    assert.equal(
      downloadUrl,
      '/pl/course/1/question/2/file_download/questions/q1/clientFilesQuestion/data%20set.csv?attachment=data%20set.csv',
    );
  });
});
