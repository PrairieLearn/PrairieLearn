import { assert, describe, it } from 'vitest';

import { getEditorUrlWithSelectedDirectory, getEditorUrlWithSelectedFile } from './urls.js';

describe('draft editor URLs', () => {
  it('builds selected file URLs', () => {
    assert.equal(
      getEditorUrlWithSelectedFile({
        editorUrl: '/pl/course/1/ai_generate_editor/2',
        filePath: 'clientFilesQuestion/data set.csv',
        search: '',
      }),
      '/pl/course/1/ai_generate_editor/2?file=clientFilesQuestion%2Fdata+set.csv&tab=all-files',
    );
  });

  it('builds selected directory URLs', () => {
    assert.equal(
      getEditorUrlWithSelectedDirectory({
        editorUrl: '/pl/course/1/ai_generate_editor/2',
        directory: 'clientFilesQuestion/assets',
        search: '',
      }),
      '/pl/course/1/ai_generate_editor/2?tab=all-files&dir=clientFilesQuestion%2Fassets',
    );
  });

  it('omits the directory parameter for the question root', () => {
    assert.equal(
      getEditorUrlWithSelectedDirectory({
        editorUrl: '/pl/course/1/ai_generate_editor/2',
        directory: null,
        search: '',
      }),
      '/pl/course/1/ai_generate_editor/2?tab=all-files',
    );
  });

  it('preserves unrelated query params when selecting a file', () => {
    assert.equal(
      getEditorUrlWithSelectedFile({
        editorUrl: '/pl/course/1/ai_generate_editor/2',
        filePath: 'server.py',
        search: '?variant_id=5&tab=preview',
      }),
      '/pl/course/1/ai_generate_editor/2?variant_id=5&tab=all-files&file=server.py',
    );
  });

  it('preserves unrelated query params and drops the file param when selecting a directory', () => {
    assert.equal(
      getEditorUrlWithSelectedDirectory({
        editorUrl: '/pl/course/1/ai_generate_editor/2',
        directory: 'tests',
        search: '?variant_id=5&file=server.py',
      }),
      '/pl/course/1/ai_generate_editor/2?variant_id=5&tab=all-files&dir=tests',
    );
  });
});
