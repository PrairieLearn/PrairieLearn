import { assert, describe, it } from 'vitest';

import type { QTI12ParsedItem } from '../../types/qti12.js';

import { multipleAnswersHandler } from './multiple-answers.js';

function makeItem(): QTI12ParsedItem {
  return {
    ident: 'q1',
    title: 'Checkbox Question',
    questionType: 'multiple_answers_question',
    promptHtml: '<p>Select all that apply</p>',
    responseLids: [
      {
        ident: 'response1',
        rcardinality: 'Multiple',
        labels: [
          { ident: 'a1', text: 'Correct A', textType: 'text/plain' },
          { ident: 'a2', text: 'Correct B', textType: 'text/plain' },
          { ident: 'a3', text: 'Wrong C', textType: 'text/plain' },
        ],
      },
    ],
    responseStrs: [],
    correctConditions: [
      { responseIdent: 'response1', correctLabelIdent: 'a1' },
      { responseIdent: 'response1', correctLabelIdent: 'a2' },
      { responseIdent: 'response1', correctLabelIdent: 'a3', negate: true },
    ],
    feedbacks: new Map(),
    metadata: {},
  };
}

describe('multipleAnswersHandler', () => {
  it('produces checkbox body', () => {
    const result = multipleAnswersHandler.transform(makeItem());
    assert.equal(result.body.type, 'checkbox');
  });

  it('throws when no response_lid', () => {
    const item = makeItem();
    item.responseLids = [];
    assert.throws(() => multipleAnswersHandler.transform(item), /no response_lid/);
  });

  it('marks correct and incorrect choices', () => {
    const result = multipleAnswersHandler.transform(makeItem());
    if (result.body.type !== 'checkbox') {
      assert.fail(`Expected matching body, got ${result.body.type}`);
    }
    assert.isTrue(result.body.choices[0].correct);
    assert.isTrue(result.body.choices[1].correct);
    assert.isFalse(result.body.choices[2].correct);
  });
});
