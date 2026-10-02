import { type SpreadsheetCellRange, cellAddress } from '../../spreadsheet.js';

import { formulaTokens } from './lexer.js';

// Offsets in this module index the full formula text, including the leading `=`.

const OPERAND_POSITION_KINDS = new Set(['lparen', 'comma', 'operator', 'comparison']);

/**
 * Whether a reference may be inserted at the caret, i.e. it directly follows `=`, `(`,
 * `,`, or an operator, like Google Sheets' and Excel's point mode.
 */
export function isPointingPosition(formula: string, caret: number): boolean {
  const tokens = formulaTokens(formula);
  if (!tokens || caret < 1) return false;
  let previous: { kind: string; text: string } | null = null;
  for (const token of tokens) {
    if (token.start < caret && caret < token.end) {
      return token.kind === 'whitespace' && isOperand(previous);
    }
    if (token.end > caret) break;
    if (token.kind !== 'whitespace') previous = token;
  }
  return isOperand(previous);
}

function isOperand(previous: { kind: string; text: string } | null) {
  // `%` is a postfix operator, so a value never follows it directly.
  return previous === null || (OPERAND_POSITION_KINDS.has(previous.kind) && previous.text !== '%');
}

export interface CellPosition {
  row: number;
  column: number;
}

/** Formats the cell or range spanned by two corners, e.g. `B2` or `B2:C4`. */
export function formatReference(anchor: CellPosition, focus: CellPosition): string {
  const start = cellAddress(Math.min(anchor.row, focus.row), Math.min(anchor.column, focus.column));
  const end = cellAddress(Math.max(anchor.row, focus.row), Math.max(anchor.column, focus.column));
  return start === end ? start : `${start}:${end}`;
}

const SHEET_PREFIX_PATTERN = /^(?:'((?:[^']|'')*)'|([A-Za-z_][A-Za-z0-9_.]*))!/;
const ENDPOINT_PATTERN = /^([A-Z]*)([0-9]*)$/;

function parseEndpoint(text: string): { row: number | null; column: number | null } | null {
  const match = ENDPOINT_PATTERN.exec(text);
  if (!match || (!match[1] && !match[2])) return null;
  let column = 0;
  for (const character of match[1]) column = column * 26 + character.charCodeAt(0) - 64;
  return {
    row: match[2] ? Number(match[2]) - 1 : null,
    column: match[1] ? column - 1 : null,
  };
}

/**
 * Resolves the text of a `ref` or `range` token to its sheet name (null if unqualified)
 * and cell range, extending open-ended ranges such as `B2:B` or `A:C` to the sheet's edge.
 */
export function resolveReference(
  text: string,
  sheet: { rows: number; columns: number },
): { sheetName: string | null; range: SpreadsheetCellRange } | null {
  const prefix = SHEET_PREFIX_PATTERN.exec(text);
  const sheetName = prefix
    ? prefix[0].startsWith("'")
      ? prefix[1].replaceAll("''", "'")
      : prefix[2]
    : null;
  const parts = text
    .slice(prefix?.[0].length ?? 0)
    .replaceAll('$', '')
    .toUpperCase()
    .split(':');
  const start = parseEndpoint(parts[0]);
  const end = parts.length > 1 ? parseEndpoint(parts[1]) : start;
  if (!start || !end) return null;
  const rows = [start.row ?? 0, end.row ?? sheet.rows - 1];
  const columns = [start.column ?? 0, end.column ?? sheet.columns - 1];
  return {
    sheetName,
    range: {
      startRow: Math.min(...rows),
      endRow: Math.max(...rows),
      startColumn: Math.min(...columns),
      endColumn: Math.max(...columns),
    },
  };
}
