import { assert, describe, it } from 'vitest';

import type { QTI12ParsedItem } from '../../types/qti12.js';

import { multipleChoiceHandler } from './multiple-choice.js';

function makeItem(overrides: Partial<QTI12ParsedItem> = {}): QTI12ParsedItem {
  return {
    ident: 'q1',
    title: 'Test Question',
    questionType: 'multiple_choice_question',
    promptHtml: '<p>Pick one</p>',
    responseLids: [
      {
        ident: 'response1',
        rcardinality: 'Single',
        labels: [
          { ident: 'a1', text: 'Option A', textType: 'text/plain' },
          { ident: 'a2', text: 'Option B', textType: 'text/plain' },
          { ident: 'a3', text: 'Option C', textType: 'text/plain' },
        ],
      },
    ],
    responseStrs: [],
    correctConditions: [{ responseIdent: 'response1', correctLabelIdent: 'a2' }],
    feedbacks: new Map(),
    metadata: {},
    ...overrides,
  };
}

describe('multipleChoiceHandler', () => {
  it('produces multiple-choice body with correct answer marked', () => {
    const result = multipleChoiceHandler.transform(makeItem());
    assert.equal(result.body.type, 'multiple-choice');
    if (result.body.type !== 'multiple-choice') {
      assert.fail(`Expected multiple-choice body, got ${result.body.type}`);
    }
    assert.equal(result.body.choices.length, 3);
    assert.isFalse(result.body.choices[0].correct);
    assert.isTrue(result.body.choices[1].correct);
    assert.isFalse(result.body.choices[2].correct);
  });

  it('preserves choice text', () => {
    const result = multipleChoiceHandler.transform(makeItem());
    if (result.body.type !== 'multiple-choice') {
      assert.fail(`Expected multiple-choice body, got ${result.body.type}`);
    }
    assert.equal(result.body.choices[0].html, 'Option A');
  });

  it('throws on missing response_lid', () => {
    assert.throws(
      () => multipleChoiceHandler.transform(makeItem({ responseLids: [] })),
      /no response_lid/,
    );
  });
});
