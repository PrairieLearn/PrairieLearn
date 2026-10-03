import { assert, beforeAll, describe, it } from 'vitest';

import { loadSpreadsheetEngine } from './spreadsheet-engine-node.js';
import {
  SPREADSHEET_INTERNAL_SHEET_PREFIX,
  type SpreadsheetElementConfig,
  SpreadsheetElementConfigSchema,
  type SpreadsheetGradingConfig,
  SpreadsheetGradingConfigSchema,
  type SpreadsheetRawSubmission,
  SpreadsheetSubmissionError,
  addSpreadsheetReferenceAnswers,
  createSpreadsheetAddressSpace,
  evaluateSpreadsheet,
  evaluateSpreadsheetForEditor,
  getRelativeFillInput,
  getSpreadsheetLogMetadata,
  intersectRanges,
  isCellVolatile,
  normalizeSpreadsheetAnswers,
  parseRange,
  toRelativeAddress,
  toRelativeRange,
  toSourceAddress,
  toSourceRange,
} from './spreadsheet.js';

beforeAll(loadSpreadsheetEngine);

function makeConfig(): SpreadsheetElementConfig {
  return {
    schema_version: 2,
    template_hash: 'template-hash',
    allow_blank: false,
    aria_label: 'Test spreadsheet',
    height: '500px',
    template: {
      schema_version: 2,
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
    schema_version: 2,
    grader_hash: 'grader-hash',
    source_sheets: [
      {
        name: 'Summary',
        rows: 2,
        columns: 2,
        cells: { A1: 'Total', B1: '=Inputs!A2*Inputs!B2' },
      },
      {
        name: 'Inputs',
        rows: 4,
        columns: 3,
        cells: { A1: 'Quantity', B1: 'Price', A2: 2, B2: 4 },
      },
    ],
    student_overlays: [
      { student_sheet: 'Inputs', source_sheet: 'Inputs', source_range: 'A1:C4' },
      { student_sheet: 'Summary', source_sheet: 'Summary', source_range: 'A1:B2' },
    ],
    sheets: [
      {
        name: 'Derived',
        rows: 1,
        columns: 1,
        cells: { A1: '=Checks!A1+1' },
      },
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
    schema_version: 2,
    template_hash: 'template-hash',
    template: {
      schema_version: 2,
      sheets: [
        {
          name: 'Inputs',
          rows: 2,
          columns: 2,
          cells: { A1: 2, B1: '=A1*2' },
          editable_ranges: ['A1:A2'],
        },
      ],
    },
  };
}

function makeSourceGradingConfig(): SpreadsheetGradingConfig {
  return {
    schema_version: 2,
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
          D3: '=B2=4',
        },
      },
    ],
    student_overlays: [{ student_sheet: 'Inputs', source_sheet: 'Inputs', source_range: 'B2:C3' }],
    sheets: [],
    outputs: {
      cleared: { sheet: 'Inputs', cell: 'D2', required: true },
      bridged: { sheet: 'Inputs', cell: 'D3', required: true },
    },
  };
}

function makeSubmission(sheets: SpreadsheetRawSubmission['sheets'] = {}): SpreadsheetRawSubmission {
  return { schema_version: 2, template_hash: 'template-hash', sheets };
}

function makePricingConfig(): SpreadsheetElementConfig {
  return {
    schema_version: 2,
    template_hash: 'template-hash',
    template: {
      schema_version: 2,
      sheets: [
        {
          name: 'Inputs',
          rows: 2,
          columns: 4,
          cells: { A1: 'Quantity', B1: 'Price', C1: 'Discount', D1: 'Total', A2: 3, B2: 4 },
          editable_ranges: ['C2:D2'],
        },
      ],
    },
  };
}

const PRICING_REFERENCE: NonNullable<SpreadsheetGradingConfig['reference']> = {
  cells: [{ sheet: 'Inputs', cell: 'D2', input: '=A2*B2-C2' }],
  rtol: 1e-2,
  atol: 1e-8,
  compare_outputs: false,
};

function makePricingGradingConfig(
  overrides: Partial<SpreadsheetGradingConfig> = {},
): SpreadsheetGradingConfig {
  return {
    schema_version: 2,
    grader_hash: 'pricing-grader',
    source_sheets: [
      {
        name: 'Inputs',
        rows: 2,
        columns: 4,
        cells: { A1: 'Quantity', B1: 'Price', C1: 'Discount', D1: 'Total', A2: 3, B2: 4 },
      },
    ],
    student_overlays: [{ student_sheet: 'Inputs', source_sheet: 'Inputs', source_range: 'A1:D2' }],
    sheets: [],
    outputs: { total: { sheet: 'Inputs', cell: 'D2' } },
    parameters: [{ sheet: 'Inputs', range: 'C2' }],
    test_cases: [
      { name: 'zero quantity', inputs: [{ sheet: 'Inputs', cell: 'A2', value: 0 }] },
      {
        name: 'new price',
        inputs: [
          { sheet: 'Inputs', cell: 'B2', value: 10 },
          { sheet: 'Inputs', cell: 'C2', value: 5 },
        ],
      },
    ],
    ...overrides,
  };
}

