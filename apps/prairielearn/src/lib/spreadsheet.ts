import {
  DetailedCellError,
  HyperFormula,
  type RawCellContent,
  type SimpleCellAddress,
} from 'hyperformula';
import * as z from 'zod/v4';

export const SPREADSHEET_ENGINE_VERSION = '3.4.0';
export const SPREADSHEET_CONFIGURATION_VERSION = 1;
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
    schema_version: z.literal(1),
    sheets: z.array(SpreadsheetSheetTemplateSchema).min(1).max(SPREADSHEET_MAX_SHEETS),
  })
  .strict();

export type SpreadsheetTemplate = z.infer<typeof SpreadsheetTemplateSchema>;
export type SpreadsheetCellInput = z.infer<typeof CellInputSchema>;

export const SpreadsheetElementConfigSchema = z
  .object({
    schema_version: z.literal(1),
    template_hash: z.string().min(1),
    template: SpreadsheetTemplateSchema,
    allow_blank: z.boolean().optional(),
    aria_label: z.string().optional(),
    height: z.string().optional(),
  })
  .strict();

export type SpreadsheetElementConfig = z.infer<typeof SpreadsheetElementConfigSchema>;

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

export const SpreadsheetGradingConfigSchema = z
  .object({
    schema_version: z.literal(1),
    grader_hash: z.string().min(1),
    sheets: z.array(SpreadsheetGradingSheetSchema).min(1).max(SPREADSHEET_MAX_SHEETS),
    outputs: z
      .record(z.string().min(1).max(128), SpreadsheetGradingOutputSchema)
      .refine((outputs) => Object.keys(outputs).length <= SPREADSHEET_MAX_GRADING_OUTPUTS),
  })
  .strict();

export type SpreadsheetGradingConfig = z.infer<typeof SpreadsheetGradingConfigSchema>;

export const SpreadsheetRawSubmissionSchema = z
  .object({
    schema_version: z.literal(1),
    template_hash: z.string(),
    sheets: z.record(z.string(), z.record(z.string(), RawCellInputSchema)),
  })
  .strict();

export type SpreadsheetRawSubmission = z.infer<typeof SpreadsheetRawSubmissionSchema>;

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

export const SpreadsheetSnapshotSchema = z
  .object({
    schema_version: z.literal(1),
    template_hash: z.string(),
    engine: z
      .object({
        name: z.literal('hyperformula'),
        version: z.literal(SPREADSHEET_ENGINE_VERSION),
        configuration_version: z.literal(SPREADSHEET_CONFIGURATION_VERSION),
      })
      .strict(),
    sheets: z.array(
      z
        .object({
          name: z.string(),
          rows: z.number().int(),
          columns: z.number().int(),
          cells: z.record(z.string(), SpreadsheetSnapshotCellSchema),
        })
        .strict(),
    ),
    grading: z
      .object({
        schema_version: z.literal(1),
        grader_hash: z.string(),
        outputs: z.record(z.string(), SpreadsheetSnapshotResultSchema),
      })
      .strict()
      .optional(),
  })
  .strict();

export type SpreadsheetSnapshot = z.infer<typeof SpreadsheetSnapshotSchema>;

const SpreadsheetSubmissionErrorSchema = z
  .object({
    schema_version: z.literal(1),
    template_hash: z.string(),
    error: z.string(),
  })
  .strict();

