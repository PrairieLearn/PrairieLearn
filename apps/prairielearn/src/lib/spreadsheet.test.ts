import { assert, describe, it } from 'vitest';

import {
  type SpreadsheetElementConfig,
  type SpreadsheetRawSubmission,
  SpreadsheetSubmissionError,
  evaluateSpreadsheet,
  getRelativeFillInput,
  getSpreadsheetLogMetadata,
  normalizeSpreadsheetAnswers,
} from './spreadsheet.js';

function makeConfig(): SpreadsheetElementConfig {
  return {
    schema_version: 1,
    template_hash: 'template-hash',
    allow_blank: false,
    aria_label: 'Test spreadsheet',
    height: '500px',
    template: {
      schema_version: 1,
      sheets: [
        {
          name: 'Inputs',
          rows: 4,
          columns: 3,
          cells: { A1: 'Quantity', B1: 'Price', A2: 2, B2: 4 },
          editable_ranges: ['A2:B4'],
        },
        {
          name: 'Summary',
          rows: 2,
          columns: 2,
          cells: { A1: 'Total', B1: '=Inputs!A2*Inputs!B2' },
          editable_ranges: ['A2:A2'],
        },
      ],
    },
  };
}

function makeSubmission(sheets: SpreadsheetRawSubmission['sheets'] = {}): SpreadsheetRawSubmission {
  return { schema_version: 1, template_hash: 'template-hash', sheets };
}

describe('evaluateSpreadsheet', () => {
  it('recomputes formulas from submitted inputs', () => {
    const evaluation = evaluateSpreadsheet(
      makeConfig(),
      makeSubmission({ Inputs: { A2: 3, B2: 5 } }),
    );
    assert.deepEqual(evaluation.snapshot.sheets[1].cells.B1, {
      input: { type: 'formula', value: '=Inputs!A2*Inputs!B2' },
      result: { type: 'number', value: 15 },
    });
    evaluation.engine.destroy();
  });

  it('normalizes calculation errors without rejecting the submission', () => {
    const config = makeConfig();
    config.template.sheets[1].cells.B1 = '=B1';
    const evaluation = evaluateSpreadsheet(config, makeSubmission());
    const result = evaluation.snapshot.sheets[1].cells.B1.result;
    assert.equal(result.type, 'error');
    if (result.type !== 'error') assert.fail('Expected an error result.');
    assert.equal(result.value, '#CYCLE!');
    evaluation.engine.destroy();
  });

  it('represents clearing a populated editable template cell', () => {
    const evaluation = evaluateSpreadsheet(makeConfig(), makeSubmission({ Inputs: { A2: null } }));
    assert.notProperty(evaluation.snapshot.sheets[0].cells, 'A2');
    assert.deepEqual(evaluation.snapshot.sheets[1].cells.B1.result, {
      type: 'number',
      value: 0,
    });
    evaluation.engine.destroy();
  });

  it('rejects edits to locked cells', () => {
    assert.throws(
      () => evaluateSpreadsheet(makeConfig(), makeSubmission({ Inputs: { A1: 'Changed' } })),
      SpreadsheetSubmissionError,
    );
  });

  it('rejects stale templates', () => {
    const submission = makeSubmission();
    submission.template_hash = 'old-hash';
    assert.throws(() => evaluateSpreadsheet(makeConfig(), submission), /template changed/i);
  });

  it('rejects unsupported and volatile functions', () => {
    assert.throws(
      () => evaluateSpreadsheet(makeConfig(), makeSubmission({ Inputs: { A2: '=RAND()' } })),
      /RAND is not supported/,
    );
    assert.throws(
      () => evaluateSpreadsheet(makeConfig(), makeSubmission({ Inputs: { A2: '=REPT("a",2)' } })),
      /REPT is not supported/,
    );
    assert.throws(
      () => evaluateSpreadsheet(makeConfig(), makeSubmission({ Inputs: { A2: '={1,2}' } })),
      /array formulas are not supported/,
    );
    assert.throws(
      () =>
        evaluateSpreadsheet(
          makeConfig(),
          makeSubmission({ Inputs: { A2: "='[other.xlsx]Sheet1'!A1" } }),
        ),
      /External references/,
    );
  });

  it('rejects duplicate case-insensitive cell addresses', () => {
    assert.throws(
      () => evaluateSpreadsheet(makeConfig(), makeSubmission({ Inputs: { A2: 3, a2: 4 } })),
      /submitted more than once/,
    );
  });

  it('adjusts relative references when filling a cell', () => {
    const evaluation = evaluateSpreadsheet(makeConfig(), makeSubmission({ Inputs: { A2: '=A3' } }));
    assert.equal(
      getRelativeFillInput(
        evaluation.engine,
        { sheet: 0, row: 1, col: 0 },
        { sheet: 0, row: 1, col: 1 },
      ),
      '=B3',
    );
    evaluation.engine.destroy();
  });

  it('enforces workbook and formula limits', () => {
    const tooLarge = makeConfig();
    tooLarge.template.sheets[0].rows = 1001;
    assert.throws(() => evaluateSpreadsheet(tooLarge, makeSubmission()), /1 to 1000 rows/);

    const oversizedFormula = `=${'1+'.repeat(1024)}1`;
    assert.throws(
      () => evaluateSpreadsheet(makeConfig(), makeSubmission({ Inputs: { A2: oversizedFormula } })),
      /at most 2048 characters/,
    );
  });
});

describe('normalizeSpreadsheetAnswers', () => {
  it('replaces raw input with a trusted snapshot', () => {
    const normalized = normalizeSpreadsheetAnswers({
      params: { _pl_spreadsheet_v1: { answer: makeConfig() } },
      submittedAnswers: {
        answer: JSON.stringify(makeSubmission({ Inputs: { A2: 6 } })),
        other: 'untouched',
      },
    });
    const answer = normalized.answer;
    assert.isObject(answer);
    assert.notProperty(answer, 'results');
    assert.equal(normalized.other, 'untouched');
  });

  it('discards a spoofed result and returns a format-error envelope', () => {
    const normalized = normalizeSpreadsheetAnswers({
      params: { _pl_spreadsheet_v1: { answer: makeConfig() } },
      submittedAnswers: {
        answer: JSON.stringify({
          ...makeSubmission(),
          results: { Summary: { B1: 1_000_000 } },
        }),
      },
    });
    assert.match((normalized.answer as { error: string }).error, /invalid structure/i);
  });
});

describe('getSpreadsheetLogMetadata', () => {
  it('returns only structural counts', () => {
    assert.deepEqual(getSpreadsheetLogMetadata({ _pl_spreadsheet_v1: { answer: makeConfig() } }), {
      spreadsheet_elements: 1,
      spreadsheet_sheets: 2,
      spreadsheet_addressable_cells: 16,
      spreadsheet_populated_cells: 6,
      spreadsheet_formulas: 1,
    });
  });
});
