import { assert, describe, it } from 'vitest';

import type { QTI12ParsedItem } from '../../types/qti12.js';

import { essayHandler } from './essay.js';

describe('essayHandler', () => {
  it('produces rich-text body with manual grading', () => {
    const item: QTI12ParsedItem = {
      ident: 'q1',
      title: 'Essay',
      questionType: 'essay_question',
      promptHtml: '<p>Write an essay</p>',
      responseLids: [],
      responseStrs: [],
      correctConditions: [],
      feedbacks: new Map(),
      metadata: {},
    };
    const result = essayHandler.transform(item);
    assert.equal(result.body.type, 'rich-text');
    if (result.body.type === 'rich-text') {
      assert.equal(result.body.gradingMethod, 'Manual');
    }
  });
});
