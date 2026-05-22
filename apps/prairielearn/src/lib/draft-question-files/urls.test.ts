import { assert, describe, it } from 'vitest';

import { getEditorUrlWithSelectedDirectory, getEditorUrlWithSelectedFile } from './urls.js';

describe('draft editor URLs', () => {
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