function gradePricing(
  sheets: SpreadsheetRawSubmission['sheets'],
  gradingConfig: SpreadsheetGradingConfig = makePricingGradingConfig(),
) {
  const evaluation = evaluateSpreadsheet(
    makePricingConfig(),
    makeSubmission(sheets),
    gradingConfig,
  );
  return { grading: evaluation.snapshot.grading!, serialized: JSON.stringify(evaluation.snapshot) };
}

describe('spreadsheet ranges', () => {
  it('converts between local-grid and source coordinates', () => {
    const range = parseRange('D5:B3');
    assert.deepEqual(range, { startRow: 2, endRow: 4, startColumn: 1, endColumn: 3 });
    const addressSpace = createSpreadsheetAddressSpace(range!);
    assert.deepEqual(toSourceAddress(addressSpace, { row: 1, column: 2 }), {
      row: 3,
      column: 3,
    });
    assert.deepEqual(toRelativeAddress(addressSpace, { row: 4, column: 2 }), {
      row: 2,
      column: 1,
    });
    assert.deepEqual(
      toSourceRange(addressSpace, {
        startRow: 0,
        endRow: 1,
        startColumn: 1,
        endColumn: 2,
      }),
      { startRow: 2, endRow: 3, startColumn: 2, endColumn: 3 },
    );
    assert.deepEqual(
      toRelativeRange(addressSpace, {
        startRow: 2,
        endRow: 3,
        startColumn: 2,
        endColumn: 3,
      }),
      { startRow: 0, endRow: 1, startColumn: 1, endColumn: 2 },
    );
    assert.deepEqual(
      intersectRanges(range!, {
        startRow: 4,
        endRow: 6,
        startColumn: 3,
        endColumn: 5,
      }),
      { startRow: 4, endRow: 4, startColumn: 3, endColumn: 3 },
    );
    assert.throws(() => toSourceAddress(addressSpace, { row: 3, column: 0 }), RangeError);
    assert.throws(() => toRelativeAddress(addressSpace, { row: 2, column: 0 }), RangeError);
    assert.throws(
      () =>
        createSpreadsheetAddressSpace({
          startRow: 2,
          endRow: 1,
          startColumn: 0,
          endColumn: 0,
        }),
      RangeError,
    );
  });
});

