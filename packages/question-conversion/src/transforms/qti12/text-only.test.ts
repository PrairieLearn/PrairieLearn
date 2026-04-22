import { assert, describe, it } from 'vitest';

import type { QTI12ParsedItem } from '../../types/qti12.js';

import { textOnlyHandler } from './text-only.js';

describe('textOnlyHandler', () => {
  it('produces text-only body', () => {
    const item: QTI12ParsedItem = {
      ident: 'q1',
      title: 'Read this',
      questionType: 'text_only_question',
      promptHtml: '<p>Some instructions</p>',
      responseLids: [],
      responseStrs: [],
      correctConditions: [],
      feedbacks: new Map(),
      metadata: {},
    };
    const result = textOnlyHandler.transform(item);
    assert.equal(result.body.type, 'text-only');
  });
});