export interface SpreadsheetEvaluation {
  snapshot: SpreadsheetSnapshot;
  engine: HyperFormula;
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

export function parseCellAddress(address: string): { row: number; column: number } | null {
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

function parseRange(range: string) {
  const [startText, endText = startText] = range.toUpperCase().split(':');
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
      if (!range || range.endRow >= sheet.rows || range.endColumn >= sheet.columns) {
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
  if (new TextEncoder().encode(JSON.stringify(config)).byteLength > SPREADSHEET_MAX_PAYLOAD_BYTES) {
    throw new Error(
      `Private spreadsheet grading workbooks must be at most ${SPREADSHEET_MAX_PAYLOAD_BYTES} bytes.`,
    );
  }
  if (Object.keys(config.outputs).length === 0) {
    throw new Error('Private spreadsheet grading workbooks must define at least one output.');
  }
  let addressableCells = 0;
  let populatedCells = 0;
  let formulas = 0;
  const publicSheetNames = new Set(
    template.sheets.map((sheet) => sheet.name.toLocaleLowerCase('en-US')),
  );
  const gradingSheetNames = new Set<string>();

  for (const sheet of config.sheets) {
    if (!isValidSheetName(sheet.name)) {
      throw new Error(
        `Private grading sheet ${sheet.name} must have a non-empty name of at most 31 characters without leading or trailing whitespace. The characters !, :, <, >, {, }, [, ], and null are not allowed.`,
      );
    }
    const foldedName = sheet.name.toLocaleLowerCase('en-US');
    if (publicSheetNames.has(foldedName)) {
      throw new Error(`Private grading sheet ${sheet.name} conflicts with a student sheet.`);
    }
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
        throw new Error(`Cell ${address} is outside private grading sheet ${sheet.name}.`);
      }
      populatedCells += 1;
      if (typeof input === 'string' && input.startsWith('=')) {
        formulas += 1;
        const formulaError = validateFormula(input);
        if (formulaError) throw new Error(formulaError);
      }
    }
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

  const sheetsByName = new Map(config.sheets.map((sheet) => [sheet.name, sheet]));
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
}

function mergeSubmission(
  config: SpreadsheetElementConfig,
  submission: SpreadsheetRawSubmission,
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
          if (formulaError) throw new SpreadsheetSubmissionError(formulaError);
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

function evaluateGradingOutputs(
  config: SpreadsheetGradingConfig,
  template: SpreadsheetTemplate,
  studentSheetData: Record<string, RawCellContent[][]>,
): Record<string, z.infer<typeof SpreadsheetSnapshotResultSchema>> {
  validateGradingConfig(config, template);
  const gradingSheetData = Object.fromEntries(
    Object.entries(studentSheetData).map(([name, rows]) => [name, rows.map((row) => [...row])]),
  );
  for (const sheet of config.sheets) {
    gradingSheetData[sheet.name] = buildSheetRows(sheet.rows, sheet.columns, sheet.cells);
  }

  const engine = HyperFormula.buildFromSheets(gradingSheetData, HYPERFORMULA_CONFIG);
  try {
    const privateSheetIds = new Set(
      config.sheets.map((sheet) => {
        const sheetId = engine.getSheetId(sheet.name);
        if (sheetId === undefined) {
          throw new Error(`Private grading sheet ${sheet.name} is missing.`);
        }
        return sheetId;
      }),
    );
    for (const sheet of template.sheets) {
      const sheetId = engine.getSheetId(sheet.name);
      if (sheetId === undefined) throw new Error(`Student sheet ${sheet.name} is missing.`);
      for (const [row, values] of studentSheetData[sheet.name].entries()) {
        for (const [col, input] of values.entries()) {
          if (typeof input !== 'string' || !input.startsWith('=')) continue;
          const precedents = engine.getCellPrecedents({ sheet: sheetId, row, col });
          if (
            precedents.some((precedent) =>
              privateSheetIds.has('sheet' in precedent ? precedent.sheet : precedent.start.sheet),
            )
          ) {
            throw new SpreadsheetSubmissionError(
              'Student formulas cannot reference private grading sheets.',
            );
          }
        }
      }
    }

    // Enforce result limits for all populated grading cells, not only exported outputs.
    for (const sheet of config.sheets) {
      const sheetId = engine.getSheetId(sheet.name);
      if (sheetId === undefined) throw new Error(`Private grading sheet ${sheet.name} is missing.`);
      for (const address of Object.keys(sheet.cells)) {
        const parsedAddress = parseCellAddress(address);
        if (!parsedAddress) continue;
        snapshotResult(
          engine.getCellValue({
            sheet: sheetId,
            row: parsedAddress.row,
            col: parsedAddress.column,
          }),
        );
      }
    }

    return Object.fromEntries(
      Object.entries(config.outputs).map(([name, output]) => {
        const sheetId = engine.getSheetId(output.sheet);
        const address = parseCellAddress(output.cell);
        if (sheetId === undefined || !address) {
          throw new Error(`Private grading output ${name} has an invalid reference.`);
        }
        const result = snapshotResult(
          engine.getCellValue({ sheet: sheetId, row: address.row, col: address.column }),
        );
        if (output.required && (result.type === 'empty' || result.type === 'error')) {
          throw new SpreadsheetSubmissionError(
            `Required spreadsheet output "${name}" must not be empty or contain an error.`,
          );
        }
        return [name, result];
      }),
    );
  } finally {
    engine.destroy();
  }
}

export function evaluateSpreadsheet(
  config: SpreadsheetElementConfig,
  submission: SpreadsheetRawSubmission,
  gradingConfig?: SpreadsheetGradingConfig,
): SpreadsheetEvaluation {
  validateTemplate(config.template);
  if (submission.template_hash !== config.template_hash) {
    throw new SpreadsheetSubmissionError(
      'The spreadsheet template changed. Reload the question and try again.',
    );
  }
  const merged = mergeSubmission(config, submission);
  const sheetData: Record<string, RawCellContent[][]> = {};
  for (const sheet of config.template.sheets) {
    sheetData[sheet.name] = buildSheetRows(sheet.rows, sheet.columns, merged[sheet.name]);
  }

  const engine = HyperFormula.buildFromSheets(sheetData, HYPERFORMULA_CONFIG);

  try {
    const sheets = config.template.sheets.map((sheet, sheetIndex) => {
      const cells: Record<string, z.infer<typeof SpreadsheetSnapshotCellSchema>> = {};
      for (const [address, input] of Object.entries(merged[sheet.name])) {
        const parsedAddress = parseCellAddress(address);
        if (!parsedAddress) continue;
        const result = snapshotResult(
          engine.getCellValue({
            sheet: sheetIndex,
            row: parsedAddress.row,
            col: parsedAddress.column,
          }),
        );
        if (
          result.type === 'error' &&
          (result.error_type === 'NAME' || result.error_type === 'ERROR')
        ) {
          throw new SpreadsheetSubmissionError(
            `Formula in ${sheet.name}!${address} could not be parsed.`,
          );
        }
        cells[address] = { input: snapshotInput(input), result };
      }
      return { name: sheet.name, rows: sheet.rows, columns: sheet.columns, cells };
    });

    const grading = gradingConfig
      ? {
          schema_version: 1 as const,
          grader_hash: gradingConfig.grader_hash,
          outputs: evaluateGradingOutputs(gradingConfig, config.template, sheetData),
        }
      : undefined;
    const snapshot = SpreadsheetSnapshotSchema.parse({
      schema_version: 1,
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

export function normalizeSpreadsheetAnswers({
  params,
  correctAnswers,
  submittedAnswers,
}: {
  params: Record<string, unknown>;
  correctAnswers: Record<string, unknown>;
  submittedAnswers: Record<string, unknown>;
}): Record<string, unknown> {
  const rawConfigs = params._pl_spreadsheet_v1;
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
        schema_version: 1,
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
  const rawConfigs = params._pl_spreadsheet_v1;
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
    metadata.spreadsheet_grading_sheets += gradingConfig.data.sheets.length;
    metadata.spreadsheet_grading_outputs += Object.keys(gradingConfig.data.outputs).length;
    for (const sheet of gradingConfig.data.sheets) {
      metadata.spreadsheet_grading_addressable_cells += sheet.rows * sheet.columns;
      metadata.spreadsheet_grading_populated_cells += Object.keys(sheet.cells).length;
      metadata.spreadsheet_grading_formulas += Object.values(sheet.cells).filter(
        (value) => typeof value === 'string' && value.startsWith('='),
      ).length;
    }
  }
  return metadata;
}
