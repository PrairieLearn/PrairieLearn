import { assert, describe, it } from 'vitest';

import type { QTI12ParsedItem } from '../../types/qti12.js';

import { matchingHandler } from './matching.js';

function makeItem(): QTI12ParsedItem {
  return {
    ident: 'q1',
    title: 'Matching',
    questionType: 'matching_question',
    promptHtml: '<p>Match terms</p>',
    responseLids: [
      {
        ident: 'response_1',
        rcardinality: 'Single',
        materialText: 'Big O',
        labels: [
          { ident: 'opt1', text: 'Upper Bound', textType: 'text/plain' },
          { ident: 'opt2', text: 'Lower Bound', textType: 'text/plain' },
          { ident: 'opt3', text: 'Tight Bound', textType: 'text/plain' },
        ],
      },
      {
        ident: 'response_2',
        rcardinality: 'Single',
        materialText: 'Big Theta',
        labels: [
          { ident: 'opt1', text: 'Upper Bound', textType: 'text/plain' },
          { ident: 'opt2', text: 'Lower Bound', textType: 'text/plain' },
          { ident: 'opt3', text: 'Tight Bound', textType: 'text/plain' },
        ],
      },
    ],
    responseStrs: [],
    correctConditions: [
      { responseIdent: 'response_1', correctLabelIdent: 'opt1' },
      { responseIdent: 'response_2', correctLabelIdent: 'opt3' },
    ],
    feedbacks: new Map(),
    metadata: {},
  };
}

describe('matchingHandler', () => {
  it('produces matching body with pairs', () => {
    const result = matchingHandler.transform(makeItem());
    assert.equal(result.body.type, 'matching');
    if (result.body.type !== 'matching') {
      assert.fail(`Expected matching body, got ${result.body.type}`);
    }

    assert.equal(result.body.pairs.length, 2);
    assert.equal(result.body.pairs[0].statementHtml, 'Big O');
    assert.equal(result.body.pairs[0].optionHtml, 'Upper Bound');
    assert.equal(result.body.pairs[1].statementHtml, 'Big Theta');
    assert.equal(result.body.pairs[1].optionHtml, 'Tight Bound');
  });

  it('uses empty optionHtml when a statement has no matching correct condition', () => {
    const item = makeItem();
    // Remove the correct condition for the first statement
    item.correctConditions = [{ responseIdent: 'response_2', correctLabelIdent: 'opt3' }];
    const result = matchingHandler.transform(item);
    if (result.body.type !== 'matching') {
      assert.fail(`Expected matching body, got ${result.body.type}`);
    }
    assert.equal(result.body.pairs[0].optionHtml, '');
  });

  it('identifies distractors', () => {
    const result = matchingHandler.transform(makeItem());
    if (result.body.type !== 'matching') {
      assert.fail(`Expected matching body, got ${result.body.type}`);
    }

    assert.equal(result.body.distractors.length, 1);
    assert.equal(result.body.distractors[0].optionHtml, 'Lower Bound');
  });
});
