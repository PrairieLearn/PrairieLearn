import type { CellSnapshot, PrecedentReport, RangePage } from 'formualizer';
import type * as FormualizerWasm from 'formualizer/pkg/formualizer_wasm.js';
// @ts-expect-error No types for the wasm-bindgen glue; see `bindings` below.
import * as untypedBindings from 'formualizer/pkg/formualizer_wasm_bg.js';

// Formualizer's typed entry point imports its `.wasm` file as an ES module, which
// neither esbuild's classic bundles nor Node load without flags. We import the glue
// it wraps instead and instantiate the `.wasm` file ourselves.
const bindings: typeof FormualizerWasm & {
  __wbg_set_wasm(exports: WebAssembly.Exports): void;
} = untypedBindings;

// A thin adapter over the Formualizer engine. Cell coordinates are zero-based here,
// as they are everywhere else in PrairieLearn, and one-based inside the engine.

export const SPREADSHEET_ENGINE_WASM_PATH = 'formualizer/pkg/formualizer_wasm_bg.wasm';

let initialized = false;

export function spreadsheetEngineImports(): WebAssembly.Imports {
  return { './formualizer_wasm_bg.js': untypedBindings };
}

/** Connects the engine's JavaScript bindings to an instance of its `.wasm` module. */
export function initializeSpreadsheetEngine(instance: WebAssembly.Instance): void {
  if (initialized) return;
  bindings.__wbg_set_wasm(instance.exports);
  (instance.exports.__wbindgen_start as () => void)();
  initialized = true;
}

export function isSpreadsheetEngineInitialized(): boolean {
  return initialized;
}

export type SpreadsheetEngineInput = string | number | boolean | null;

export type SpreadsheetEngineResult =
  | { type: 'empty' }
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'error'; value: string; error_type: string };

/** A zero-based range on an engine sheet. Precedents that are not cells or ranges are null. */
export interface SpreadsheetEngineRange {
  sheet: string;
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

// Error types are named as they are in submitted snapshots, which PrairieLearn's
// Python helpers, client, and documentation all rely on.
const ERRORS: Record<string, { value: string; error_type: string }> = {
  '#CALC!': { value: '#CALC!', error_type: 'CALC' },
  '#CIRC!': { value: '#CYCLE!', error_type: 'CYCLE' },
  '#DIV/0!': { value: '#DIV/0!', error_type: 'DIV_BY_ZERO' },
  '#ERROR!': { value: '#ERROR!', error_type: 'ERROR' },
  '#N/A': { value: '#N/A', error_type: 'NA' },
  '#NAME?': { value: '#NAME?', error_type: 'NAME' },
  '#NULL!': { value: '#NULL!', error_type: 'NULL' },
  '#NUM!': { value: '#NUM!', error_type: 'NUM' },
  '#REF!': { value: '#REF!', error_type: 'REF' },
  '#SPILL!': { value: '#SPILL!', error_type: 'SPILL' },
  '#VALUE!': { value: '#VALUE!', error_type: 'VALUE' },
};

function toResult(value: CellSnapshot['value']): SpreadsheetEngineResult {
  if (value === null) return { type: 'empty' };
  if (typeof value === 'number') return { type: 'number', value };
  if (typeof value === 'string') return { type: 'string', value };
  if (typeof value === 'boolean') return { type: 'boolean', value };
  if (!Array.isArray(value) && value.kind === 'error') {
    return { type: 'error', ...(ERRORS[value.code] ?? { value: value.code, error_type: 'ERROR' }) };
  }
  // Inputs are never dates and spilled arrays are replaced in `evaluate()`, so other
  // shapes indicate a bug.
  throw new Error(`Unsupported spreadsheet engine value: ${JSON.stringify(value)}`);
}

/**
 * Interprets text entered in a cell as a spreadsheet would: number-like text is a
 * number and TRUE or FALSE is a boolean. Sources such as CSV files provide every
 * cell as text, so this keeps their numbers numeric.
 */
export function parseCellText(text: string): string | number | boolean {
  if (text.toUpperCase() === 'TRUE') return true;
  if (text.toUpperCase() === 'FALSE') return false;
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/.test(text)) {
    const number = Number(text);
    if (Number.isFinite(number)) return number;
  }
  return text;
}

export class SpreadsheetEngineWorkbook {
  private readonly workbook = new bindings.Workbook();
  private readonly sheets = new Map<string, { rows: number; columns: number }>();

  addSheet(name: string, rows: number, columns: number): void {
    this.workbook.addSheet(name);
    this.sheets.set(name, { rows, columns });
  }

