import { assert, describe, it } from 'vitest';

import type { QTI12ParsedItem } from '../../types/qti12.js';

import { calculatedHandler } from './calculated.js';

function makeItem(overrides: Partial<QTI12ParsedItem> = {}): QTI12ParsedItem {
  return {
    ident: 'q1',
    title: 'Calculated Question',
    questionType: 'calculated_question',
    promptHtml: '<p>What is [a] + [b]?</p>',
    responseLids: [],
    responseStrs: [],
    correctConditions: [],
    feedbacks: new Map(),
    metadata: {},
    ...overrides,
  };
}

function makeCalcItemEl() {
  return {
    itemproc_extension: {
      calculated: {
        answer_tolerance: '0.01',
        formula: '[a]+[b]',
        vars: {
          var: [
            { '@_name': 'a', '@_scale': '2', min: '1.0', max: '10.0' },
            { '@_name': 'b', '@_scale': '2', min: '2.0', max: '5.0' },
          ],
        },
      },
    },
  };
}

describe('calculatedHandler', () => {
  it('produces calculated body', () => {
    const result = calculatedHandler.transform(makeItem({ rawItemEl: makeCalcItemEl() }));
    assert.equal(result.body.type, 'calculated');
  });

  it('extracts the formula', () => {
    const result = calculatedHandler.transform(makeItem({ rawItemEl: makeCalcItemEl() }));
    if (result.body.type !== 'calculated') {
      assert.fail(`Expected calculated body, got ${result.body.type}`);
    }
    assert.equal(result.body.formula, '[a]+[b]');
  });

  it('parses variables with min, max, and decimalPlaces', () => {
    const result = calculatedHandler.transform(makeItem({ rawItemEl: makeCalcItemEl() }));
    if (result.body.type !== 'calculated') {
      assert.fail(`Expected calculated body, got ${result.body.type}`);
    }
    assert.equal(result.body.vars.length, 2);
    assert.equal(result.body.vars[0].name, 'a');
    assert.equal(result.body.vars[0].min, 1);
    assert.equal(result.body.vars[0].max, 10);
    assert.equal(result.body.vars[0].decimalPlaces, 2);
    assert.equal(result.body.vars[1].name, 'b');
  });

  it('parses absolute tolerance', () => {
    const result = calculatedHandler.transform(makeItem({ rawItemEl: makeCalcItemEl() }));
    if (result.body.type !== 'calculated') {
      assert.fail(`Expected calculated body, got ${result.body.type}`);
    }
    assert.equal(result.body.tolerance, 0.01);
    assert.equal(result.body.toleranceType, 'absolute');
  });

  it('parses relative tolerance with % suffix', () => {
    const itemEl = makeCalcItemEl();
    itemEl.itemproc_extension.calculated.answer_tolerance = '5%';
    const result = calculatedHandler.transform(makeItem({ rawItemEl: itemEl }));
    if (result.body.type !== 'calculated') {
      assert.fail(`Expected calculated body, got ${result.body.type}`);
    }
    assert.equal(result.body.tolerance, 5);
    assert.equal(result.body.toleranceType, 'relative');
  });

  it('reads formula from <formulas><formula> wrapper (Canvas quiz export format)', () => {
    const itemEl = {
      itemproc_extension: {
        calculated: {
          answer_tolerance: '0',
          formulas: { formula: 'x * 16' },
          vars: {
            var: [{ '@_name': 'x', '@_scale': '0', min: '1.0', max: '20.0' }],
          },
        },
      },
    };
    const result = calculatedHandler.transform(makeItem({ rawItemEl: itemEl }));
    assert.equal(result.body.type, 'calculated');
    if (result.body.type === 'calculated') {
      assert.equal(result.body.formula, 'x * 16');
    }
  });

  it('throws when itemproc_extension/calculated block is missing', () => {
    assert.throws(
      () => calculatedHandler.transform(makeItem()),
      /missing.*itemproc_extension.*calculated/i,
    );
  });

  it('throws when no variables are found', () => {
    const itemEl = {
      itemproc_extension: {
        calculated: {
          answer_tolerance: '0.01',
          formula: '[a]+1',
          vars: {},
        },
      },
    };
    assert.throws(
      () => calculatedHandler.transform(makeItem({ rawItemEl: itemEl })),
      /no variables found/,
    );
  });
});
