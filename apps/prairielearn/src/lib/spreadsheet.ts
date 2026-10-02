import {
  DetailedCellError,
  ErrorType,
  HyperFormula,
  type RawCellContent,
  type SimpleCellAddress,
} from 'hyperformula';
import * as z from 'zod/v4';

export const SPREADSHEET_ENGINE_VERSION = '3.4.0';
export const SPREADSHEET_CONFIGURATION_VERSION = 2;
export const SPREADSHEET_MAX_SHEETS = 10;
export const SPREADSHEET_MAX_ROWS = 1000;
export const SPREADSHEET_MAX_COLUMNS = 100;
export const SPREADSHEET_MAX_ADDRESSABLE_CELLS = 10_000;
export const SPREADSHEET_MAX_POPULATED_CELLS = 2500;
export const SPREADSHEET_MAX_FORMULAS = 1000;
export const SPREADSHEET_MAX_FORMULA_LENGTH = 2048;
export const SPREADSHEET_MAX_TEXT_LENGTH = 32 * 1024;
export const SPREADSHEET_MAX_PAYLOAD_BYTES = 1024 * 1024;
export const SPREADSHEET_MAX_GRADING_OUTPUTS = 100;
export const SPREADSHEET_MAX_PARAMETER_RANGES = 100;
export const SPREADSHEET_MAX_TEST_CASES = 50;
export const SPREADSHEET_MAX_TEST_CASE_INPUTS = 100;
export const SPREADSHEET_MAX_REFERENCE_CELLS = 500;
export const SPREADSHEET_MAX_GRADING_RESULTS = 5000;
export const SPREADSHEET_DEFAULT_RTOL = 1e-2;
export const SPREADSHEET_DEFAULT_ATOL = 1e-8;
export const SPREADSHEET_INTERNAL_SHEET_PREFIX = '__PL_STUDENT_';

export const SPREADSHEET_ALLOWED_FUNCTIONS = new Set([
  'ABS',
  'AND',
  'AVERAGE',
  'AVERAGEIF',
  'AVERAGEIFS',
  'CONCATENATE',
  'COS',
  'COUNT',
  'COUNTA',
  'COUNTBLANK',
  'COUNTIF',
  'COUNTIFS',
  'DATE',
  'DAY',
  'DAYS',
  'DEGREES',
  'EDATE',
  'EOMONTH',
  'EXP',
  'FALSE',
  'HLOOKUP',
  'IF',
  'IFERROR',
  'IFNA',
  'INDEX',
  'INT',
  'ISBLANK',
  'ISERROR',
  'ISLOGICAL',
  'ISNUMBER',
  'ISTEXT',
  'LEFT',
  'LEN',
  'LN',
  'LOG',
  'LOG10',
  'LOWER',
  'MATCH',
  'MAX',
  'MEDIAN',
  'MID',
  'MIN',
  'MOD',
  'MONTH',
  'NOT',
  'OR',
  'PI',
  'POWER',
  'PRODUCT',
  'RADIANS',
  'RIGHT',
  'ROUND',
  'ROUNDDOWN',
  'ROUNDUP',
  'SIN',
  'SQRT',
  'SUM',
  'SUMIF',
  'SUMIFS',
  'SUMPRODUCT',
  'SWITCH',
  'TAN',
  'TEXT',
  'TRIM',
  'TRUE',
  'UPPER',
  'VALUE',
  'VLOOKUP',
  'XOR',
  'YEAR',
]);

const CellInputSchema = z.union([
  z.string().max(SPREADSHEET_MAX_TEXT_LENGTH),
  z.number(),
  z.boolean(),
]);
const RawCellInputSchema = CellInputSchema.nullable();
const BLOCKED_SHEET_NAME_CHARACTERS = new Set(['!', ':', '<', '>', '{', '}', '[', ']', '\0']);

function isValidSheetName(name: string): boolean {
  const characters = [...name];
  return (
    characters.length > 0 &&
    characters.length <= 31 &&
    name.trim() === name &&
    !name.toLocaleUpperCase('en-US').startsWith(SPREADSHEET_INTERNAL_SHEET_PREFIX) &&
    !characters.some((character) => BLOCKED_SHEET_NAME_CHARACTERS.has(character))
  );
}

const SpreadsheetSheetTemplateSchema = z
  .object({
    name: z.string().refine(isValidSheetName),
    rows: z.number().int().min(1).max(SPREADSHEET_MAX_ROWS),
    columns: z.number().int().min(1).max(SPREADSHEET_MAX_COLUMNS),
    cells: z.record(z.string(), CellInputSchema),
    editable_ranges: z.array(z.string()).max(100),
  })
  .strict();

export const SpreadsheetTemplateSchema = z
  .object({
    schema_version: z.literal(2),
    sheets: z.array(SpreadsheetSheetTemplateSchema).min(1).max(SPREADSHEET_MAX_SHEETS),
  })
  .strict();

export type SpreadsheetTemplate = z.infer<typeof SpreadsheetTemplateSchema>;
export type SpreadsheetCellInput = z.infer<typeof CellInputSchema>;

export const SpreadsheetElementConfigSchema = z
  .object({
    schema_version: z.literal(2),
    template_hash: z.string().min(1),
    template: SpreadsheetTemplateSchema,
    allow_blank: z.boolean().optional(),
    aria_label: z.string().optional(),
    height: z.string().optional(),
  })
  .strict();

export type SpreadsheetElementConfig = z.infer<typeof SpreadsheetElementConfigSchema>;

const SnapshotInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('number'), value: z.number() }).strict(),
  z.object({ type: z.literal('string'), value: z.string() }).strict(),
  z.object({ type: z.literal('boolean'), value: z.boolean() }).strict(),
  z.object({ type: z.literal('formula'), value: z.string() }).strict(),
]);

export const SpreadsheetSnapshotResultSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('empty') }).strict(),
  z.object({ type: z.literal('number'), value: z.number() }).strict(),
  z.object({ type: z.literal('string'), value: z.string() }).strict(),
  z.object({ type: z.literal('boolean'), value: z.boolean() }).strict(),
  z
    .object({
      type: z.literal('error'),
      value: z.string(),
      error_type: z.string(),
    })
    .strict(),
]);

const SpreadsheetSnapshotCellSchema = z
  .object({ input: SnapshotInputSchema, result: SpreadsheetSnapshotResultSchema })
  .strict();

const SpreadsheetSnapshotSheetSchema = z
  .object({
    name: z.string(),
    rows: z.number().int(),
    columns: z.number().int(),
    cells: z.record(z.string(), SpreadsheetSnapshotCellSchema),
  })
  .strict();

const SpreadsheetGradingSheetSchema = z
  .object({
    name: z.string().refine(isValidSheetName),
    rows: z.number().int().min(1).max(SPREADSHEET_MAX_ROWS),
    columns: z.number().int().min(1).max(SPREADSHEET_MAX_COLUMNS),
    cells: z.record(z.string(), CellInputSchema),
  })
  .strict();

const SpreadsheetGradingOutputSchema = z
  .object({
    sheet: z.string().min(1),
    cell: z.string().min(1),
    required: z.boolean().optional(),
  })
  .strict();

const SpreadsheetStudentOverlaySchema = z
  .object({
    student_sheet: z.string().min(1),
    source_sheet: z.string().min(1),
    source_range: z.string().min(1),
  })
  .strict();

const SpreadsheetParameterSchema = z
  .object({
    sheet: z.string().min(1),
    range: z.string().min(1),
  })
  .strict();

const SpreadsheetTestCaseSchema = z
  .object({
    name: z.string().min(1).max(128),
    inputs: z
      .array(
        z
          .object({
            sheet: z.string().min(1),
            cell: z.string().min(1),
            value: RawCellInputSchema,
          })
          .strict(),
      )
      .max(SPREADSHEET_MAX_TEST_CASE_INPUTS),
  })
  .strict();

const ToleranceSchema = z.number().nonnegative();

