import { assert, describe, it } from 'vitest';

import type { QTI12ParsedItem } from '../../types/qti12.js';

import { trueFalseHandler } from './true-false.js';

function makeItem(correctIdent: string): QTI12ParsedItem {
  return {
    ident: 'q1',
    title: 'TF Question',
    questionType: 'true_false_question',
    promptHtml: '<p>Is the sky blue?</p>',
    responseLids: [
      {
        ident: 'response1',
        rcardinality: 'Single',
        labels: [
          { ident: 'true1', text: 'True', textType: 'text/plain' },
          { ident: 'false1', text: 'False', textType: 'text/plain' },
        ],
      },
    ],
    responseStrs: [],
    correctConditions: [{ responseIdent: 'response1', correctLabelIdent: correctIdent }],
    feedbacks: new Map(),
    metadata: {},
  };
}

describe('trueFalseHandler', () => {
  it('marks True as correct when True is the answer', () => {
    const result = trueFalseHandler.transform(makeItem('true1'));
    if (result.body.type !== 'multiple-choice') {
      assert.fail(`Expected multiple-choice body, got ${result.body.type}`);
    }
    assert.isTrue(result.body.choices[0].correct);
    assert.isFalse(result.body.choices[1].correct);
  });

  it('marks False as correct when False is the answer', () => {
    const result = trueFalseHandler.transform(makeItem('false1'));
    if (result.body.type !== 'multiple-choice') {
      assert.fail(`Expected multiple-choice body, got ${result.body.type}`);
    }
    assert.isFalse(result.body.choices[0].correct);
    assert.isTrue(result.body.choices[1].correct);
  });

  it('throws when no response_lid', () => {
    const item = makeItem('true1');
    item.responseLids = [];
    assert.throws(() => trueFalseHandler.transform(item), /no response_lid/);
  });

  it('throws when True/False labels are missing', () => {
    const item = makeItem('x');
    item.responseLids[0].labels = [
      { ident: 'a', text: 'Yes', textType: 'text/plain' },
      { ident: 'b', text: 'No', textType: 'text/plain' },
    ];
    assert.throws(() => trueFalseHandler.transform(item), /missing True\/False/);
  });

  it('always orders True before False', () => {
    const result = trueFalseHandler.transform(makeItem('true1'));
    if (result.body.type !== 'multiple-choice') {
      assert.fail(`Expected multiple-choice body, got ${result.body.type}`);
    }
    assert.equal(result.body.choices[0].html, 'True');
    assert.equal(result.body.choices[1].html, 'False');
  });
});
