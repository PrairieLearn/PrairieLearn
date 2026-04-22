import { assert, describe, it } from 'vitest';

import type { QTI12ParsedItem } from '../../types/qti12.js';

import { fillInBlanksHandler } from './fill-in-blanks.js';

function makeItem(): QTI12ParsedItem {
  return {
    ident: 'q1',
    title: 'Capitals',
    questionType: 'fill_in_multiple_blanks_question',
    promptHtml: '<p>Name the capitals of [capital1] and [capital2]</p>',
    responseLids: [
      {
        ident: 'response_capital1',
        rcardinality: 'Single',
        materialText: 'capital1',
        labels: [{ ident: '7591', text: 'bogota', textType: 'text/plain' }],
      },
      {
        ident: 'response_capital2',
        rcardinality: 'Single',
        materialText: 'capital2',
        labels: [{ ident: '2344', text: 'riyadh', textType: 'text/plain' }],
      },
    ],
    responseStrs: [],
    correctConditions: [
      { responseIdent: 'response_capital1', correctLabelIdent: '7591' },
      { responseIdent: 'response_capital2', correctLabelIdent: '2344' },
    ],
    feedbacks: new Map(),
    metadata: {},
  };
}

describe('fillInBlanksHandler', () => {
  it('produces fill-in-blanks body', () => {
    const result = fillInBlanksHandler.transform(makeItem());
    assert.equal(result.body.type, 'fill-in-blanks');
  });

  it('extracts blanks with correct answers', () => {
    const result = fillInBlanksHandler.transform(makeItem());
    if (result.body.type !== 'fill-in-blanks') {
      assert.fail(`Expected fill-in-blanks body, got ${result.body.type}`);
    }
    assert.equal(result.body.blanks.length, 2);
    assert.equal(result.body.blanks[0].id, 'capital1');
    assert.equal(result.body.blanks[0].correctText, 'bogota');
    assert.equal(result.body.blanks[1].id, 'capital2');
    assert.equal(result.body.blanks[1].correctText, 'riyadh');
  });

  it('uses empty string when correct label has no matching text', () => {
    const item = makeItem();
    // Point the correct condition to a non-existent label ident
    item.correctConditions[0] = {
      responseIdent: 'response_capital1',
      correctLabelIdent: 'NOTFOUND',
    };
    const result = fillInBlanksHandler.transform(item);
    if (result.body.type !== 'fill-in-blanks') {
      assert.fail(`Expected fill-in-blanks body, got ${result.body.type}`);
    }
    assert.equal(result.body.blanks[0].correctText, '');
  });

  it('sets ignoreCase to true', () => {
    const result = fillInBlanksHandler.transform(makeItem());
    if (result.body.type !== 'fill-in-blanks') {
      assert.fail(`Expected fill-in-blanks body, got ${result.body.type}`);
    }
    assert.isTrue(result.body.blanks[0].ignoreCase);
  });
});