describe('volatile ranges', () => {
  function makeVolatileConfig(volatileRanges: string[]): SpreadsheetElementConfig {
    const config = makeConfig();
    config.template.sheets[0] = {
      ...config.template.sheets[0],
      cells: { ...config.template.sheets[0].cells, C2: 0.05 },
      editable_ranges: ['A2:B4'],
      volatile_ranges: volatileRanges,
    };
    return config;
  }

  it('marks volatile cells and accepts them as locked constants', () => {
    const config = makeVolatileConfig(['C2:C3']);
    const sheet = config.template.sheets[0];
    assert.isTrue(isCellVolatile(sheet, 1, 2));
    assert.isFalse(isCellVolatile(sheet, 1, 1));
    assert.isFalse(isCellVolatile(config.template.sheets[1], 0, 0));
    assert.isTrue(SpreadsheetElementConfigSchema.safeParse(config).success);

    const evaluation = evaluateSpreadsheet(config, makeSubmission({ Inputs: { A2: 3 } }));
    assert.deepEqual(evaluation.snapshot.sheets[0].cells.C2.result, {
      type: 'number',
      value: 0.05,
    });
    assert.throws(
      () => evaluateSpreadsheet(config, makeSubmission({ Inputs: { C2: 1 } })),
      SpreadsheetSubmissionError,
    );
  });

  it('rejects volatile ranges outside the sheet or overlapping editable cells', () => {
    assert.throws(
      () => evaluateSpreadsheet(makeVolatileConfig(['C2:D2']), makeSubmission()),
      /Volatile range C2:D2 is outside sheet Inputs/,
    );
    assert.throws(
      () => evaluateSpreadsheet(makeVolatileConfig(['B4:C4']), makeSubmission()),
      /Volatile range B4:C4 overlaps an editable range/,
    );
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
  });

  it('normalizes calculation errors without rejecting the submission', () => {
    const config = makeConfig();
    config.template.sheets[1].cells.B1 = '=B1';
    const evaluation = evaluateSpreadsheet(config, makeSubmission());
    const result = evaluation.snapshot.sheets[1].cells.B1.result;
    assert.equal(result.type, 'error');
    if (result.type !== 'error') assert.fail('Expected an error result.');
    assert.equal(result.value, '#CYCLE!');
  });

  it('returns calculation errors for display without reporting editor issues', () => {
    const evaluation = evaluateSpreadsheetForEditor(
      makeConfig(),
      makeSubmission({ Inputs: { A2: '=1/0' } }),
    );

    assert.deepEqual(evaluation.snapshot.sheets[0].cells.A2, {
      input: { type: 'formula', value: '=1/0' },
      result: { type: 'error', value: '#DIV/0!', error_type: 'DIV_BY_ZERO' },
    });
    assert.deepEqual(evaluation.issues, {});
  });

  it('calculates with number-like and boolean text from file sources', () => {
    const config = makeConfig();
    Object.assign(config.template.sheets[0].cells, { A2: '2', B2: '4.5', C2: 'true', A3: '1e3x' });
    const { snapshot } = evaluateSpreadsheet(config, makeSubmission({ Inputs: { B3: '=A2*B2' } }));

    const cells = snapshot.sheets[0].cells;
    assert.deepEqual(cells.A2, {
      input: { type: 'string', value: '2' },
      result: { type: 'number', value: 2 },
    });
    assert.deepEqual(cells.C2.result, { type: 'boolean', value: true });
    assert.deepEqual(cells.A3.result, { type: 'string', value: '1e3x' });
    assert.deepEqual(cells.B3.result, { type: 'number', value: 9 });
  });

  it('reports array results that would spill as #VALUE!', () => {
    const evaluation = evaluateSpreadsheetForEditor(
      makeConfig(),
      makeSubmission({ Inputs: { A3: '=A2:B2*2', A4: '=SUM(A3:B3)' } }),
    );

    const cells = evaluation.snapshot.sheets[0].cells;
    assert.deepEqual(cells.A3.result, { type: 'error', value: '#VALUE!', error_type: 'VALUE' });
    assert.deepEqual(cells.A4.result, { type: 'error', value: '#VALUE!', error_type: 'VALUE' });
    assert.isUndefined(cells.B3);
  });

  it('reports references to sheets that do not exist as editor issues', () => {
    for (const formula of ['=Missing!A1', "='No such sheet'!A1:B2", '=Données!A1', '=Sheet1!A1']) {
      const evaluation = evaluateSpreadsheetForEditor(
        makeConfig(),
        makeSubmission({ Inputs: { A3: formula } }),
      );
      assert.equal(evaluation.snapshot.sheets[0].cells.A3.result.type, 'error', formula);
      assert.match(
        evaluation.issues.Inputs!.A3!.message,
        /outside declared student ranges/,
        formula,
      );
    }
  });

  it('preserves invalid formulas and reports cell-addressed editor issues', () => {
    const cases = [
      {
        formula: '=1+',
        value: '#ERROR!',
        errorType: 'ERROR',
        message: /outside declared student ranges/,
      },
      {
        formula: '=MISSING_NAME',
        value: '#NAME?',
        errorType: 'NAME',
        message: /outside declared student ranges/,
      },
      {
        formula: '=RAND()',
        value: '#ERROR!',
        errorType: 'ERROR',
        message: /RAND is not supported/,
      },
    ];

    for (const { formula, value, errorType, message } of cases) {
      const evaluation = evaluateSpreadsheetForEditor(
        makeConfig(),
        makeSubmission({ Inputs: { A2: formula } }),
      );
      assert.deepEqual(evaluation.snapshot.sheets[0].cells.A2, {
        input: { type: 'formula', value: formula },
        result: { type: 'error', value, error_type: errorType },
      });
      assert.match(evaluation.issues.Inputs!.A2!.message, message);
      assert.throws(() =>
        evaluateSpreadsheet(makeConfig(), makeSubmission({ Inputs: { A2: formula } })),
      );
    }
  });

  it('shows references outside the student address space as reference errors', () => {
    const evaluation = evaluateSpreadsheetForEditor(
      makeOffsetConfig(),
      makeSubmission({ Inputs: { A1: '=C1' } }),
    );

    assert.deepEqual(evaluation.snapshot.sheets[0].cells.A1, {
      input: { type: 'formula', value: '=C1' },
      result: { type: 'error', value: '#REF!', error_type: 'REF' },
    });
    assert.match(evaluation.issues.Inputs!.A1!.message, /outside declared student ranges/);
    assert.throws(
      () => evaluateSpreadsheet(makeOffsetConfig(), makeSubmission({ Inputs: { A1: '=C1' } })),
      /outside declared student ranges/,
    );
  });

  it('evaluates private sheets and persists only named typed outputs', () => {
    const evaluation = evaluateSpreadsheet(
      makeConfig(),
      makeSubmission({ Inputs: { A2: 3, B2: 5 } }),
      makeGradingConfig(),
    );

    assert.deepEqual(evaluation.snapshot.grading, {
      schema_version: 2,
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
  });

  it('clears and overlays student ranges onto authoritative source sheets', () => {
    const evaluation = evaluateSpreadsheet(
      makeOffsetConfig(),
      makeSubmission({ Inputs: { A1: null } }),
      makeSourceGradingConfig(),
    );

    assert.deepEqual(evaluation.snapshot.grading?.outputs.cleared, {
      type: 'boolean',
      value: true,
    });
    assert.deepEqual(evaluation.snapshot.sheets[0].cells.B1, {
      input: { type: 'formula', value: '=A1*2' },
      result: { type: 'number', value: 0 },
    });
    assert.notInclude(JSON.stringify(evaluation.snapshot), 'HIDDEN_SENTINEL');
    assert.notInclude(JSON.stringify(evaluation.snapshot), 'ISBLANK');
  });

  it('bridges student-local formulas into source-coordinate grading cells', () => {
    const evaluation = evaluateSpreadsheet(
      makeOffsetConfig(),
      makeSubmission({ Inputs: { A1: '=2+2' } }),
      makeSourceGradingConfig(),
    );

    assert.deepEqual(evaluation.snapshot.grading?.outputs.bridged, {
      type: 'boolean',
      value: true,
    });
    assert.notInclude(JSON.stringify(evaluation.snapshot), SPREADSHEET_INTERNAL_SHEET_PREFIX);
  });

  it('rejects forged edits and formula references outside the student address space', () => {
    assert.throws(
      () => evaluateSpreadsheet(makeOffsetConfig(), makeSubmission({ Inputs: { C1: 5 } })),
      /outside sheet/,
    );
    assert.throws(
      () => evaluateSpreadsheet(makeOffsetConfig(), makeSubmission({ Inputs: { A1: '=C1' } })),
      /outside declared student ranges/,
    );
    assert.throws(
      () =>
        evaluateSpreadsheet(makeOffsetConfig(), makeSubmission({ Inputs: { A1: '=Hidden!A1' } })),
      /outside declared student ranges/,
    );
    const transitiveEscape = makeOffsetConfig();
    transitiveEscape.template.sheets[0].cells.B1 = '=C1';
    assert.throws(
      () => evaluateSpreadsheet(transitiveEscape, makeSubmission({ Inputs: { A1: '=B1' } })),
      /outside declared student ranges/,
    );
    assert.throws(
      () =>
        evaluateSpreadsheet(makeOffsetConfig(), makeSubmission({ Inputs: { A1: '=SUM(3:3)' } })),
      /outside declared student ranges/,
    );
    assert.throws(
      () =>
        evaluateSpreadsheet(makeOffsetConfig(), makeSubmission({ Inputs: { A1: '=SUM(C:C)' } })),
      /outside declared student ranges/,
    );
    assert.throws(
      () =>
        evaluateSpreadsheet(makeOffsetConfig(), makeSubmission({ Inputs: { A1: '=SUM(B3:B)' } })),
      /outside declared student ranges/,
    );
    evaluateSpreadsheet(makeOffsetConfig(), makeSubmission({ Inputs: { A1: '=SUM(B1:B2)' } }));
  });

  it('detects cycles through open-ended ranges', () => {
    for (const formula of ['=SUM(2:2)', '=SUM(A:A)', '=SUM(A1:A)', '=SUM(A2:2)', '=SUM($A:$B)']) {
      const evaluation = evaluateSpreadsheet(
        makeOffsetConfig(),
        makeSubmission({ Inputs: { A2: formula } }),
      );
      assert.deepEqual(
        evaluation.snapshot.sheets[0].cells.A2.result,
        { type: 'error', value: '#CYCLE!', error_type: 'CYCLE' },
        formula,
      );
    }
  });

  it('resolves open-ended ranges to the edge of the student sheet', () => {
    for (const [formula, value] of [
      ['=SUM(B:B)', 4],
      ['=AVERAGE(B1:B)', 4],
      ['=SUM(1:1)', 6],
    ] as const) {
      const evaluation = evaluateSpreadsheet(
        makeOffsetConfig(),
        makeSubmission({ Inputs: { A2: formula } }),
      );
      assert.deepEqual(
        evaluation.snapshot.sheets[0].cells.A2.result,
        { type: 'number', value },
        formula,
      );
    }
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
      /duplicated/,
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
      evaluateSpreadsheet(config, makeSubmission());
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
      '__PL_STUDENT_0',
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
    const fill = (input: string | number, rowOffset: number, columnOffset: number) =>
      getRelativeFillInput(input, { rowOffset, columnOffset });
    assert.equal(fill('=A3', 0, 1), '=B3');
    assert.equal(fill('=SUM($A1:B$2)*Inputs!C3', 2, 1), '=SUM($A3:C$2)*Inputs!D5');
    assert.equal(fill("='My sheet'!A1+B:B", 1, 1), "='My sheet'!B2+C:C");
    assert.equal(fill('="A1"&A1', 1, 0), '="A1"&A2');
    assert.equal(fill('=A1+1', -1, 0), '=#REF!+1');
    assert.equal(fill(4, 1, 0), 4);
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
      ...makeGradingConfig(),
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

describe('adversarial student formulas', () => {
  const HIDDEN_NUMBER = 31337;

  // The student sees Inputs!B2:C3 as A1:B2. Every source cell around that range,
  /** a private grading sheet, and an undeclared source sheet hold hidden values. */
  function makeAttackConfig(): SpreadsheetElementConfig {
    return {
      schema_version: 2,
      template_hash: 'template-hash',
      template: {
        schema_version: 2,
        sheets: [
          {
            name: 'Inputs',
            rows: 2,
            columns: 2,
            cells: { A1: 1, B1: 2, B2: 3 },
            editable_ranges: ['A1:A2'],
          },
        ],
      },
    };
  }

  function makeAttackGradingConfig(): SpreadsheetGradingConfig {
    const hiddenNeighbors = ['A1', 'B1', 'C1', 'D1', 'A2', 'D2', 'A3', 'D3', 'A4', 'B4', 'C4'];
    return {
      schema_version: 2,
      grader_hash: 'attack-grader',
      source_sheets: [
        {
          name: 'Inputs',
          rows: 4,
          columns: 4,
          cells: {
            ...Object.fromEntries(hiddenNeighbors.map((address) => [address, HIDDEN_NUMBER])),
            D4: 'HIDDEN_SENTINEL',
            B2: 1,
            C2: 2,
            C3: 3,
          },
        },
        { name: 'Vault', rows: 2, columns: 2, cells: { A1: 'VAULT_SENTINEL', B1: HIDDEN_NUMBER } },
      ],
      student_overlays: [
        { student_sheet: 'Inputs', source_sheet: 'Inputs', source_range: 'B2:C3' },
      ],
      sheets: [
        {
          name: 'Secret',
          rows: 2,
          columns: 2,
          cells: { A1: 'PRIVATE_SENTINEL', B1: HIDDEN_NUMBER },
        },
      ],
      outputs: { attack: { sheet: 'Inputs', cell: 'B3' } },
    };
  }

  function evaluateAttack(formula: string) {
    const evaluation = evaluateSpreadsheet(
      makeAttackConfig(),
      makeSubmission({ Inputs: { A2: formula } }),
      makeAttackGradingConfig(),
    );
    return evaluation.snapshot;
  }

  it('rejects lookups and addressing that reach outside the student range', () => {
    const attacks = [
      '=VLOOKUP(1,A1:C2,3,FALSE)',
      '=HLOOKUP(1,A1:B3,3,FALSE)',
      '=SUM(A1:INDEX(B:B,5))',
      '=SUM(INDEX(A1:B2,1,1):C3)',
      '=SUMIF(A1:A2,">0",C1:C2)',
      '=SUMPRODUCT(A1:A2,C1:C2)',
      '=COUNTIFS(A1:A2,">0",B1:B5,">0")',
      '=IFERROR(Secret!B1,0)',
      "=IFERROR('secret'!B1,0)",
      '=IFERROR(Vault!B1,0)',
      '=IFERROR(INDEX(Secret!A:B,1,2),0)',
      '=IFNA(MATCH(31337,Vault!B:B,0),0)',
      `=IFERROR(${SPREADSHEET_INTERNAL_SHEET_PREFIX}0!A1,0)`,
      '=IFERROR(Inputs!A1:Secret!B1,0)',
      '=IFERROR(SUM(Secret!A1:Inputs!B2),0)',
      '=IFERROR(COUNTA(Inputs!B1:Vault!B2),0)',
      "=IFERROR(SUM(Inputs!A1:'Secret'!B2),0)",
    ];
    for (const formula of attacks) {
      assert.throws(
        () => evaluateAttack(formula),
        /outside declared student ranges/,
        undefined,
        formula,
      );
    }
  });

  it('keeps out-of-bounds lookup indexes inside the student range', () => {
    const errors = [
      '=VLOOKUP(2,B1:B2,2,FALSE)',
      '=INDEX(B1:B2,3)',
      '=INDEX(B1:B2,0)',
      '=INDEX(B1:B2,-1)',
      '=INDEX(B1:B2,1,2)',
      '=INDEX(A1:B1,2,1)',
      '=INDEX(A1:B1,0,3)',
      '=INDEX(B1:B2,"3")',
    ];
    for (const formula of errors) {
      const snapshot = evaluateAttack(formula);
      assert.equal(snapshot.grading!.outputs.attack.type, 'error', formula);
      assert.notMatch(JSON.stringify(snapshot), /SENTINEL|31337/, formula);
    }
    // The engine resizes ranges of different shapes instead of returning #VALUE!, but
    // student formulas only run on a mirror of the student range, so the cells they
    // reach past it are empty.
    const mismatchedShapes = [
      '=SUMIF(B1:B2,">0",B2)',
      '=SUMIFS(B2,B1:B2,">0")',
      '=AVERAGEIF(B1:B2,">0",B2)',
      '=COUNTIFS(B1:B2,">0",B2,">0")',
      '=SUMPRODUCT(B1:B2,A1:B1)',
    ];
    for (const formula of mismatchedShapes) {
      assert.notMatch(JSON.stringify(evaluateAttack(formula)), /SENTINEL|31337/, formula);
    }
    // Whole columns and rows only reach the student range, so they cannot find hidden values.
    for (const [formula, result] of [
      ['=MATCH(31337,B:B,0)', { type: 'error', value: '#N/A', error_type: 'NA' }],
      ['=INDEX(B:B,1)', { type: 'number', value: 2 }],
      ['=INDEX(1:1,1)', { type: 'number', value: 1 }],
      ['=SUM(B2:B)', { type: 'number', value: 3 }],
    ] as const) {
      assert.deepEqual(evaluateAttack(formula).grading!.outputs.attack, result, formula);
    }
    // As in Excel, a zero row and column select the whole range.
    const snapshot = evaluateAttack('=SUM(INDEX(B1:B2,0,0))');
    assert.deepEqual(snapshot.grading!.outputs.attack, { type: 'number', value: 5 });
    assert.notMatch(JSON.stringify(snapshot), /SENTINEL|31337/);
  });

  it('rejects functions hidden inside quoted sheet names', () => {
    const config = makeAttackConfig();
    config.template.sheets[0].name = 'Q"1';
    for (const [formula, functionName] of [
      ['=\'Q"1\'!B1+SHEETS()+LEN("")', 'SHEETS'],
      ['=\'Q"1\'!B1&SHEET("Secret")&LEN("")', 'SHEET'],
      ['=\'Q"1\'!B1+SUM(OFFSET(A1,0,2))+LEN("")', 'OFFSET'],
    ]) {
      assert.throws(
        () => evaluateSpreadsheet(config, makeSubmission({ 'Q"1': { A2: formula } })),
        new RegExp(`Function ${functionName} is not supported`),
      );
    }
    evaluateSpreadsheet(config, makeSubmission({ 'Q"1': { A2: '=\'Q"1\'!B1&"!"&"Secret!A1"' } }));
  });

  it('rejects unsupported functions disguised with prefixes or identifier characters', () => {
    for (const [formula, functionName] of [
      ['=_xlfn.OFFSET(A1,0,2)', '_XLFN.OFFSET'],
      ['=IFERROR(SHEETS_(),0)', 'SHEETS_'],
      ['=IFERROR(ÀSHEETS(),0)', 'ÀSHEETS'],
      ['=offset (A1,0,2)', 'OFFSET'],
    ]) {
      assert.throws(
        () => evaluateSpreadsheet(makeAttackConfig(), makeSubmission({ Inputs: { A2: formula } })),
        new RegExp(`Function ${functionName} is not supported`),
      );
    }
  });
});

describe('spreadsheet test cases', () => {
  it('recomputes outputs with overridden parameters and restores them between cases', () => {
    const { grading } = gradePricing({ Inputs: { C2: 1, D2: '=A2*B2-C2' } });

    assert.deepEqual(grading.outputs.total, { type: 'number', value: 11 });
    assert.deepEqual(grading.cases, [
      { name: 'zero quantity', outputs: { total: { type: 'number', value: -1 } } },
      { name: 'new price', outputs: { total: { type: 'number', value: 25 } } },
    ]);
  });

  it('exposes hardcoded values that only match the base case', () => {
    const { grading } = gradePricing({ Inputs: { C2: 1, D2: 11 } });

    assert.deepEqual(grading.outputs.total, { type: 'number', value: 11 });
    assert.deepEqual(
      grading.cases?.map((testCase) => testCase.outputs.total),
      [
        { type: 'number', value: 11 },
        { type: 'number', value: 11 },
      ],
    );
  });

  it('overrides student-relative cells for offset student ranges', () => {
    const gradingConfig: SpreadsheetGradingConfig = {
      ...makeSourceGradingConfig(),
      outputs: { doubled: { sheet: 'Inputs', cell: 'C2' } },
      parameters: [{ sheet: 'Inputs', range: 'B2' }],
      test_cases: [
        { name: 'five', inputs: [{ sheet: 'Inputs', cell: 'B2', value: 5 }] },
        { name: 'hidden', inputs: [{ sheet: 'Inputs', cell: 'A1', value: 'changed' }] },
      ],
    };
    const evaluation = evaluateSpreadsheet(
      makeOffsetConfig(),
      makeSubmission({ Inputs: { A1: 3 } }),
      gradingConfig,
    );

    assert.deepEqual(evaluation.snapshot.grading?.outputs.doubled, { type: 'number', value: 6 });
    assert.deepEqual(
      evaluation.snapshot.grading?.cases?.map((testCase) => testCase.outputs.doubled),
      [
        { type: 'number', value: 10 },
        { type: 'number', value: 6 },
      ],
    );
  });

  it('only overrides locked constants and declared parameter cells', () => {
    const withInput = (sheet: string, cell: string, value: string | number) =>
      makePricingGradingConfig({
        test_cases: [{ name: 'case', inputs: [{ sheet, cell, value }] }],
      });

    assert.throws(
      () => gradePricing({}, withInput('Inputs', 'D2', 1)),
      /cannot override Inputs!D2/,
    );
    assert.throws(
      () => gradePricing({}, withInput('Inputs', 'A2', '=1+1')),
      /constant, not a formula/,
    );
    assert.throws(() => gradePricing({}, withInput('Inputs', 'E9', 1)), /unknown cell Inputs!E9/);
    assert.throws(() => gradePricing({}, withInput('Private', 'A1', 1)), /unknown cell Private!A1/);
    assert.throws(
      () =>
        evaluateSpreadsheet(makeOffsetConfig(), makeSubmission(), {
          ...makeSourceGradingConfig(),
          test_cases: [{ name: 'formula', inputs: [{ sheet: 'Inputs', cell: 'C2', value: 1 }] }],
        }),
      /cannot override Inputs!C2/,
    );
    assert.throws(
      () =>
        gradePricing(
          {},
          makePricingGradingConfig({
            test_cases: [
              { name: 'same', inputs: [] },
              { name: 'same', inputs: [] },
            ],
          }),
        ),
      /"same" is duplicated/,
    );
    assert.throws(
      () =>
        gradePricing(
          {},
          makePricingGradingConfig({ parameters: [{ sheet: 'Inputs', range: 'E1' }] }),
        ),
      /must be inside a student range/,
    );
  });

  it('caps the number of exported grading results', () => {
    const outputs = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [
        `output_${index}`,
        { sheet: 'Inputs', cell: 'D2' },
      ]),
    );
    const testCases = Array.from({ length: 50 }, (_, index) => ({
      name: `case ${index}`,
      inputs: [],
    }));
    assert.throws(
      () => gradePricing({}, makePricingGradingConfig({ outputs, test_cases: testCases })),
      /at most 5000 results/,
    );
  });
});

describe('spreadsheet reference solutions', () => {
  const referenceConfig = (reference = PRICING_REFERENCE) =>
    makePricingGradingConfig({ reference });

  it('compares student and reference results across every test case', () => {
    const { grading, serialized } = gradePricing(
      { Inputs: { C2: 1, D2: '=B2*A2-C2' } },
      referenceConfig(),
    );

    assert.deepEqual(grading.reference, {
      cells: {
        'Inputs!D2': {
          base: {
            student: { type: 'number', value: 11 },
            reference: { type: 'number', value: 11 },
            match: true,
          },
          cases: [
            {
              student: { type: 'number', value: -1 },
              reference: { type: 'number', value: -1 },
              match: true,
            },
            {
              student: { type: 'number', value: 25 },
              reference: { type: 'number', value: 25 },
              match: true,
            },
          ],
        },
      },
      outputs: undefined,
      summary: { matched: 3, total: 3 },
    });
    assert.notInclude(serialized, 'A2*B2-C2');
  });

  it('fails hardcoded values on the hidden test cases', () => {
    const { grading } = gradePricing({ Inputs: { C2: 1, D2: 11 } }, referenceConfig());
    const series = grading.reference!.cells['Inputs!D2'];

    assert.isTrue(series.base.match);
    assert.deepEqual(
      series.cases.map((comparison) => comparison.match),
      [false, false],
    );
    assert.deepEqual(grading.reference?.summary, { matched: 1, total: 3 });
  });

  it('accepts equivalent formulas with different anchoring', () => {
    for (const formula of ['=$A$2*$B$2-$C$2', '=B2*A2-C2', '=PRODUCT(A2,B2)-C2']) {
      const { grading } = gradePricing({ Inputs: { C2: 1, D2: formula } }, referenceConfig());
      assert.deepEqual(grading.reference?.summary, { matched: 3, total: 3 }, formula);
    }
  });

  it('compares numbers with relative and absolute tolerances', () => {
    const nearlyEqual = { Inputs: { C2: 1, D2: '=(A2*B2-C2)*1.005' } };
    assert.deepEqual(gradePricing(nearlyEqual, referenceConfig()).grading.reference?.summary, {
      matched: 3,
      total: 3,
    });

    const strict = {
      ...PRICING_REFERENCE,
      cells: [{ ...PRICING_REFERENCE.cells[0], rtol: 1e-6 }],
    };
    assert.deepEqual(
      gradePricing(nearlyEqual, referenceConfig(strict)).grading.reference?.summary,
      {
        matched: 0,
        total: 3,
      },
    );

    const absolute = {
      ...PRICING_REFERENCE,
      cells: [{ ...PRICING_REFERENCE.cells[0], rtol: 0, atol: 0.5 }],
    };
    const offByAQuarter = { Inputs: { C2: 1, D2: '=A2*B2-C2+0.25' } };
    assert.deepEqual(
      gradePricing(offByAQuarter, referenceConfig(absolute)).grading.reference?.summary,
      { matched: 3, total: 3 },
    );
  });

  it('compares error results by error type and types strictly', () => {
    const reference = {
      ...PRICING_REFERENCE,
      cells: [{ sheet: 'Inputs', cell: 'D2', input: '=B2/A2' }],
    };
    const dividing = gradePricing({ Inputs: { D2: '=B2/A2' } }, referenceConfig(reference));
    assert.deepEqual(dividing.grading.reference?.cells['Inputs!D2'].cases[0], {
      student: { type: 'error', value: '#DIV/0!', error_type: 'DIV_BY_ZERO' },
      reference: { type: 'error', value: '#DIV/0!', error_type: 'DIV_BY_ZERO' },
      match: true,
    });

    const guarded = gradePricing(
      { Inputs: { D2: '=IFERROR(B2/A2,0)' } },
      referenceConfig(reference),
    );
    assert.isFalse(guarded.grading.reference?.cells['Inputs!D2'].cases[0].match);

    const text = gradePricing({ Inputs: { C2: 1, D2: '=TEXT(11,"0")' } }, referenceConfig());
    assert.isFalse(text.grading.reference?.cells['Inputs!D2'].base.match);
  });

  it('keeps student parameter values in the reference workbook', () => {
    const { grading } = gradePricing({ Inputs: { C2: 2, D2: '=A2*B2-C2' } }, referenceConfig());
    assert.deepEqual(grading.reference?.cells['Inputs!D2'].base.reference, {
      type: 'number',
      value: 10,
    });
  });

  it('optionally compares named outputs', () => {
    const { grading } = gradePricing(
      { Inputs: { C2: 1, D2: 11 } },
      referenceConfig({ ...PRICING_REFERENCE, compare_outputs: true }),
    );
    assert.deepEqual(
      grading.reference?.outputs?.total.cases.map((comparison) => comparison.match),
      [false, false],
    );
    assert.deepEqual(grading.reference?.summary, { matched: 2, total: 6 });
  });

  it('does not require named outputs when a reference is configured', () => {
    const { grading } = gradePricing(
      { Inputs: { C2: 1, D2: '=A2*B2-C2' } },
      makePricingGradingConfig({ outputs: {}, reference: PRICING_REFERENCE }),
    );
    assert.deepEqual(grading.outputs, {});
    assert.deepEqual(grading.reference?.summary, { matched: 3, total: 3 });
    assert.throws(
      () => gradePricing({}, makePricingGradingConfig({ outputs: {} })),
      /at least one output or a reference solution/,
    );
  });

  it('treats invalid reference solutions as authoring errors', () => {
    const withReference = (cell: string, input: string) =>
      referenceConfig({ ...PRICING_REFERENCE, cells: [{ sheet: 'Inputs', cell, input }] });

    for (const [cell, input, message] of [
      ['D2', '=RAND()', /reference solution is invalid: Function RAND/],
      ['D2', '=Z99', /reference solution is invalid: .*outside declared student ranges/],
      ['B2', '=1', /must be editable/],
      ['C2', '=1', /cannot also be a parameter/],
    ] as const) {
      try {
        gradePricing({ Inputs: { C2: 1 } }, withReference(cell, input));
        assert.fail(`Expected ${input} in ${cell} to be rejected`);
      } catch (error) {
        assert.notInstanceOf(error, SpreadsheetSubmissionError);
        assert.match((error as Error).message, message);
      }
    }
  });
});

describe('addSpreadsheetReferenceAnswers', () => {
  const params = { _pl_spreadsheet_v2: { model: makePricingConfig() } };

  it('evaluates the reference workbook on the template for the answer panel', () => {
    const correctAnswers = addSpreadsheetReferenceAnswers({
      params,
      correctAnswers: {
        model: makePricingGradingConfig({ reference: PRICING_REFERENCE }),
        other: 42,
      },
    });

    const gradingConfig = SpreadsheetGradingConfigSchema.parse(correctAnswers.model);
    assert.deepEqual(gradingConfig.answer?.sheets[0].cells.D2, {
      input: { type: 'formula', value: '=A2*B2-C2' },
      result: { type: 'number', value: 12 },
    });
    assert.deepEqual(gradingConfig.answer?.sheets[0].cells.A2, {
      input: { type: 'number', value: 3 },
      result: { type: 'number', value: 3 },
    });
    assert.equal(correctAnswers.other, 42);

    const normalized = normalizeSpreadsheetAnswers({
      params,
      correctAnswers,
      submittedAnswers: {
        model: JSON.stringify(makeSubmission({ Inputs: { C2: 1, D2: '=B2*A2-C2' } })),
      },
    });
    const serialized = JSON.stringify(normalized.model);
    assert.include(serialized, '"matched":3');
    assert.notInclude(serialized, 'A2*B2-C2');
  });

  it('leaves grading configs without a reference unchanged', () => {
    const correctAnswers = { model: makePricingGradingConfig() };
    assert.deepEqual(addSpreadsheetReferenceAnswers({ params, correctAnswers }), correctAnswers);
    assert.deepEqual(
      addSpreadsheetReferenceAnswers({ params: {}, correctAnswers }),
      correctAnswers,
    );
  });

  it('reports invalid reference solutions as authoring errors', () => {
    const reference = {
      ...PRICING_REFERENCE,
      cells: [{ sheet: 'Inputs', cell: 'D2', input: '=NOSUCH(A2)' }],
    };
    try {
      addSpreadsheetReferenceAnswers({
        params,
        correctAnswers: { model: makePricingGradingConfig({ reference }) },
      });
      assert.fail('Expected the reference solution to be rejected');
    } catch (error) {
      assert.notInstanceOf(error, SpreadsheetSubmissionError);
      assert.match((error as Error).message, /reference solution for "model" is invalid/);
    }
  });
});

describe('normalizeSpreadsheetAnswers', () => {
  it('replaces raw input with a trusted snapshot', () => {
    const normalized = normalizeSpreadsheetAnswers({
      params: { _pl_spreadsheet_v2: { answer: makeConfig() } },
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
      params: { _pl_spreadsheet_v2: { answer: makeConfig() } },
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
      params: { _pl_spreadsheet_v2: { answer: makeConfig() } },
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
      params: { _pl_spreadsheet_v2: { answer: makeConfig() } },
      correctAnswers: {},
      submittedAnswers: {
        answer: JSON.stringify({
          ...makeSubmission(),
          grading: {
            schema_version: 2,
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
    assert.deepEqual(getSpreadsheetLogMetadata({ _pl_spreadsheet_v2: { answer: makeConfig() } }), {
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
      spreadsheet_grading_test_cases: 0,
      spreadsheet_grading_reference_cells: 0,
    });
  });

  it('counts private grading structure without logging contents', () => {
    assert.deepEqual(
      getSpreadsheetLogMetadata(
        { _pl_spreadsheet_v2: { answer: makeConfig() } },
        { answer: makeGradingConfig() },
      ),
      {
        spreadsheet_elements: 1,
        spreadsheet_sheets: 2,
        spreadsheet_addressable_cells: 16,
        spreadsheet_populated_cells: 6,
        spreadsheet_formulas: 1,
        spreadsheet_grading_sheets: 4,
        spreadsheet_grading_addressable_cells: 23,
        spreadsheet_grading_populated_cells: 12,
        spreadsheet_grading_formulas: 7,
        spreadsheet_grading_outputs: 7,
        spreadsheet_grading_test_cases: 0,
        spreadsheet_grading_reference_cells: 0,
      },
    );
  });
});
