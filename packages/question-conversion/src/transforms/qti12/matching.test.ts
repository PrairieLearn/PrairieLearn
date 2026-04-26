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

  it('uses empty optionHtml and warns when a statement has no matching correct condition', () => {
    const item = makeItem();
    const unmatchedStatement = item.responseLids[0].materialText!;
    // Keep only the second statement's correct condition
    item.correctConditions = [{ responseIdent: 'response_2', correctLabelIdent: 'opt3' }];
    const result = matchingHandler.transform(item);
    if (result.body.type !== 'matching') {
      assert.fail(`Expected matching body, got ${result.body.type}`);
    }
    assert.equal(result.body.pairs[0].optionHtml, '');
    assert.lengthOf(result.warnings!, 1);
    assert.include(result.warnings![0], unmatchedStatement);
    assert.match(result.warnings![0], /has no correct match/);
  });

  it('marks the question Manual-graded when no statement has a correct match', () => {
    const item = makeItem();
    item.correctConditions = [];
    const result = matchingHandler.transform(item);
    assert.equal(result.gradingMethod, 'Manual');
    assert.isArray(result.warnings);
    assert.isTrue(result.warnings!.some((w) => /manually-graded/.test(w)));
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
