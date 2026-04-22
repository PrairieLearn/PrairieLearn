import { assert, describe, it } from 'vitest';

import type { QTI12ParsedItem } from '../../types/qti12.js';

import { fileUploadHandler } from './file-upload.js';

const baseItem: QTI12ParsedItem = {
  ident: 'q1',
  title: 'Upload Question',
  questionType: 'file_upload_question',
  promptHtml: '<p>Upload your work.</p>',
  responseLids: [],
  responseStrs: [],
  correctConditions: [],
  feedbacks: new Map(),
  metadata: {},
};

describe('fileUploadHandler', () => {
  it('produces file-upload body', () => {
    const result = fileUploadHandler.transform(baseItem);
    assert.equal(result.body.type, 'file-upload');
  });
});
