import { assert, describe, it } from 'vitest';

import {
  type SpreadsheetElementConfig,
  SpreadsheetElementConfigSchema,
  type SpreadsheetGradingConfig,
  SpreadsheetGradingConfigSchema,
  type SpreadsheetRawSubmission,
  SpreadsheetSubmissionError,
  evaluateSpreadsheet,
  getRelativeFillInput,
  getSpreadsheetLogMetadata,
  intersectRanges,
  normalizeSpreadsheetAnswers,
  parseRange,
  toRelativeAddress,
  toSourceAddress,
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

function makeGradingConfig(): SpreadsheetGradingConfig {
  return {
    schema_version: 1,
    grader_hash: 'grader-hash',
    sheets: [
      {
        name: 'Checks',
        rows: 3,
        columns: 2,
        cells: {
          A1: '=PRODUCT(Inputs!A2,Inputs!B2)',
          A2: '=A1=15',
          A3: '=1/0',
          B1: '=CONCATENATE("o","k")',
          B2: '=B2',
        },
      },
      {
        name: 'Derived',
        rows: 1,
        columns: 1,
        cells: { A1: '=Checks!A1+1' },
      },
    ],
    outputs: {
      total: { sheet: 'Checks', cell: 'A1', required: true },
      correct: { sheet: 'Checks', cell: 'A2' },
      error: { sheet: 'Checks', cell: 'A3', required: false },
      text: { sheet: 'Checks', cell: 'B1' },
      cycle: { sheet: 'Checks', cell: 'B2' },
      empty: { sheet: 'Checks', cell: 'B3' },
      derived: { sheet: 'Derived', cell: 'A1' },
    },
  };
}

function makeOffsetConfig(): SpreadsheetElementConfig {
  return {
    schema_version: 1,
    template_hash: 'template-hash',
    template: {
      schema_version: 1,
      sheets: [
        {
          name: 'Inputs',
          rows: 3,
          columns: 4,
          student_range: 'B2:C3',
          cells: { B2: 2, C2: '=B2*2' },
          editable_ranges: ['B2:B3'],
        },
      ],
    },
  };
}

function makeSourceGradingConfig(): SpreadsheetGradingConfig {
  return {
    schema_version: 1,
    grader_hash: 'source-grader-hash',
    source_sheets: [
      {
        name: 'Inputs',
        rows: 3,
        columns: 4,
        cells: {
          A1: 'HIDDEN_SENTINEL',
          B2: 99,
          C2: '=B2*2',
          D2: '=ISBLANK(B2)',
        },
      },
    ],
    sheets: [],
    outputs: { cleared: { sheet: 'Inputs', cell: 'D2', required: true } },
  };
}

function makeSubmission(sheets: SpreadsheetRawSubmission['sheets'] = {}): SpreadsheetRawSubmission {
  return { schema_version: 1, template_hash: 'template-hash', sheets };
}

describe('spreadsheet ranges', () => {
  it('converts between local-grid and source coordinates', () => {
    const range = parseRange('D5:B3');
    assert.deepEqual(range, { startRow: 2, endRow: 4, startColumn: 1, endColumn: 3 });
    assert.deepEqual(toSourceAddress(range!, { row: 1, column: 2 }), { row: 3, column: 3 });
    assert.deepEqual(toRelativeAddress(range!, { row: 4, column: 2 }), { row: 2, column: 1 });
    assert.deepEqual(
      intersectRanges(range!, {
        startRow: 4,
        endRow: 6,
        startColumn: 3,
        endColumn: 5,
      }),
      { startRow: 4, endRow: 4, startColumn: 3, endColumn: 3 },
    );
    assert.throws(() => toSourceAddress(range!, { row: 3, column: 0 }), RangeError);
    assert.throws(() => toRelativeAddress(range!, { row: 2, column: 0 }), RangeError);
  });
});

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

  it('evaluates private sheets and persists only named typed outputs', () => {
    const evaluation = evaluateSpreadsheet(
      makeConfig(),
      makeSubmission({ Inputs: { A2: 3, B2: 5 } }),
      makeGradingConfig(),
    );

    assert.deepEqual(evaluation.snapshot.grading, {
      schema_version: 1,
      grader_hash: 'grader-hash',
      outputs: {
        total: { type: 'number', value: 15 },
        correct: { type: 'boolean', value: true },
        error: { type: 'error', value: '#DIV/0!', error_type: 'DIV_BY_ZERO' },
        text: { type: 'string', value: 'ok' },
        cycle: { type: 'error', value: '#CYCLE!', error_type: 'CYCLE' },
        empty: { type: 'empty' },
        derived: { type: 'number', value: 16 },
      },
    });
    const serialized = JSON.stringify(evaluation.snapshot);
    assert.notInclude(serialized, 'Checks');
    assert.notInclude(serialized, '=PRODUCT(Inputs!A2,Inputs!B2)');
    evaluation.engine.destroy();
  });

  it('clears and overlays student ranges onto authoritative source sheets', () => {
    const evaluation = evaluateSpreadsheet(
      makeOffsetConfig(),
      makeSubmission({ Inputs: { B2: null } }),
      makeSourceGradingConfig(),
    );

    assert.deepEqual(evaluation.snapshot.grading?.outputs.cleared, {
      type: 'boolean',
      value: true,
    });
    assert.equal(evaluation.snapshot.sheets[0].student_range, 'B2:C3');
    assert.notInclude(JSON.stringify(evaluation.snapshot), 'HIDDEN_SENTINEL');
    assert.notInclude(JSON.stringify(evaluation.snapshot), 'ISBLANK');
    evaluation.engine.destroy();
  });

  it('rejects forged edits and formula references outside the student range', () => {
    assert.throws(
      () => evaluateSpreadsheet(makeOffsetConfig(), makeSubmission({ Inputs: { A1: 5 } })),
      /outside the student range/,
    );
    assert.throws(
      () => evaluateSpreadsheet(makeOffsetConfig(), makeSubmission({ Inputs: { B2: '=D2' } })),
      /outside declared student ranges/,
    );
    assert.throws(
      () =>
        evaluateSpreadsheet(makeOffsetConfig(), makeSubmission({ Inputs: { B2: '=SUM(2:2)' } })),
      /outside declared student ranges/,
    );
    assert.throws(
      () =>
        evaluateSpreadsheet(makeOffsetConfig(), makeSubmission({ Inputs: { B2: '=SUM(B:B)' } })),
      /outside declared student ranges/,
    );
  });

  it('rejects required private outputs that are empty or contain an error', () => {
    for (const outputName of ['error', 'empty'] as const) {
      const gradingConfig = makeGradingConfig();
      gradingConfig.outputs[outputName].required = true;

      assert.throws(
        () => evaluateSpreadsheet(makeConfig(), makeSubmission(), gradingConfig),
        new RegExp(`Required spreadsheet output "${outputName}"`),
      );
    }
  });

  it('validates the required private output option', () => {
    const gradingConfig = makeGradingConfig();
    assert.isTrue(SpreadsheetGradingConfigSchema.safeParse(gradingConfig).success);

    const invalidConfig: unknown = {
      ...gradingConfig,
      outputs: {
        ...gradingConfig.outputs,
        total: { ...gradingConfig.outputs.total, required: 'true' },
      },
    };
    assert.isFalse(SpreadsheetGradingConfigSchema.safeParse(invalidConfig).success);
  });

  it('evaluates student formulas before private sheets exist', () => {
    assert.throws(
      () =>
        evaluateSpreadsheet(
          makeConfig(),
          makeSubmission({ Inputs: { A2: '=Checks!A1' } }),
          makeGradingConfig(),
        ),
      /outside declared student ranges/,
    );
  });

  it('rejects invalid private workbook references and sheet collisions', () => {
    const collision = makeGradingConfig();
    collision.sheets[0].name = 'inputs';
    assert.throws(
      () => evaluateSpreadsheet(makeConfig(), makeSubmission(), collision),
      /conflicts with a student sheet/,
    );

    const invalidOutput = makeGradingConfig();
    invalidOutput.outputs.total = { sheet: 'Checks', cell: 'C1' };
    assert.throws(
      () => evaluateSpreadsheet(makeConfig(), makeSubmission(), invalidOutput),
      /outside sheet Checks/,
    );
  });

  it('validates the sheet-name blocklist', () => {
    for (const name of [
      "Bob's Data",
      '预算 Данные بيانات',
      '😀'.repeat(31),
      'Sheet?-,/\\|`~.@#$%^&*()+;=',
    ]) {
      const config = makeConfig();
      config.template.sheets[0].name = name;
      config.template.sheets[1].cells.B1 = '=1';
      assert.isTrue(SpreadsheetElementConfigSchema.safeParse(config).success);
      evaluateSpreadsheet(config, makeSubmission()).engine.destroy();
    }

    for (const name of [
      'Input!',
      'Input:',
      'Input<',
      'Input>',
      'Input{',
      'Input}',
      'Input[',
      'Input]',
      'Input\0',
      ' Input',
      '😀'.repeat(32),
    ]) {
      const config = makeConfig();
      config.template.sheets[0].name = name;
      assert.isFalse(SpreadsheetElementConfigSchema.safeParse(config).success);
      assert.throws(() => evaluateSpreadsheet(config, makeSubmission()), /not allowed/);
    }

    const gradingConfig = makeGradingConfig();
    gradingConfig.sheets[0].name = 'Check{';
    assert.isFalse(SpreadsheetGradingConfigSchema.safeParse(gradingConfig).success);
    assert.throws(
      () => evaluateSpreadsheet(makeConfig(), makeSubmission(), gradingConfig),
      /not allowed/,
    );
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

  it('includes private outputs in the normalized payload limit', () => {
    const largeValue = 'x'.repeat(32 * 1024);
    const outputs = Object.fromEntries(
      Array.from({ length: 33 }, (_, index) => [
        `output_${index + 1}`,
        { sheet: 'Large', cell: 'A1' },
      ]),
    );
    const gradingConfig: SpreadsheetGradingConfig = {
      schema_version: 1,
      grader_hash: 'large-grader',
      sheets: [{ name: 'Large', rows: 1, columns: 1, cells: { A1: largeValue } }],
      outputs,
    };

    assert.throws(
      () => evaluateSpreadsheet(makeConfig(), makeSubmission(), gradingConfig),
      /1048576 bytes/,
    );
  });
});

describe('normalizeSpreadsheetAnswers', () => {
  it('replaces raw input with a trusted snapshot', () => {
    const normalized = normalizeSpreadsheetAnswers({
      params: { _pl_spreadsheet_v1: { answer: makeConfig() } },
      correctAnswers: {},
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

  it('adds server-owned grading evidence to the trusted snapshot', () => {
    const normalized = normalizeSpreadsheetAnswers({
      params: { _pl_spreadsheet_v1: { answer: makeConfig() } },
      correctAnswers: { answer: makeGradingConfig() },
      submittedAnswers: {
        answer: JSON.stringify(makeSubmission({ Inputs: { A2: 3, B2: 5 } })),
      },
    });
    const answer = normalized.answer as { grading: { outputs: Record<string, unknown> } };
    assert.deepEqual(answer.grading.outputs.total, { type: 'number', value: 15 });
  });

  it('turns an invalid required output into a parse error', () => {
    const gradingConfig = makeGradingConfig();
    gradingConfig.outputs.empty.required = true;
    const normalized = normalizeSpreadsheetAnswers({
      params: { _pl_spreadsheet_v1: { answer: makeConfig() } },
      correctAnswers: { answer: gradingConfig },
      submittedAnswers: { answer: JSON.stringify(makeSubmission()) },
    });

    assert.match(
      (normalized.answer as { error: string }).error,
      /Required spreadsheet output "empty"/,
    );
  });

  it('rejects browser-supplied grading evidence', () => {
    const normalized = normalizeSpreadsheetAnswers({
      params: { _pl_spreadsheet_v1: { answer: makeConfig() } },
      correctAnswers: {},
      submittedAnswers: {
        answer: JSON.stringify({
          ...makeSubmission(),
          grading: {
            schema_version: 1,
            grader_hash: 'spoofed',
            outputs: { total: { type: 'number', value: 1_000_000 } },
          },
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
      spreadsheet_grading_sheets: 0,
      spreadsheet_grading_addressable_cells: 0,
      spreadsheet_grading_populated_cells: 0,
      spreadsheet_grading_formulas: 0,
      spreadsheet_grading_outputs: 0,
    });
  });

  it('counts private grading structure without logging contents', () => {
    assert.deepEqual(
      getSpreadsheetLogMetadata(
        { _pl_spreadsheet_v1: { answer: makeConfig() } },
        { answer: makeGradingConfig() },
      ),
      {
        spreadsheet_elements: 1,
        spreadsheet_sheets: 2,
        spreadsheet_addressable_cells: 16,
        spreadsheet_populated_cells: 6,
        spreadsheet_formulas: 1,
        spreadsheet_grading_sheets: 2,
        spreadsheet_grading_addressable_cells: 7,
        spreadsheet_grading_populated_cells: 6,
        spreadsheet_grading_formulas: 6,
        spreadsheet_grading_outputs: 7,
      },
    );
  });
});
