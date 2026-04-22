import { assert, describe, it } from 'vitest';

import type { QTI12ParsedItem } from '../../types/qti12.js';

import { multipleDropdownsHandler } from './multiple-dropdowns.js';

function makeItem(overrides: Partial<QTI12ParsedItem> = {}): QTI12ParsedItem {
  return {
    ident: 'q1',
    title: 'Dropdown Question',
    questionType: 'multiple_dropdowns_question',
    promptHtml: '<p>The [color] ball rolled [direction].</p>',
    responseLids: [
      {
        ident: 'response_color',
        rcardinality: 'Single',
        materialText: 'color',
        labels: [
          { ident: 'c1', text: 'red', textType: 'text/plain' },
          { ident: 'c2', text: 'blue', textType: 'text/plain' },
          { ident: 'c3', text: 'green', textType: 'text/plain' },
        ],
      },
      {
        ident: 'response_direction',
        rcardinality: 'Single',
        materialText: 'direction',
        labels: [
          { ident: 'd1', text: 'left', textType: 'text/plain' },
          { ident: 'd2', text: 'right', textType: 'text/plain' },
        ],
      },
    ],
    responseStrs: [],
    correctConditions: [
      { responseIdent: 'response_color', correctLabelIdent: 'c1' },
      { responseIdent: 'response_direction', correctLabelIdent: 'd2' },
    ],
    feedbacks: new Map(),
    metadata: {},
    ...overrides,
  };
}

describe('multipleDropdownsHandler', () => {
  it('produces multiple-dropdowns body', () => {
    const result = multipleDropdownsHandler.transform(makeItem());
    assert.equal(result.body.type, 'multiple-dropdowns');
  });

  it('creates one blank per response_lid using materialText as the id', () => {
    const result = multipleDropdownsHandler.transform(makeItem());
    if (result.body.type !== 'multiple-dropdowns') {
      assert.fail(`Expected multiple-dropdowns body, got ${result.body.type}`);
    }
    assert.equal(result.body.blanks.length, 2);
    assert.equal(result.body.blanks[0].id, 'color');
    assert.equal(result.body.blanks[1].id, 'direction');
  });

  it('marks exactly one choice as correct per blank', () => {
    const result = multipleDropdownsHandler.transform(makeItem());
    if (result.body.type !== 'multiple-dropdowns') {
      assert.fail(`Expected multiple-dropdowns body, got ${result.body.type}`);
    }
    const [colorBlank, dirBlank] = result.body.blanks;
    assert.equal(colorBlank.choices.filter((c) => c.correct).length, 1);
    assert.equal(colorBlank.choices.find((c) => c.correct)?.html, 'red');
    assert.equal(dirBlank.choices.filter((c) => c.correct).length, 1);
    assert.equal(dirBlank.choices.find((c) => c.correct)?.html, 'right');
  });

  it('includes all choices for each blank', () => {
    const result = multipleDropdownsHandler.transform(makeItem());
    if (result.body.type !== 'multiple-dropdowns') {
      assert.fail(`Expected multiple-dropdowns body, got ${result.body.type}`);
    }
    assert.equal(result.body.blanks[0].choices.length, 3);
    assert.equal(result.body.blanks[1].choices.length, 2);
  });

  it('falls back to lid ident when materialText is absent', () => {
    const item = makeItem();
    item.responseLids[0] = { ...item.responseLids[0], materialText: undefined };
    const result = multipleDropdownsHandler.transform(item);
    if (result.body.type !== 'multiple-dropdowns') {
      assert.fail(`Expected multiple-dropdowns body, got ${result.body.type}`);
    }
    assert.equal(result.body.blanks[0].id, 'response_color');
  });
});
