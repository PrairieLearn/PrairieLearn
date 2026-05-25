import { assert, describe, it } from 'vitest';

import { getEditorUrlForSelection } from './urls.js';

describe('getEditorUrlForSelection', () => {
  it('builds file URLs', () => {
    assert.equal(
      getEditorUrlForSelection({
        editorUrl: '/pl/course/1/ai_generate_editor/2',
        selection: { kind: 'file', path: 'clientFilesQuestion/data set.csv' },
        search: '',
      }),
      '/pl/course/1/ai_generate_editor/2?tab=all-files&selection=file%3AclientFilesQuestion%2Fdata+set.csv',
    );
  });

  it('builds directory URLs', () => {
    assert.equal(
      getEditorUrlForSelection({
        editorUrl: '/pl/course/1/ai_generate_editor/2',
        selection: { kind: 'dir', path: 'clientFilesQuestion/assets' },
        search: '',
      }),
      '/pl/course/1/ai_generate_editor/2?tab=all-files&selection=dir%3AclientFilesQuestion%2Fassets',
    );
  });

  it('omits the selection parameter for the question root', () => {
    assert.equal(
      getEditorUrlForSelection({
        editorUrl: '/pl/course/1/ai_generate_editor/2',
        selection: { kind: 'dir', path: null },
        search: '',
      }),
      '/pl/course/1/ai_generate_editor/2?tab=all-files',
    );
  });

  it('preserves unrelated query params when selecting a file', () => {
    assert.equal(
      getEditorUrlForSelection({
        editorUrl: '/pl/course/1/ai_generate_editor/2',
        selection: { kind: 'file', path: 'clientFilesQuestion/data.csv' },
        search: '?variant_id=5&tab=preview',
      }),
      '/pl/course/1/ai_generate_editor/2?variant_id=5&tab=all-files&selection=file%3AclientFilesQuestion%2Fdata.csv',
    );
  });

  it('routes question.html and server.py to the Files tab with no selection', () => {
    assert.equal(
      getEditorUrlForSelection({
        editorUrl: '/pl/course/1/ai_generate_editor/2',
        selection: { kind: 'file', path: 'question.html' },
        search: '?variant_id=5&selection=file%3Atests%2Ffoo.html&tab=all-files',
      }),
      '/pl/course/1/ai_generate_editor/2?variant_id=5&tab=files',
    );
    assert.equal(
      getEditorUrlForSelection({
        editorUrl: '/pl/course/1/ai_generate_editor/2',
        selection: { kind: 'file', path: 'server.py' },
        search: '',
      }),
      '/pl/course/1/ai_generate_editor/2?tab=files',
    );
  });

  it('replaces a stale selection param when selecting a directory', () => {
    assert.equal(
      getEditorUrlForSelection({
        editorUrl: '/pl/course/1/ai_generate_editor/2',
        selection: { kind: 'dir', path: 'tests' },
        search: '?variant_id=5&selection=file%3Aserver.py',
      }),
      '/pl/course/1/ai_generate_editor/2?variant_id=5&tab=all-files&selection=dir%3Atests',
    );
  });
});