  /** Sets a cell. Formulas must already refer to sheets by their engine names. */
  setInput(sheet: string, row: number, column: number, input: SpreadsheetEngineInput): void {
    if (typeof input === 'string' && input.startsWith('=')) {
      this.workbook.setFormula(sheet, row + 1, column + 1, input);
    } else {
      this.workbook.setValue(
        sheet,
        row + 1,
        column + 1,
        typeof input === 'string' ? parseCellText(input) : input,
      );
    }
  }

  /**
   * Recalculates the workbook. Returns the formula cells that were replaced because
   * their results spilled, so that callers can restore them before changing inputs.
   */
  evaluate(): { sheet: string; row: number; column: number }[] {
    const replaced: { sheet: string; row: number; column: number }[] = [];
    this.workbook.evaluateAll();
    // PrairieLearn does not support array formulas, but the engine spills array
    // results into neighboring cells, where other formulas could read them. Report
    // a spilling formula as #VALUE!, as an engine without dynamic arrays would.
    for (;;) {
      const anchors = [...this.sheets.keys()].flatMap((sheet) =>
        this.page(sheet).items.filter((item) => item.spill?.role === 'anchor'),
      );
      if (anchors.length === 0) return replaced;
      for (const { address } of anchors) {
        this.workbook.setFormula(address.sheet, address.row, address.column, '=#VALUE!');
        replaced.push({ sheet: address.sheet, row: address.row - 1, column: address.column - 1 });
      }
      this.workbook.evaluateAll();
    }
  }

  /** Returns a reader for every cell on a sheet, read in one pass over the engine. */
  readSheet(sheet: string): (row: number, column: number) => SpreadsheetEngineResult {
    const { columns } = this.sheets.get(sheet)!;
    const values = this.page(sheet).items.map((item) => item.value);
    return (row, column) => toResult(values[row * columns + column] ?? null);
  }

  precedents(sheet: string, row: number, column: number): (SpreadsheetEngineRange | null)[] {
    const report: PrecedentReport = this.workbook.precedents(
      { sheet, row: row + 1, column: column + 1 },
      { maxLinks: 4096 },
    );
    const precedents = report.precedents.map(({ reference }): SpreadsheetEngineRange | null => {
      if (reference.kind === 'cell') {
        const { address } = reference;
        return {
          sheet: address.sheet,
          startRow: address.row - 1,
          endRow: address.row - 1,
          startColumn: address.column - 1,
          endColumn: address.column - 1,
        };
      }
      if (reference.kind === 'range') {
        const { declared } = reference;
        // Open bounds, as in `A:A`, `1:1`, or `B2:B`, extend only to the edge of the
        // referenced sheet's grid, since the engine holds no cells past it. An open
        // range that starts past the edge still ends at its start, so it stays outside.
        const size = this.sheets.get(declared.sheet);
        const startRow = declared.startRow ?? 1;
        const startColumn = declared.startColumn ?? 1;
        return {
          sheet: declared.sheet,
          startRow: startRow - 1,
          endRow:
            (declared.endRow ?? Math.max(startRow, size?.rows ?? Number.MAX_SAFE_INTEGER)) - 1,
          startColumn: startColumn - 1,
          endColumn:
            (declared.endColumn ??
              Math.max(startColumn, size?.columns ?? Number.MAX_SAFE_INTEGER)) - 1,
        };
      }
      return null;
    });
    return report.truncation.incomplete ? [...precedents, null] : precedents;
  }

  destroy(): void {
    this.workbook.free();
  }

  private page(sheet: string): RangePage {
    const { rows, columns } = this.sheets.get(sheet)!;
    return this.workbook.rangePage(
      { sheet, startRow: 1, startColumn: 1, endRow: rows, endColumn: columns },
      { limit: rows * columns },
    );
  }
}

interface RewriteOptions {
  /**
   * Maps a sheet name written in the formula to the name to emit, or returns null
   * when the sheet does not exist. Omit to keep sheet names as written.
   */
  resolveSheet?: (name: string) => string | null;
  rowOffset?: number;
  columnOffset?: number;
  maxRows: number;
  maxColumns: number;
}

const CELL_ENDPOINT = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]+)$/;
const COLUMN_ENDPOINT = /^(\$?)([A-Za-z]{1,3})$/;
const ROW_ENDPOINT = /^(\$?)([0-9]+)$/;
const UNQUOTED_SHEET_NAME = /^[A-Za-z_][A-Za-z0-9_.]*$/;

function columnIndex(name: string): number {
  let column = 0;
  for (const character of name.toUpperCase()) column = column * 26 + character.charCodeAt(0) - 64;
  return column - 1;
}