const SpreadsheetReferenceSchema = z
  .object({
    cells: z
      .array(
        z
          .object({
            sheet: z.string().min(1),
            cell: z.string().min(1),
            // Student-relative input, so the reference evaluates exactly like a submission.
            input: CellInputSchema,
            rtol: ToleranceSchema.optional(),
            atol: ToleranceSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(SPREADSHEET_MAX_REFERENCE_CELLS),
    rtol: ToleranceSchema,
    atol: ToleranceSchema,
    compare_outputs: z.boolean(),
  })
  .strict();

export const SpreadsheetGradingConfigSchema = z
  .object({
    schema_version: z.literal(2),
    grader_hash: z.string().min(1),
    sheets: z.array(SpreadsheetGradingSheetSchema).max(SPREADSHEET_MAX_SHEETS),
    source_sheets: z.array(SpreadsheetGradingSheetSchema).max(SPREADSHEET_MAX_SHEETS),
    student_overlays: z.array(SpreadsheetStudentOverlaySchema).min(1).max(SPREADSHEET_MAX_SHEETS),
    outputs: z
      .record(z.string().min(1).max(128), SpreadsheetGradingOutputSchema)
      .refine((outputs) => Object.keys(outputs).length <= SPREADSHEET_MAX_GRADING_OUTPUTS),
    parameters: z
      .array(SpreadsheetParameterSchema)
      .max(SPREADSHEET_MAX_PARAMETER_RANGES)
      .optional(),
    test_cases: z.array(SpreadsheetTestCaseSchema).max(SPREADSHEET_MAX_TEST_CASES).optional(),
    reference: SpreadsheetReferenceSchema.optional(),
    // The reference workbook evaluated on the template, added when the variant is
    // prepared and used only to render the answer panel.
    answer: z
      .object({ sheets: z.array(SpreadsheetSnapshotSheetSchema) })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (config) => config.sheets.length + config.source_sheets.length >= 1,
    'A private spreadsheet grading workbook must contain at least one sheet.',
  )
  .refine(
    (config) => config.sheets.length + config.source_sheets.length <= SPREADSHEET_MAX_SHEETS,
    `A private spreadsheet grading workbook may contain at most ${SPREADSHEET_MAX_SHEETS} sheets.`,
  );

export type SpreadsheetGradingConfig = z.infer<typeof SpreadsheetGradingConfigSchema>;

export const SpreadsheetRawSubmissionSchema = z
  .object({
    schema_version: z.literal(2),
    template_hash: z.string(),
    sheets: z.record(z.string(), z.record(z.string(), RawCellInputSchema)),
  })
  .strict();

export type SpreadsheetRawSubmission = z.infer<typeof SpreadsheetRawSubmissionSchema>;

type SpreadsheetSnapshotResult = z.infer<typeof SpreadsheetSnapshotResultSchema>;

const SpreadsheetComparisonSchema = z
  .object({
    student: SpreadsheetSnapshotResultSchema,
    reference: SpreadsheetSnapshotResultSchema,
    match: z.boolean(),
  })
  .strict();

const SpreadsheetComparisonSeriesSchema = z
  .object({
    base: SpreadsheetComparisonSchema,
    cases: z.array(SpreadsheetComparisonSchema),
  })
  .strict();

type SpreadsheetComparisonSeries = z.infer<typeof SpreadsheetComparisonSeriesSchema>;

export const SpreadsheetSnapshotSchema = z
  .object({
    schema_version: z.literal(2),
    template_hash: z.string(),
    engine: z
      .object({
        name: z.literal('hyperformula'),
        version: z.literal(SPREADSHEET_ENGINE_VERSION),
        configuration_version: z.literal(SPREADSHEET_CONFIGURATION_VERSION),
      })
      .strict(),
    sheets: z.array(SpreadsheetSnapshotSheetSchema),
    grading: z
      .object({
        schema_version: z.literal(2),
        grader_hash: z.string(),
        outputs: z.record(z.string(), SpreadsheetSnapshotResultSchema),
        cases: z
          .array(
            z
              .object({
                name: z.string(),
                outputs: z.record(z.string(), SpreadsheetSnapshotResultSchema),
              })
              .strict(),
          )
          .optional(),
        reference: z
          .object({
            cells: z.record(z.string(), SpreadsheetComparisonSeriesSchema),
            outputs: z.record(z.string(), SpreadsheetComparisonSeriesSchema).optional(),
            summary: z.object({ matched: z.number().int(), total: z.number().int() }).strict(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type SpreadsheetSnapshot = z.infer<typeof SpreadsheetSnapshotSchema>;

const SpreadsheetSubmissionErrorSchema = z
  .object({
    schema_version: z.literal(2),
    template_hash: z.string(),
    error: z.string(),
  })
  .strict();

export interface SpreadsheetEvaluation {
  snapshot: SpreadsheetSnapshot;
  engine: HyperFormula;
}

export interface SpreadsheetEditorCellIssue {
  message: string;
  value: string;
  error_type: string;
}

export interface SpreadsheetEditorEvaluation extends SpreadsheetEvaluation {
  issues: Partial<Record<string, Partial<Record<string, SpreadsheetEditorCellIssue>>>>;
}

export class SpreadsheetSubmissionError extends Error {}

export function getRelativeFillInput(
  engine: HyperFormula,
  source: SimpleCellAddress,
  target: SimpleCellAddress,
): SpreadsheetCellInput | null {
  const input = engine.getFillRangeData(
    { start: source, end: source },
    { start: target, end: target },
  )[0]?.[0];
  if (input instanceof Date) {
    throw new SpreadsheetSubmissionError('Date-valued cell inputs are not supported.');
  }
  return input ?? null;
}

export function columnIndexToName(column: number): string {
  let value = column + 1;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

export interface SpreadsheetCellAddress {
  row: number;
  column: number;
}

export function parseCellAddress(address: string): SpreadsheetCellAddress | null {
  const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(address.toUpperCase());
  if (!match) return null;
  let column = 0;
  for (const character of match[1]) {
    column = column * 26 + character.charCodeAt(0) - 64;
  }
  return { row: Number(match[2]) - 1, column: column - 1 };
}

export function cellAddress(row: number, column: number): string {
  return `${columnIndexToName(column)}${row + 1}`;
}

export interface SpreadsheetCellRange {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

export function parseRange(range: string): SpreadsheetCellRange | null {
  const parts = range.toUpperCase().split(':');
  if (parts.length > 2) return null;
  const startText = parts[0];
  if (!startText) return null;
  const endText = parts[1] ?? startText;
  const start = parseCellAddress(startText);
  const end = parseCellAddress(endText);
  if (!start || !end) return null;
  return {
    startRow: Math.min(start.row, end.row),
    endRow: Math.max(start.row, end.row),
    startColumn: Math.min(start.column, end.column),
    endColumn: Math.max(start.column, end.column),
  };
}

export function sheetRange(
  sheet: Pick<SpreadsheetTemplate['sheets'][number], 'rows' | 'columns'>,
): SpreadsheetCellRange {
  return {
    startRow: 0,
    endRow: sheet.rows - 1,
    startColumn: 0,
    endColumn: sheet.columns - 1,
  };
}

export interface SpreadsheetAddressSpace {
  sourceRange: SpreadsheetCellRange;
  studentRange: SpreadsheetCellRange;
}

export function isValidCellRange(range: SpreadsheetCellRange): boolean {
  return (
    range.startRow >= 0 &&
    range.startColumn >= 0 &&
    range.startRow <= range.endRow &&
    range.startColumn <= range.endColumn
  );
}

export function createSpreadsheetAddressSpace(
  sourceRange: SpreadsheetCellRange,
): SpreadsheetAddressSpace {
  if (!isValidCellRange(sourceRange)) {
    throw new RangeError('Spreadsheet source range is invalid.');
  }
  return {
    sourceRange: { ...sourceRange },
    studentRange: {
      startRow: 0,
      endRow: sourceRange.endRow - sourceRange.startRow,
      startColumn: 0,
      endColumn: sourceRange.endColumn - sourceRange.startColumn,
    },
  };
}

export function isRangeContained(
  outer: SpreadsheetCellRange,
  inner: SpreadsheetCellRange,
): boolean {
  return (
    outer.startRow <= inner.startRow &&
    outer.endRow >= inner.endRow &&
    outer.startColumn <= inner.startColumn &&
    outer.endColumn >= inner.endColumn
  );
}

export function intersectRanges(
  first: SpreadsheetCellRange,
  second: SpreadsheetCellRange,
): SpreadsheetCellRange | null {
  const intersection = {
    startRow: Math.max(first.startRow, second.startRow),
    endRow: Math.min(first.endRow, second.endRow),
    startColumn: Math.max(first.startColumn, second.startColumn),
    endColumn: Math.min(first.endColumn, second.endColumn),
  };
  return intersection.startRow <= intersection.endRow &&
    intersection.startColumn <= intersection.endColumn
    ? intersection
    : null;
}

export function toSourceAddress(
  addressSpace: SpreadsheetAddressSpace,
  student: SpreadsheetCellAddress,
): SpreadsheetCellAddress {
  const range = addressSpace.sourceRange;
  const source = {
    row: range.startRow + student.row,
    column: range.startColumn + student.column,
  };
  if (
    source.row > range.endRow ||
    source.column > range.endColumn ||
    student.row < 0 ||
    student.column < 0
  ) {
    throw new RangeError('Student spreadsheet address is outside its address space.');
  }
  return source;
}

export function toRelativeAddress(
  addressSpace: SpreadsheetAddressSpace,
  source: SpreadsheetCellAddress,
): SpreadsheetCellAddress {
  const range = addressSpace.sourceRange;
  if (
    source.row < range.startRow ||
    source.row > range.endRow ||
    source.column < range.startColumn ||
    source.column > range.endColumn
  ) {
    throw new RangeError('Spreadsheet address is outside its range.');
  }
  return { row: source.row - range.startRow, column: source.column - range.startColumn };
}

export function toSourceRange(
  addressSpace: SpreadsheetAddressSpace,
  student: SpreadsheetCellRange,
): SpreadsheetCellRange {
  if (!isValidCellRange(student) || !isRangeContained(addressSpace.studentRange, student)) {
    throw new RangeError('Student spreadsheet range is outside its address space.');
  }
  const start = toSourceAddress(addressSpace, {
    row: student.startRow,
    column: student.startColumn,
  });
  const end = toSourceAddress(addressSpace, {
    row: student.endRow,
    column: student.endColumn,
  });
  return {
    startRow: start.row,
    endRow: end.row,
    startColumn: start.column,
    endColumn: end.column,
  };
}

export function toRelativeRange(
  addressSpace: SpreadsheetAddressSpace,
  source: SpreadsheetCellRange,
): SpreadsheetCellRange {
  if (!isValidCellRange(source) || !isRangeContained(addressSpace.sourceRange, source)) {
    throw new RangeError('Spreadsheet source range is outside its address space.');
  }
  const start = toRelativeAddress(addressSpace, {
    row: source.startRow,
    column: source.startColumn,
  });
  const end = toRelativeAddress(addressSpace, {
    row: source.endRow,
    column: source.endColumn,
  });
  return {
    startRow: start.row,
    endRow: end.row,
    startColumn: start.column,
    endColumn: end.column,
  };
}

export function isCellVisible(
  sheet: SpreadsheetTemplate['sheets'][number],
  row: number,
  column: number,
): boolean {
  const range = sheetRange(sheet);
  return (
    row >= range.startRow &&
    row <= range.endRow &&
    column >= range.startColumn &&
    column <= range.endColumn
  );
}

export function isCellEditable(
  sheet: SpreadsheetTemplate['sheets'][number],
  row: number,
  column: number,
): boolean {
  return sheet.editable_ranges.some((rangeText) => {
    const range = parseRange(rangeText);
    return (
      range !== null &&
      row >= range.startRow &&
      row <= range.endRow &&
      column >= range.startColumn &&
      column <= range.endColumn
    );
  });
}

function formulaWithoutStrings(formula: string): string {
  let result = '';
  let inString = false;
  for (let index = 0; index < formula.length; index += 1) {
    const character = formula[index];
    if (character === '"') {
      if (inString && formula[index + 1] === '"') {
        index += 1;
      } else {
        inString = !inString;
      }
      result += ' ';
    } else {
      result += inString ? ' ' : character;
    }
  }
  return result;
}

export function validateFormula(formula: string): string | null {
  if (formula.length > SPREADSHEET_MAX_FORMULA_LENGTH) {
    return `Formulas must be at most ${SPREADSHEET_MAX_FORMULA_LENGTH} characters.`;
  }
  const source = formulaWithoutStrings(formula);
  if (source.includes('[') || source.includes(']') || source.includes('{')) {
    return 'External references, structured references, and array formulas are not supported.';
  }
  const functions = source.matchAll(/\b([A-Z][A-Z0-9.]*)\s*\(/gi);
  for (const match of functions) {
    const functionName = match[1].toUpperCase();
    if (!SPREADSHEET_ALLOWED_FUNCTIONS.has(functionName)) {
      return `Function ${functionName} is not supported.`;
    }
  }
  return null;
}

function validateTemplate(template: SpreadsheetTemplate): void {
  if (template.sheets.length === 0 || template.sheets.length > SPREADSHEET_MAX_SHEETS) {
    throw new SpreadsheetSubmissionError(
      `Spreadsheet templates must contain 1 to ${SPREADSHEET_MAX_SHEETS} sheets.`,
    );
  }
  let addressableCells = 0;
  let populatedCells = 0;
  let formulas = 0;
  const sheetNames = new Set<string>();

  for (const sheet of template.sheets) {
    if (!isValidSheetName(sheet.name)) {
      throw new SpreadsheetSubmissionError(
        `Sheet ${sheet.name} must have a non-empty name of at most 31 characters without leading or trailing whitespace. The characters !, :, <, >, {, }, [, ], and null are not allowed.`,
      );
    }
    if (sheet.rows < 1 || sheet.rows > SPREADSHEET_MAX_ROWS) {
      throw new SpreadsheetSubmissionError(
        `Sheet ${sheet.name} must contain 1 to ${SPREADSHEET_MAX_ROWS} rows.`,
      );
    }
    if (sheet.columns < 1 || sheet.columns > SPREADSHEET_MAX_COLUMNS) {
      throw new SpreadsheetSubmissionError(
        `Sheet ${sheet.name} must contain 1 to ${SPREADSHEET_MAX_COLUMNS} columns.`,
      );
    }
    const foldedName = sheet.name.toLocaleLowerCase('en-US');
    if (sheetNames.has(foldedName)) {
      throw new SpreadsheetSubmissionError(`Sheet name ${sheet.name} is duplicated.`);
    }
    sheetNames.add(foldedName);
    addressableCells += sheet.rows * sheet.columns;
    const visibleRange = sheetRange(sheet);

    for (const [address, input] of Object.entries(sheet.cells)) {
      const parsedAddress = parseCellAddress(address);
      if (
        !parsedAddress ||
        parsedAddress.row >= sheet.rows ||
        parsedAddress.column >= sheet.columns
      ) {
        throw new SpreadsheetSubmissionError(`Cell ${address} is outside sheet ${sheet.name}.`);
      }
      populatedCells += 1;
      if (typeof input === 'string' && input.startsWith('=')) {
        formulas += 1;
        const formulaError = validateFormula(input);
        if (formulaError) throw new SpreadsheetSubmissionError(formulaError);
      }
    }

    for (const rangeText of sheet.editable_ranges) {
      const range = parseRange(rangeText);
      if (
        !range ||
        range.endRow >= sheet.rows ||
        range.endColumn >= sheet.columns ||
        !isRangeContained(visibleRange, range)
      ) {
        throw new SpreadsheetSubmissionError(
          `Editable range ${rangeText} is outside sheet ${sheet.name}.`,
        );
      }
    }
  }

  if (addressableCells > SPREADSHEET_MAX_ADDRESSABLE_CELLS) {
    throw new SpreadsheetSubmissionError(
      `Spreadsheet templates may contain at most ${SPREADSHEET_MAX_ADDRESSABLE_CELLS} cells.`,
    );
  }
  if (populatedCells > SPREADSHEET_MAX_POPULATED_CELLS) {
    throw new SpreadsheetSubmissionError(
      `Spreadsheets may contain at most ${SPREADSHEET_MAX_POPULATED_CELLS} populated cells.`,
    );
  }
  if (formulas > SPREADSHEET_MAX_FORMULAS) {
    throw new SpreadsheetSubmissionError(
      `Spreadsheets may contain at most ${SPREADSHEET_MAX_FORMULAS} formulas.`,
    );
  }
}

function validateGradingConfig(
  config: SpreadsheetGradingConfig,
  template: SpreadsheetTemplate,
): void {
  const { answer: _answer, ...authoredConfig } = config;
  if (
    new TextEncoder().encode(JSON.stringify(authoredConfig)).byteLength >
    SPREADSHEET_MAX_PAYLOAD_BYTES
  ) {
    throw new Error(
      `Private spreadsheet grading workbooks must be at most ${SPREADSHEET_MAX_PAYLOAD_BYTES} bytes.`,
    );
  }
  if (Object.keys(config.outputs).length === 0 && !config.reference) {
    throw new Error(
      'Private spreadsheet grading workbooks must define at least one output or a reference solution.',
    );
  }
  let addressableCells = 0;
  let populatedCells = 0;
  let formulas = 0;
  const gradingSheetNames = new Set<string>();

  const validateSheets = (sheets: SpreadsheetGradingConfig['sheets'], description: string) => {
    for (const sheet of sheets) {
      if (!isValidSheetName(sheet.name)) {
        throw new Error(
          `${description} ${sheet.name} must have a non-empty name of at most 31 characters without leading or trailing whitespace. The characters !, :, <, >, {, }, [, ], and null are not allowed.`,
        );
      }
      const foldedName = sheet.name.toLocaleLowerCase('en-US');
      if (gradingSheetNames.has(foldedName)) {
        throw new Error(`Private grading sheet name ${sheet.name} is duplicated.`);
      }
      gradingSheetNames.add(foldedName);
      addressableCells += sheet.rows * sheet.columns;

      for (const [address, input] of Object.entries(sheet.cells)) {
        const parsedAddress = parseCellAddress(address);
        if (
          !parsedAddress ||
          parsedAddress.row >= sheet.rows ||
          parsedAddress.column >= sheet.columns
        ) {
          throw new Error(`Cell ${address} is outside ${description.toLowerCase()} ${sheet.name}.`);
        }
        populatedCells += 1;
        if (typeof input === 'string' && input.startsWith('=')) {
          formulas += 1;
          const formulaError = validateFormula(input);
          if (formulaError) throw new Error(formulaError);
        }
      }
    }
  };

  const sourceSheets = config.source_sheets;
  validateSheets(sourceSheets, 'Private source sheet');
  validateSheets(config.sheets, 'Private grading sheet');

  const publicSheetsByName = new Map(template.sheets.map((sheet) => [sheet.name, sheet]));
  const sourceSheetsByName = new Map(sourceSheets.map((sheet) => [sheet.name, sheet]));
  const overlaidStudentSheets = new Set<string>();
  for (const overlay of config.student_overlays) {
    const publicSheet = publicSheetsByName.get(overlay.student_sheet);
    if (!publicSheet) {
      throw new Error(`Student overlay references unknown sheet ${overlay.student_sheet}.`);
    }
    if (overlaidStudentSheets.has(overlay.student_sheet)) {
      throw new Error(`Student sheet ${overlay.student_sheet} has more than one overlay.`);
    }
    overlaidStudentSheets.add(overlay.student_sheet);
    const sourceSheet = sourceSheetsByName.get(overlay.source_sheet);
    if (!sourceSheet) {
      throw new Error(`Student overlay references unknown source sheet ${overlay.source_sheet}.`);
    }
    const sourceRange = parseRange(overlay.source_range);
    if (
      !sourceRange ||
      sourceRange.endRow >= sourceSheet.rows ||
      sourceRange.endColumn >= sourceSheet.columns ||
      sourceRange.endRow - sourceRange.startRow + 1 !== publicSheet.rows ||
      sourceRange.endColumn - sourceRange.startColumn + 1 !== publicSheet.columns
    ) {
      throw new Error(
        `Student overlay for ${overlay.student_sheet} must be within ${overlay.source_sheet} and have the same shape.`,
      );
    }
  }
  if (overlaidStudentSheets.size !== template.sheets.length) {
    throw new Error('Every student sheet must have exactly one private source overlay.');
  }

  if (addressableCells > SPREADSHEET_MAX_ADDRESSABLE_CELLS) {
    throw new Error(
      `Private grading workbooks may contain at most ${SPREADSHEET_MAX_ADDRESSABLE_CELLS} cells.`,
    );
  }
  if (populatedCells > SPREADSHEET_MAX_POPULATED_CELLS) {
    throw new Error(
      `Private grading workbooks may contain at most ${SPREADSHEET_MAX_POPULATED_CELLS} populated cells.`,
    );
  }
  if (formulas > SPREADSHEET_MAX_FORMULAS) {
    throw new Error(
      `Private grading workbooks may contain at most ${SPREADSHEET_MAX_FORMULAS} formulas.`,
    );
  }

  const sheetsByName = new Map(
    [...sourceSheets, ...config.sheets].map((sheet) => [sheet.name, sheet]),
  );
  for (const [outputName, output] of Object.entries(config.outputs)) {
    const sheet = sheetsByName.get(output.sheet);
    if (!sheet) {
      throw new Error(
        `Private grading output ${outputName} references unknown sheet ${output.sheet}.`,
      );
    }
    const address = parseCellAddress(output.cell);
    if (!address || address.row >= sheet.rows || address.column >= sheet.columns) {
      throw new Error(
        `Private grading output ${outputName} references a cell outside sheet ${output.sheet}.`,
      );
    }
  }

  validateTestingConfig(config, template);
}

function isFormulaInput(value: SpreadsheetCellInput | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('=');
}

function qualifiedAddress(sheetName: string, address: SpreadsheetCellAddress): string {
  return `${sheetName}!${cellAddress(address.row, address.column)}`;
}

interface ResolvedSourceCell {
  sourceSheet: SpreadsheetGradingConfig['source_sheets'][number];
  address: SpreadsheetCellAddress;
  key: string;
  student: {
    sheet: SpreadsheetTemplate['sheets'][number];
    address: SpreadsheetCellAddress;
  } | null;
}

/**
 * Resolves a source-coordinate cell and, when a student overlay covers it, the
 * student-relative cell that it mirrors.
 */
function resolveSourceCell(
  config: SpreadsheetGradingConfig,
  template: SpreadsheetTemplate,
  sheetName: string,
  cell: string,
): ResolvedSourceCell | null {
  const sourceSheet = config.source_sheets.find((sheet) => sheet.name === sheetName);
  const address = parseCellAddress(cell);
  if (
    !sourceSheet ||
    !address ||
    address.row >= sourceSheet.rows ||
    address.column >= sourceSheet.columns
  ) {
    return null;
  }
  const key = qualifiedAddress(sheetName, address);
  const overlay = config.student_overlays.find((candidate) => candidate.source_sheet === sheetName);
  const sourceRange = overlay ? parseRange(overlay.source_range) : null;
  const studentSheet = template.sheets.find((sheet) => sheet.name === overlay?.student_sheet);
  if (
    !sourceRange ||
    !studentSheet ||
    !isRangeContained(sourceRange, {
      startRow: address.row,
      endRow: address.row,
      startColumn: address.column,
      endColumn: address.column,
    })
  ) {
    return { sourceSheet, address, key, student: null };
  }
  return {
    sourceSheet,
    address,
    key,
    student: {
      sheet: studentSheet,
      address: toRelativeAddress(createSpreadsheetAddressSpace(sourceRange), address),
    },
  };
}

function parameterCells(
  config: SpreadsheetGradingConfig,
  template: SpreadsheetTemplate,
): Map<string, ResolvedSourceCell> {
  const cells = new Map<string, ResolvedSourceCell>();
  for (const parameter of config.parameters ?? []) {
    const range = parseRange(parameter.range);
    const overlay = config.student_overlays.find(
      (candidate) => candidate.source_sheet === parameter.sheet,
    );
    const sourceRange = overlay ? parseRange(overlay.source_range) : null;
    if (!range || !sourceRange || !isRangeContained(sourceRange, range)) {
      throw new Error(
        `Spreadsheet parameter range ${parameter.sheet}!${parameter.range} must be inside a student range.`,
      );
    }
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      for (let column = range.startColumn; column <= range.endColumn; column += 1) {
        const cell = resolveSourceCell(config, template, parameter.sheet, cellAddress(row, column));
        if (cell) cells.set(cell.key, cell);
      }
    }
  }
  return cells;
}

/**
 * Test cases may only override parameter cells: locked non-formula cells, cells
 * that only exist in private source sheets, and editable cells that the author
 * explicitly declared as parameters. Cells where students write formulas are
 * never replaced.
 */
function isOverridableCell(
  cell: ResolvedSourceCell,
  parameters: ReadonlyMap<string, ResolvedSourceCell>,
): boolean {
  if (parameters.has(cell.key)) return true;
  if (!cell.student) {
    return !isFormulaInput(
      cell.sourceSheet.cells[cellAddress(cell.address.row, cell.address.column)],
    );
  }
  const { sheet, address } = cell.student;
  if (isCellEditable(sheet, address.row, address.column)) return false;
  return !isFormulaInput(sheet.cells[cellAddress(address.row, address.column)]);
}

function validateTestingConfig(
  config: SpreadsheetGradingConfig,
  template: SpreadsheetTemplate,
): void {
  const parameters = parameterCells(config, template);

  const caseNames = new Set<string>();
  for (const testCase of config.test_cases ?? []) {
    if (caseNames.has(testCase.name)) {
      throw new Error(`Spreadsheet test case name "${testCase.name}" is duplicated.`);
    }
    caseNames.add(testCase.name);
    const inputKeys = new Set<string>();
    for (const input of testCase.inputs) {
      const resolved = resolveSourceCell(config, template, input.sheet, input.cell);
      if (!resolved) {
        throw new Error(
          `Spreadsheet test case "${testCase.name}" references unknown cell ${input.sheet}!${input.cell}.`,
        );
      }
      if (inputKeys.has(resolved.key)) {
        throw new Error(
          `Spreadsheet test case "${testCase.name}" sets ${resolved.key} more than once.`,
        );
      }
      inputKeys.add(resolved.key);
      if (isFormulaInput(input.value)) {
        throw new Error(
          `Spreadsheet test case "${testCase.name}" must set ${resolved.key} to a constant, not a formula.`,
        );
      }
      if (!isOverridableCell(resolved, parameters)) {
        throw new Error(
          `Spreadsheet test case "${testCase.name}" cannot override ${resolved.key}. Only locked constant cells and declared parameter cells may be overridden.`,
        );
      }
    }
  }

  const referenceKeys = new Set<string>();
  for (const cell of config.reference?.cells ?? []) {
    const resolved = resolveSourceCell(config, template, cell.sheet, cell.cell);
    if (!resolved?.student) {
      throw new Error(
        `Spreadsheet reference cell ${cell.sheet}!${cell.cell} must be inside a student range.`,
      );
    }
    const { sheet, address } = resolved.student;
    if (!isCellEditable(sheet, address.row, address.column)) {
      throw new Error(`Spreadsheet reference cell ${resolved.key} must be editable.`);
    }
    if (parameters.has(resolved.key)) {
      throw new Error(`Spreadsheet reference cell ${resolved.key} cannot also be a parameter.`);
    }
    if (referenceKeys.has(resolved.key)) {
      throw new Error(`Spreadsheet reference cell ${resolved.key} is duplicated.`);
    }
    referenceKeys.add(resolved.key);
  }

  const outputCount = Object.keys(config.outputs).length;
  const comparisonCount =
    referenceKeys.size + (config.reference?.compare_outputs ? outputCount : 0);
  const results = (1 + (config.test_cases?.length ?? 0)) * (outputCount + 2 * comparisonCount);
  if (results > SPREADSHEET_MAX_GRADING_RESULTS) {
    throw new Error(
      `Spreadsheet grading may export at most ${SPREADSHEET_MAX_GRADING_RESULTS} results across all test cases.`,
    );
  }
}

function mergeSubmission(
  config: SpreadsheetElementConfig,
  submission: SpreadsheetRawSubmission,
  issues?: SpreadsheetEditorEvaluation['issues'],
): Record<string, Record<string, SpreadsheetCellInput>> {
  const merged = Object.fromEntries(
    config.template.sheets.map((sheet) => [sheet.name, { ...sheet.cells }]),
  );
  let populatedCells = config.template.sheets.reduce(
    (count, sheet) => count + Object.keys(sheet.cells).length,
    0,
  );
  let formulas = config.template.sheets.reduce(
    (count, sheet) =>
      count +
      Object.values(sheet.cells).filter(
        (value) => typeof value === 'string' && value.startsWith('='),
      ).length,
    0,
  );

  for (const [sheetName, submittedCells] of Object.entries(submission.sheets)) {
    const sheet = config.template.sheets.find((candidate) => candidate.name === sheetName);
    if (!sheet) throw new SpreadsheetSubmissionError(`Unknown sheet ${sheetName}.`);
    const seenAddresses = new Set<string>();
    for (const [rawAddress, input] of Object.entries(submittedCells)) {
      const address = rawAddress.toUpperCase();
      if (seenAddresses.has(address)) {
        throw new SpreadsheetSubmissionError(
          `Cell ${sheetName}!${address} was submitted more than once.`,
        );
      }
      seenAddresses.add(address);
      const parsedAddress = parseCellAddress(address);
      if (
        !parsedAddress ||
        parsedAddress.row >= sheet.rows ||
        parsedAddress.column >= sheet.columns
      ) {
        throw new SpreadsheetSubmissionError(`Cell ${rawAddress} is outside sheet ${sheetName}.`);
      }
      if (!isCellVisible(sheet, parsedAddress.row, parsedAddress.column)) {
        throw new SpreadsheetSubmissionError(
          `Cell ${sheetName}!${address} is outside the student range.`,
        );
      }
      if (!isCellEditable(sheet, parsedAddress.row, parsedAddress.column)) {
        throw new SpreadsheetSubmissionError(`Cell ${sheetName}!${address} is read-only.`);
      }

      if (Object.hasOwn(merged[sheetName], address)) {
        const previous = merged[sheetName][address];
        populatedCells -= 1;
        if (typeof previous === 'string' && previous.startsWith('=')) formulas -= 1;
      }
      if (input === null || input === '') {
        delete merged[sheetName][address];
      } else {
        if (typeof input === 'string' && input.startsWith('=')) {
          const formulaError = validateFormula(input);
          if (formulaError) {
            if (!issues) throw new SpreadsheetSubmissionError(formulaError);
            setSpreadsheetEditorIssue(issues, sheetName, address, {
              message: formulaError,
              value: '#ERROR!',
              error_type: 'ERROR',
            });
          }
          formulas += 1;
        }
        merged[sheetName][address] = input;
        populatedCells += 1;
      }
    }
  }

  if (populatedCells > SPREADSHEET_MAX_POPULATED_CELLS) {
    throw new SpreadsheetSubmissionError(
      `Spreadsheets may contain at most ${SPREADSHEET_MAX_POPULATED_CELLS} populated cells.`,
    );
  }
  if (formulas > SPREADSHEET_MAX_FORMULAS) {
    throw new SpreadsheetSubmissionError(
      `Spreadsheets may contain at most ${SPREADSHEET_MAX_FORMULAS} formulas.`,
    );
  }
  return merged;
}

function snapshotInput(input: SpreadsheetCellInput) {
  if (typeof input === 'number') return { type: 'number' as const, value: input };
  if (typeof input === 'boolean') return { type: 'boolean' as const, value: input };
  if (input.startsWith('=')) return { type: 'formula' as const, value: input };
  return { type: 'string' as const, value: input };
}

function snapshotResult(value: ReturnType<HyperFormula['getCellValue']>) {
  if (value instanceof DetailedCellError) {
    return { type: 'error' as const, value: value.value, error_type: value.type };
  }
  if (value === null) return { type: 'empty' as const };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return { type: 'error' as const, value: '#NUM!', error_type: 'NUM' };
    }
    return { type: 'number' as const, value };
  }
  if (typeof value === 'boolean') return { type: 'boolean' as const, value };
  if (value.length > SPREADSHEET_MAX_TEXT_LENGTH) {
    throw new SpreadsheetSubmissionError(
      `Spreadsheet results must be at most ${SPREADSHEET_MAX_TEXT_LENGTH} characters.`,
    );
  }
  return { type: 'string' as const, value };
}

function buildSheetRows(
  rows: number,
  columns: number,
  cells: Record<string, SpreadsheetCellInput>,
): RawCellContent[][] {
  const data: RawCellContent[][] = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => null),
  );
  for (const [address, input] of Object.entries(cells)) {
    const parsedAddress = parseCellAddress(address);
    if (!parsedAddress) continue;
    data[parsedAddress.row][parsedAddress.column] = input;
  }
  return data;
}

const HYPERFORMULA_CONFIG = {
  language: 'enGB',
  licenseKey: 'gpl-v3',
  maxRows: SPREADSHEET_MAX_ROWS,
  maxColumns: SPREADSHEET_MAX_COLUMNS,
  nullDate: { year: 1899, month: 12, day: 30 },
  undoLimit: 100,
  useArrayArithmetic: false,
  useRegularExpressions: false,
  useWildcards: false,
} as const;

function setSpreadsheetEditorIssue(
  issues: SpreadsheetEditorEvaluation['issues'],
  sheetName: string,
  address: string,
  issue: SpreadsheetEditorCellIssue,
  overwrite = false,
): void {
  issues[sheetName] ??= {};
  if (overwrite || !Object.hasOwn(issues[sheetName], address)) {
    issues[sheetName][address] = issue;
  }
}

function validateStudentFormulaReferences(
  engine: HyperFormula,
  template: SpreadsheetTemplate,
  studentSheetData: Record<string, RawCellContent[][]>,
  issues?: SpreadsheetEditorEvaluation['issues'],
): void {
  const templateBySheetId = new Map<number, SpreadsheetTemplate['sheets'][number]>();
  for (const sheet of template.sheets) {
    const sheetId = engine.getSheetId(sheet.name);
    if (sheetId !== undefined) templateBySheetId.set(sheetId, sheet);
  }

  function outsideStudentRange(): never;
  function outsideStudentRange(
    sheetName: string,
    address: string,
    result?: DetailedCellError,
  ): void;

  function outsideStudentRange(
    sheetName?: string,
    address?: string,
    result?: DetailedCellError,
  ): void {
    const message =
      'Student-visible formulas cannot reference cells outside declared student ranges.';
    if (!issues || !sheetName || !address) {
      throw new SpreadsheetSubmissionError(message);
    }
    setSpreadsheetEditorIssue(
      issues,
      sheetName,
      address,
      {
        message,
        value: result?.value ?? '#REF!',
        error_type: result?.type ?? 'REF',
      },
      result?.type === ErrorType.REF,
    );
  }

  for (const sheet of template.sheets) {
    const sheetId = engine.getSheetId(sheet.name) ?? outsideStudentRange();
    for (const [row, values] of studentSheetData[sheet.name].entries()) {
      for (const [col, input] of values.entries()) {
        if (typeof input !== 'string' || !input.startsWith('=')) continue;
        const address = cellAddress(row, col);
        const result = engine.getCellValue({ sheet: sheetId, row, col });
        if (result instanceof DetailedCellError && ['NAME', 'ERROR', 'REF'].includes(result.type)) {
          outsideStudentRange(sheet.name, address, result);
        }
        const precedents = engine.getCellPrecedents({ sheet: sheetId, row, col });
        for (const precedent of precedents) {
          const start = 'start' in precedent ? precedent.start : precedent;
          const end = 'end' in precedent ? precedent.end : precedent;
          const targetSheet = templateBySheetId.get(start.sheet);
          if (
            !targetSheet ||
            end.sheet !== start.sheet ||
            !isRangeContained(sheetRange(targetSheet), {
              startRow: start.row,
              endRow: end.row,
              startColumn: start.col,
              endColumn: end.col,
            })
          ) {
            outsideStudentRange(sheet.name, address);
          }
        }
      }
    }
  }
}

interface GradingRun {
  outputs: Record<string, SpreadsheetSnapshotResult>;
  /** Results of reference-compared cells, keyed by qualified source address. */
  cells: Record<string, SpreadsheetSnapshotResult>;
}

function mustResolveSourceCell(
  config: SpreadsheetGradingConfig,
  template: SpreadsheetTemplate,
  sheetName: string,
  cell: string,
): ResolvedSourceCell {
  const resolved = resolveSourceCell(config, template, sheetName, cell);
  if (!resolved) throw new Error(`Spreadsheet cell ${sheetName}!${cell} is invalid.`);
  return resolved;
}

/**
 * Evaluates the private grading workbook against one set of student sheets.
 * Returns the base run followed by one run per test case.
 */
function runGradingWorkbook(
  config: SpreadsheetGradingConfig,
  template: SpreadsheetTemplate,
  studentSheetData: Record<string, RawCellContent[][]>,
  { checkRequired }: { checkRequired: boolean },
): GradingRun[] {
  const sourceSheets = config.source_sheets;
  const sourceSheetData: Record<string, RawCellContent[][]> = Object.fromEntries(
    sourceSheets.map((sheet) => [
      sheet.name,
      buildSheetRows(sheet.rows, sheet.columns, sheet.cells),
    ]),
  );
  const engine = HyperFormula.buildFromSheets(studentSheetData, HYPERFORMULA_CONFIG);
  try {
    validateStudentFormulaReferences(engine, template, studentSheetData);

    const internalSheetNames = new Map<string, string>();
    for (const [index, sheet] of template.sheets.entries()) {
      const sheetId = engine.getSheetId(sheet.name);
      if (sheetId === undefined) throw new Error(`Student sheet ${sheet.name} is missing.`);
      const internalName = `${SPREADSHEET_INTERNAL_SHEET_PREFIX}${index}`;
      engine.renameSheet(sheetId, internalName);
      internalSheetNames.set(sheet.name, internalName);
    }

    for (const overlay of config.student_overlays) {
      const sourceRange = parseRange(overlay.source_range);
      const sourceRows = sourceSheetData[overlay.source_sheet];
      const studentRows = studentSheetData[overlay.student_sheet];
      const internalName = internalSheetNames.get(overlay.student_sheet);
      if (!sourceRange || !internalName) {
        throw new Error(`Student overlay for ${overlay.student_sheet} is invalid.`);
      }
      for (const [row, values] of studentRows.entries()) {
        for (const [column, input] of values.entries()) {
          sourceRows[sourceRange.startRow + row][sourceRange.startColumn + column] =
            typeof input === 'string' && input.startsWith('=')
              ? `=${internalName}!${cellAddress(row, column)}`
              : input;
        }
      }
    }

    for (const sheet of sourceSheets) {
      engine.addSheet(sheet.name);
    }
    for (const sheet of config.sheets) {
      engine.addSheet(sheet.name);
    }
    for (const sheet of sourceSheets) {
      const sheetId = engine.getSheetId(sheet.name);
      if (sheetId === undefined) throw new Error(`Private source sheet ${sheet.name} is missing.`);
      engine.setSheetContent(sheetId, sourceSheetData[sheet.name]);
    }
    for (const sheet of config.sheets) {
      const sheetId = engine.getSheetId(sheet.name);
      if (sheetId === undefined) throw new Error(`Private grading sheet ${sheet.name} is missing.`);
      engine.setSheetContent(sheetId, buildSheetRows(sheet.rows, sheet.columns, sheet.cells));
    }

    const getSheetId = (name: string) => {
      const sheetId = engine.getSheetId(name);
      if (sheetId === undefined) throw new Error(`Spreadsheet sheet ${name} is missing.`);
      return sheetId;
    };
    const readResult = (sheetName: string, address: SpreadsheetCellAddress) =>
      snapshotResult(
        engine.getCellValue({
          sheet: getSheetId(sheetName),
          row: address.row,
          col: address.column,
        }),
      );
    const comparedCells = (config.reference?.cells ?? []).map((cell) =>
      mustResolveSourceCell(config, template, cell.sheet, cell.cell),
    );

    const readRun = (): GradingRun => {
      // Enforce result limits for all populated grading cells, not only exported outputs.
      for (const sheet of [...sourceSheets, ...config.sheets]) {
        for (const address of Object.keys(sheet.cells)) {
          const parsedAddress = parseCellAddress(address);
          if (!parsedAddress) continue;
          readResult(sheet.name, parsedAddress);
        }
      }
      return {
        outputs: Object.fromEntries(
          Object.entries(config.outputs).map(([name, output]) => {
            const address = parseCellAddress(output.cell);
            if (!address) {
              throw new Error(`Private grading output ${name} has an invalid reference.`);
            }
            return [name, readResult(output.sheet, address)];
          }),
        ),
        cells: Object.fromEntries(
          comparedCells.map((cell) => [cell.key, readResult(cell.sourceSheet.name, cell.address)]),
        ),
      };
    };

    const base = readRun();
    if (checkRequired) {
      for (const [name, output] of Object.entries(config.outputs)) {
        const result = base.outputs[name];
        if (output.required && (result.type === 'empty' || result.type === 'error')) {
          throw new SpreadsheetSubmissionError(
            `Required spreadsheet output "${name}" must not be empty or contain an error.`,
          );
        }
      }
    }

    const caseRuns = (config.test_cases ?? []).map((testCase) => {
      // A case overrides the authoritative source cell and, for cells inside a
      // student range, the student-relative cell that student formulas read.
      const overrides = testCase.inputs.flatMap((input) => {
        const cell = mustResolveSourceCell(config, template, input.sheet, input.cell);
        const targets: SimpleCellAddress[] = [
          {
            sheet: getSheetId(cell.sourceSheet.name),
            row: cell.address.row,
            col: cell.address.column,
          },
        ];
        if (cell.student) {
          const internalName = internalSheetNames.get(cell.student.sheet.name);
          if (!internalName) {
            throw new Error(`Student sheet ${cell.student.sheet.name} is missing.`);
          }
          targets.push({
            sheet: getSheetId(internalName),
            row: cell.student.address.row,
            col: cell.student.address.column,
          });
        }
        return targets.map((address) => ({ address, value: input.value }));
      });
      const originals = overrides.map(({ address }) => ({
        address,
        value: engine.getCellSerialized(address),
      }));
      engine.batch(() => {
        for (const { address, value } of overrides) engine.setCellContents(address, [[value]]);
      });
      try {
        return readRun();
      } finally {
        engine.batch(() => {
          for (const { address, value } of originals) engine.setCellContents(address, [[value]]);
        });
      }
    });

    return [base, ...caseRuns];
  } finally {
    engine.destroy();
  }
}

function resultsMatch(
  student: SpreadsheetSnapshotResult,
  reference: SpreadsheetSnapshotResult,
  { rtol, atol }: { rtol: number; atol: number },
): boolean {
  switch (reference.type) {
    case 'empty':
      return student.type === 'empty';
    case 'number':
      return (
        student.type === 'number' &&
        Math.abs(student.value - reference.value) <= atol + rtol * Math.abs(reference.value)
      );
    case 'string':
      return student.type === 'string' && student.value === reference.value;
    case 'boolean':
      return student.type === 'boolean' && student.value === reference.value;
    case 'error':
      return student.type === 'error' && student.error_type === reference.error_type;
  }
}

/**
 * Builds the reference workbook as if the reference solution were a submission:
 * reference inputs fill their editable cells and declared parameter cells keep the
 * student's values, so both workbooks see identical inputs.
 */
function buildReferenceSubmission(
  config: SpreadsheetElementConfig,
  gradingConfig: SpreadsheetGradingConfig,
  merged: Record<string, Record<string, SpreadsheetCellInput>>,
): SpreadsheetRawSubmission {
  const sheets: SpreadsheetRawSubmission['sheets'] = {};
  const setInput = (cell: ResolvedSourceCell, input: SpreadsheetCellInput | null) => {
    if (!cell.student) return;
    const { sheet, address } = cell.student;
    sheets[sheet.name] ??= {};
    sheets[sheet.name][cellAddress(address.row, address.column)] = input;
  };
  for (const cell of parameterCells(gradingConfig, config.template).values()) {
    if (!cell.student) continue;
    const { sheet, address } = cell.student;
    if (!isCellEditable(sheet, address.row, address.column)) continue;
    setInput(cell, merged[sheet.name][cellAddress(address.row, address.column)] ?? null);
  }
  for (const cell of gradingConfig.reference?.cells ?? []) {
    setInput(
      mustResolveSourceCell(gradingConfig, config.template, cell.sheet, cell.cell),
      cell.input,
    );
  }
  return { schema_version: 2, template_hash: config.template_hash, sheets };
}

function buildReferenceSheetData(
  config: SpreadsheetElementConfig,
  gradingConfig: SpreadsheetGradingConfig,
  merged: Record<string, Record<string, SpreadsheetCellInput>>,
): Record<string, RawCellContent[][]> {
  const referenceMerged = mergeSubmission(
    config,
    buildReferenceSubmission(config, gradingConfig, merged),
  );
  return Object.fromEntries(
    config.template.sheets.map((sheet) => [
      sheet.name,
      buildSheetRows(sheet.rows, sheet.columns, referenceMerged[sheet.name]),
    ]),
  );
}

function evaluateGrading(
  config: SpreadsheetElementConfig,
  gradingConfig: SpreadsheetGradingConfig,
  merged: Record<string, Record<string, SpreadsheetCellInput>>,
  studentSheetData: Record<string, RawCellContent[][]>,
): NonNullable<SpreadsheetSnapshot['grading']> {
  validateGradingConfig(gradingConfig, config.template);
  const studentRuns = runGradingWorkbook(gradingConfig, config.template, studentSheetData, {
    checkRequired: true,
  });
  const [studentBase, ...studentCases] = studentRuns;
  const grading: NonNullable<SpreadsheetSnapshot['grading']> = {
    schema_version: 2,
    grader_hash: gradingConfig.grader_hash,
    outputs: studentBase.outputs,
  };
  if (gradingConfig.test_cases) {
    grading.cases = gradingConfig.test_cases.map((testCase, index) => ({
      name: testCase.name,
      outputs: studentCases[index].outputs,
    }));
  }

  const reference = gradingConfig.reference;
  if (!reference) return grading;

  // Reference failures are authoring errors, so they must not become student-facing parse errors.
  let referenceRuns: GradingRun[];
  try {
    referenceRuns = runGradingWorkbook(
      gradingConfig,
      config.template,
      buildReferenceSheetData(config, gradingConfig, merged),
      { checkRequired: false },
    );
  } catch (error) {
    if (!(error instanceof SpreadsheetSubmissionError)) throw error;
    throw new Error(`The spreadsheet reference solution is invalid: ${error.message}`, {
      cause: error,
    });
  }

  let matched = 0;
  let total = 0;
  const compare = (
    read: (run: GradingRun) => SpreadsheetSnapshotResult,
    tolerance: { rtol: number; atol: number },
  ): SpreadsheetComparisonSeries => {
    const [base, ...cases] = studentRuns.map((studentRun, index) => {
      const student = read(studentRun);
      const expected = read(referenceRuns[index]);
      const match = resultsMatch(student, expected, tolerance);
      total += 1;
      if (match) matched += 1;
      return { student, reference: expected, match };
    });
    return { base, cases };
  };

  const cells = Object.fromEntries(
    reference.cells.map((cell) => {
      const { key } = mustResolveSourceCell(gradingConfig, config.template, cell.sheet, cell.cell);
      return [
        key,
        compare((run) => run.cells[key], {
          rtol: cell.rtol ?? reference.rtol,
          atol: cell.atol ?? reference.atol,
        }),
      ];
    }),
  );
  const outputs = reference.compare_outputs
    ? Object.fromEntries(
        Object.keys(gradingConfig.outputs).map((name) => [
          name,
          compare((run) => run.outputs[name], { rtol: reference.rtol, atol: reference.atol }),
        ]),
      )
    : undefined;
  grading.reference = { cells, outputs, summary: { matched, total } };
  return grading;
}

export function evaluateSpreadsheet(
  config: SpreadsheetElementConfig,
  submission: SpreadsheetRawSubmission,
  gradingConfig?: SpreadsheetGradingConfig,
): SpreadsheetEvaluation {
  return evaluateSpreadsheetInternal(config, submission, gradingConfig);
}

export function evaluateSpreadsheetForEditor(
  config: SpreadsheetElementConfig,
  submission: SpreadsheetRawSubmission,
): SpreadsheetEditorEvaluation {
  const issues: SpreadsheetEditorEvaluation['issues'] = {};
  return { ...evaluateSpreadsheetInternal(config, submission, undefined, issues), issues };
}

function evaluateSpreadsheetInternal(
  config: SpreadsheetElementConfig,
  submission: SpreadsheetRawSubmission,
  gradingConfig?: SpreadsheetGradingConfig,
  issues?: SpreadsheetEditorEvaluation['issues'],
): SpreadsheetEvaluation {
  validateTemplate(config.template);
  if (submission.template_hash !== config.template_hash) {
    throw new SpreadsheetSubmissionError(
      'The spreadsheet template changed. Reload the question and try again.',
    );
  }
  const merged = mergeSubmission(config, submission, issues);
  const sheetData: Record<string, RawCellContent[][]> = {};
  for (const sheet of config.template.sheets) {
    sheetData[sheet.name] = buildSheetRows(sheet.rows, sheet.columns, merged[sheet.name]);
  }

  const engine = HyperFormula.buildFromSheets(sheetData, HYPERFORMULA_CONFIG);

  try {
    validateStudentFormulaReferences(engine, config.template, sheetData, issues);
    const sheets = config.template.sheets.map((sheet, sheetIndex) => {
      const cells: Record<string, z.infer<typeof SpreadsheetSnapshotCellSchema>> = {};
      for (const [address, input] of Object.entries(merged[sheet.name])) {
        const parsedAddress = parseCellAddress(address);
        if (!parsedAddress) continue;
        let result = snapshotResult(
          engine.getCellValue({
            sheet: sheetIndex,
            row: parsedAddress.row,
            col: parsedAddress.column,
          }),
        );
        const issue = issues?.[sheet.name]?.[address];
        if (issue) {
          result = {
            type: 'error',
            value: issue.value,
            error_type: issue.error_type,
          };
        }
        if (
          !issues &&
          result.type === 'error' &&
          (result.error_type === 'NAME' || result.error_type === 'ERROR')
        ) {
          throw new SpreadsheetSubmissionError(
            `Formula in ${sheet.name}!${address} could not be parsed.`,
          );
        }
        cells[address] = { input: snapshotInput(input), result };
      }
      return {
        name: sheet.name,
        rows: sheet.rows,
        columns: sheet.columns,
        cells,
      };
    });

    const grading = gradingConfig
      ? evaluateGrading(config, gradingConfig, merged, sheetData)
      : undefined;
    const snapshot = SpreadsheetSnapshotSchema.parse({
      schema_version: 2,
      template_hash: config.template_hash,
      engine: {
        name: 'hyperformula',
        version: SPREADSHEET_ENGINE_VERSION,
        configuration_version: SPREADSHEET_CONFIGURATION_VERSION,
      },
      sheets,
      grading,
    });
    if (
      new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > SPREADSHEET_MAX_PAYLOAD_BYTES
    ) {
      throw new SpreadsheetSubmissionError(
        `Spreadsheet submissions must be at most ${SPREADSHEET_MAX_PAYLOAD_BYTES} bytes.`,
      );
    }
    return { snapshot, engine };
  } catch (error) {
    engine.destroy();
    throw error;
  }
}

/**
 * Evaluates each element's reference solution against the template so that the
 * answer panel can render it. Invalid reference solutions are authoring errors.
 */
export function addSpreadsheetReferenceAnswers({
  params,
  correctAnswers,
}: {
  params: Record<string, unknown>;
  correctAnswers: Record<string, unknown>;
}): Record<string, unknown> {
  const rawConfigs = params._pl_spreadsheet_v2;
  if (rawConfigs == null || typeof rawConfigs !== 'object' || Array.isArray(rawConfigs)) {
    return correctAnswers;
  }

  const result = { ...correctAnswers };
  for (const [answerName, rawConfig] of Object.entries(rawConfigs)) {
    const rawGradingConfig = correctAnswers[answerName];
    if (rawGradingConfig === undefined) continue;
    const config = SpreadsheetElementConfigSchema.parse(rawConfig);
    const gradingConfig = SpreadsheetGradingConfigSchema.parse(rawGradingConfig);
    if (!gradingConfig.reference) continue;
    validateGradingConfig(gradingConfig, config.template);

    const templateInputs = Object.fromEntries(
      config.template.sheets.map((sheet) => [sheet.name, { ...sheet.cells }]),
    );
    let evaluation: SpreadsheetEvaluation;
    try {
      evaluation = evaluateSpreadsheet(
        config,
        buildReferenceSubmission(config, gradingConfig, templateInputs),
      );
    } catch (error) {
      if (!(error instanceof SpreadsheetSubmissionError)) throw error;
      throw new Error(
        `The spreadsheet reference solution for "${answerName}" is invalid: ${error.message}`,
        { cause: error },
      );
    }
    evaluation.engine.destroy();
    result[answerName] = { ...gradingConfig, answer: { sheets: evaluation.snapshot.sheets } };
  }
  return result;
}

export function normalizeSpreadsheetAnswers({
  params,
  correctAnswers,
  submittedAnswers,
}: {
  params: Record<string, unknown>;
  correctAnswers: Record<string, unknown>;
  submittedAnswers: Record<string, unknown>;
}): Record<string, unknown> {
  const rawConfigs = params._pl_spreadsheet_v2;
  if (rawConfigs == null || typeof rawConfigs !== 'object' || Array.isArray(rawConfigs)) {
    return submittedAnswers;
  }

  const normalizedAnswers = { ...submittedAnswers };
  for (const [answerName, rawConfig] of Object.entries(rawConfigs)) {
    const parsedConfig = SpreadsheetElementConfigSchema.safeParse(rawConfig);
    if (!parsedConfig.success) {
      throw new Error(`Invalid persisted pl-spreadsheet configuration for ${answerName}`);
    }
    const config = parsedConfig.data;
    const rawGradingConfig = correctAnswers[answerName];
    const parsedGradingConfig =
      rawGradingConfig === undefined
        ? undefined
        : SpreadsheetGradingConfigSchema.safeParse(rawGradingConfig);
    if (parsedGradingConfig && !parsedGradingConfig.success) {
      throw new Error(`Invalid persisted pl-spreadsheet grading configuration for ${answerName}`);
    }
    try {
      const rawAnswer = submittedAnswers[answerName];
      if (typeof rawAnswer !== 'string') {
        throw new SpreadsheetSubmissionError('No spreadsheet answer was submitted.');
      }
      if (new TextEncoder().encode(rawAnswer).byteLength > SPREADSHEET_MAX_PAYLOAD_BYTES) {
        throw new SpreadsheetSubmissionError(
          `Spreadsheet submissions must be at most ${SPREADSHEET_MAX_PAYLOAD_BYTES} bytes.`,
        );
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(rawAnswer);
      } catch {
        throw new SpreadsheetSubmissionError('The spreadsheet answer is not valid JSON.');
      }
      const parsedSubmission = SpreadsheetRawSubmissionSchema.safeParse(decoded);
      if (!parsedSubmission.success) {
        throw new SpreadsheetSubmissionError('The spreadsheet answer has an invalid structure.');
      }
      const { snapshot, engine } = evaluateSpreadsheet(
        config,
        parsedSubmission.data,
        parsedGradingConfig?.data,
      );
      engine.destroy();
      normalizedAnswers[answerName] = snapshot;
    } catch (error) {
      if (!(error instanceof SpreadsheetSubmissionError)) throw error;
      normalizedAnswers[answerName] = SpreadsheetSubmissionErrorSchema.parse({
        schema_version: 2,
        template_hash: config.template_hash,
        error: error.message,
      });
    }
  }
  return normalizedAnswers;
}

export function getSpreadsheetLogMetadata(
  params: Record<string, unknown>,
  correctAnswers: Record<string, unknown> = {},
) {
  const rawConfigs = params._pl_spreadsheet_v2;
  const metadata = {
    spreadsheet_elements: 0,
    spreadsheet_sheets: 0,
    spreadsheet_addressable_cells: 0,
    spreadsheet_populated_cells: 0,
    spreadsheet_formulas: 0,
    spreadsheet_grading_sheets: 0,
    spreadsheet_grading_addressable_cells: 0,
    spreadsheet_grading_populated_cells: 0,
    spreadsheet_grading_formulas: 0,
    spreadsheet_grading_outputs: 0,
    spreadsheet_grading_test_cases: 0,
    spreadsheet_grading_reference_cells: 0,
  };
  if (rawConfigs == null || typeof rawConfigs !== 'object' || Array.isArray(rawConfigs)) {
    return metadata;
  }

  metadata.spreadsheet_elements = Object.keys(rawConfigs).length;
  for (const [answerName, rawConfig] of Object.entries(rawConfigs)) {
    const config = SpreadsheetElementConfigSchema.safeParse(rawConfig);
    if (!config.success) continue;
    metadata.spreadsheet_sheets += config.data.template.sheets.length;
    for (const sheet of config.data.template.sheets) {
      metadata.spreadsheet_addressable_cells += sheet.rows * sheet.columns;
      metadata.spreadsheet_populated_cells += Object.keys(sheet.cells).length;
      metadata.spreadsheet_formulas += Object.values(sheet.cells).filter(
        (value) => typeof value === 'string' && value.startsWith('='),
      ).length;
    }
    const gradingConfig = SpreadsheetGradingConfigSchema.safeParse(correctAnswers[answerName]);
    if (!gradingConfig.success) continue;
    const gradingSheets = [...gradingConfig.data.source_sheets, ...gradingConfig.data.sheets];
    metadata.spreadsheet_grading_sheets += gradingSheets.length;
    metadata.spreadsheet_grading_outputs += Object.keys(gradingConfig.data.outputs).length;
    metadata.spreadsheet_grading_test_cases += gradingConfig.data.test_cases?.length ?? 0;
    metadata.spreadsheet_grading_reference_cells += gradingConfig.data.reference?.cells.length ?? 0;
    for (const sheet of gradingSheets) {
      metadata.spreadsheet_grading_addressable_cells += sheet.rows * sheet.columns;
      metadata.spreadsheet_grading_populated_cells += Object.keys(sheet.cells).length;
      metadata.spreadsheet_grading_formulas += Object.values(sheet.cells).filter(
        (value) => typeof value === 'string' && value.startsWith('='),
      ).length;
    }
  }
  return metadata;
}
