import { assert, describe, it } from 'vitest';

import type { QTI12ParsedItem } from '../../types/qti12.js';

import { numericalHandler } from './numerical.js';

function makeItem(overrides: Partial<QTI12ParsedItem> = {}): QTI12ParsedItem {
  return {
    ident: 'q1',
    title: 'Numerical Question',
    questionType: 'numerical_question',
    promptHtml: '<p>What is the answer?</p>',
    responseLids: [],
    responseStrs: [],
    correctConditions: [],
    feedbacks: new Map(),
    metadata: {},
    ...overrides,
  };
}

describe('numericalHandler', () => {
  it('parses an exact integer match from varequal as integer type', () => {
    const result = numericalHandler.transform(
      makeItem({
        rawItemEl: {
          resprocessing: {
            respcondition: [
              {
                conditionvar: { varequal: [{ '@_respident': 'response1', '#text': '42' }] },
                setvar: '100',
              },
            ],
          },
        },
      }),
    );
    assert.equal(result.body.type, 'integer');
    if (result.body.type === 'integer') {
      assert.equal(result.body.answer.correctValue, 42);
    }
  });

  it('parses an exact float match from varequal as numeric type', () => {
    const result = numericalHandler.transform(
      makeItem({
        rawItemEl: {
          resprocessing: {
            respcondition: [
              {
                conditionvar: { varequal: [{ '@_respident': 'response1', '#text': '3.14' }] },
                setvar: '100',
              },
            ],
          },
        },
      }),
    );
    assert.equal(result.body.type, 'numeric');
    if (result.body.type === 'numeric') {
      assert.equal(result.body.answer.correctValue, 3.14);
    }
  });

  it('parses a zero-width integer range (Canvas pattern for whole numbers) as integer type', () => {
    const result = numericalHandler.transform(
      makeItem({
        rawItemEl: {
          resprocessing: {
            respcondition: [
              {
                conditionvar: {
                  or: { and: { vargte: '435.0', varlte: '435.0' } },
                },
                setvar: '100',
              },
            ],
          },
        },
      }),
    );
    assert.equal(result.body.type, 'integer');
    if (result.body.type === 'integer') {
      assert.equal(result.body.answer.correctValue, 435);
    }
  });

  it('parses a range from vargte/varlte and computes midpoint + tolerance', () => {
    const result = numericalHandler.transform(
      makeItem({
        rawItemEl: {
          resprocessing: {
            respcondition: [
              {
                conditionvar: {
                  or: { and: { vargte: '9.5', varlte: '10.5' } },
                },
                setvar: '100',
              },
            ],
          },
        },
      }),
    );
    assert.equal(result.body.type, 'numeric');
    if (result.body.type === 'numeric') {
      assert.approximately(result.body.answer.correctValue, 10, 1e-9);
      assert.approximately(result.body.answer.tolerance ?? 0, 0.5, 1e-9);
      assert.equal(result.body.answer.toleranceType, 'absolute');
    }
  });

  it('falls back to correctConditions when resprocessing is absent', () => {
    const result = numericalHandler.transform(
      makeItem({
        correctConditions: [{ responseIdent: 'response1', correctLabelIdent: '3.14' }],
      }),
    );
    assert.equal(result.body.type, 'numeric');
    if (result.body.type === 'numeric') {
      assert.equal(result.body.answer.correctValue, 3.14);
    }
  });

  it('skips respconditions with zero or no setvar score', () => {
    // Only the second condition (score=100) should produce a result
    const result = numericalHandler.transform(
      makeItem({
        rawItemEl: {
          resprocessing: {
            respcondition: [
              {
                conditionvar: { varequal: [{ '@_respident': 'r1', '#text': '999' }] },
                setvar: '0',
              },
              {
                conditionvar: { varequal: [{ '@_respident': 'r1', '#text': '7' }] },
                setvar: '100',
              },
            ],
          },
        },
      }),
    );
    assert.equal(result.body.type, 'integer');
    if (result.body.type === 'integer') {
      assert.equal(result.body.answer.correctValue, 7);
    }
  });

  it('throws when no answer can be determined', () => {
    assert.throws(
      () => numericalHandler.transform(makeItem()),
      /could not determine correct answer/,
    );
  });
});