function columnName(column: number): string {
  let value = column + 1;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

/** Splits `Sheet!A1:B2` or `'My sheet'!A1` into its sheet name and the rest. */
function splitSheet(text: string): { sheet: string | null; prefix: string; rest: string } | null {
  if (text.startsWith("'")) {
    let index = 1;
    while (index < text.length) {
      if (text[index] === "'") {
        if (text[index + 1] !== "'") break;
        index += 1;
      }
      index += 1;
    }
    if (text[index + 1] !== '!') return null;
    return {
      sheet: text.slice(1, index).replaceAll("''", "'"),
      prefix: text.slice(0, index + 2),
      rest: text.slice(index + 2),
    };
  }
  const bang = text.lastIndexOf('!');
  if (bang === -1) return { sheet: null, prefix: '', rest: text };
  return {
    sheet: text.slice(0, bang),
    prefix: text.slice(0, bang + 1),
    rest: text.slice(bang + 1),
  };
}

/** Shifts one endpoint (`A1`, `$A`, `1`, ...), or returns null if it leaves the grid. */
function shiftEndpoint(text: string, options: RewriteOptions): string | null | undefined {
  const rowOffset = options.rowOffset ?? 0;
  const columnOffset = options.columnOffset ?? 0;
  const shiftColumn = (absolute: string, name: string) => {
    const column = absolute ? columnIndex(name) : columnIndex(name) + columnOffset;
    return column < 0 || column >= options.maxColumns ? null : `${absolute}${columnName(column)}`;
  };
  const shiftRow = (absolute: string, digits: string) => {
    const row = absolute ? Number(digits) - 1 : Number(digits) - 1 + rowOffset;
    return row < 0 || row >= options.maxRows ? null : `${absolute}${row + 1}`;
  };
  const cell = CELL_ENDPOINT.exec(text);
  if (cell) {
    const column = shiftColumn(cell[1], cell[2]);
    const row = shiftRow(cell[3], cell[4]);
    return column === null || row === null ? null : column + row;
  }
  const column = COLUMN_ENDPOINT.exec(text);
  if (column) return shiftColumn(column[1], column[2]);
  const row = ROW_ENDPOINT.exec(text);
  if (row) return shiftRow(row[1], row[2]);
  return undefined;
}

/** Rewrites one engine `Range` operand, such as `A1`, `Sheet1!$A:$B`, or a name. */
function rewriteReference(text: string, options: RewriteOptions): string {
  const split = splitSheet(text);
  if (!split) return options.resolveSheet ? '#REF!' : text;
  let prefix = split.prefix;
  if (split.sheet !== null && options.resolveSheet) {
    const sheet = options.resolveSheet(split.sheet);
    if (sheet === null) return '#REF!';
    prefix = `${UNQUOTED_SHEET_NAME.test(sheet) ? sheet : `'${sheet.replaceAll("'", "''")}'`}!`;
  }
  const endpoints: string[] = [];
  for (const endpoint of split.rest.split(':')) {
    const shifted = shiftEndpoint(endpoint, options);
    if (shifted === null) return '#REF!';
    // Names and other operands that are not references are left alone; a sheet
    // prefix on one is still rewritten so that it cannot name a missing sheet.
    if (shifted === undefined) return `${prefix}${split.rest}`;
    endpoints.push(shifted);
  }
  return `${prefix}${endpoints.join(':')}`;
}

interface EngineToken {
  tokenType: string;
  subtype: string;
  value: string;
  pos: number;
  end: number;
}

/**
 * Rewrites every reference in a formula using the engine's own tokenizer, so that
 * the rewrite sees exactly the references the engine will. References to missing
 * sheets, or shifted off the grid, become `#REF!` as they do in Excel.
 */
export function rewriteFormulaReferences(formula: string, options: RewriteOptions): string {
  let tokens: EngineToken[];
  try {
    const tokenizer = new bindings.Tokenizer(formula);
    tokens = tokenizer.tokens();
    tokenizer.free();
  } catch {
    // The engine reports a formula it cannot tokenize as #ERROR! without resolving
    // any of its references.
    return formula;
  }
  // Token positions are UTF-8 byte offsets.
  const bytes = new TextEncoder().encode(formula);
  const decoder = new TextDecoder();
  let result = '';
  let position = 0;
  for (const token of tokens) {
    result += decoder.decode(bytes.slice(position, token.pos));
    const text = decoder.decode(bytes.slice(token.pos, token.end));
    result +=
      token.tokenType === 'Operand' && token.subtype === 'Range'
        ? rewriteReference(text, options)
        : text;
    position = token.end;
  }
  return result + decoder.decode(bytes.slice(position));
}
