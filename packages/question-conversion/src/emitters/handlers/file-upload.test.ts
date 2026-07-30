import { assert, describe, it } from 'vitest';

import { fileUploadHandler } from './file-upload.js';

describe('fileUploadHandler.renderHtml', () => {
  it('uses wildcard pattern when no extensions specified', () => {
    const html = fileUploadHandler.renderHtml({ type: 'file-upload' });
    assert.equal(html, '<pl-file-upload file-patterns="*"></pl-file-upload>');
  });

  it('uses wildcard pattern when allowedExtensions is empty', () => {
    const html = fileUploadHandler.renderHtml({ type: 'file-upload', allowedExtensions: [] });
    assert.equal(html, '<pl-file-upload file-patterns="*"></pl-file-upload>');
  });

  it('generates glob patterns for each allowed extension', () => {
    const html = fileUploadHandler.renderHtml({
      type: 'file-upload',
      allowedExtensions: ['pdf', 'docx'],
    });
    assert.include(html, 'file-patterns="*.pdf,*.docx"');
  });

  it('handles single extension', () => {
    const html = fileUploadHandler.renderHtml({
      type: 'file-upload',
      allowedExtensions: ['py'],
    });
    assert.include(html, 'file-patterns="*.py"');
  });
});
