import { describe, expect, it } from 'vitest';

import { formatReference, isPointingPosition, resolveReference } from './references.js';

describe('isPointingPosition', () => {
  it('accepts positions where a value is expected', () => {
    for (const formula of ['=', '=SUM(', '=SUM(A1, ', '=1+', '=A1>=', '=(1)*(']) {
      expect(isPointingPosition(formula, formula.length)).toBe(true);
    }
    expect(isPointingPosition('=SUM(  )', 6)).toBe(true);
    expect(isPointingPosition('=1+A1', 3)).toBe(true);
  });

  it('rejects positions after a value or inside a token', () => {
    for (const formula of ['=A1', '=SUM(A1)', '=5%', '=SU', '="a', 'text', '']) {
      expect(isPointingPosition(formula, formula.length)).toBe(false);
    }
    expect(isPointingPosition('=A1+B1', 2)).toBe(false);
  });
});

describe('formatReference', () => {
  it('formats single cells and normalized ranges', () => {
    expect(formatReference({ row: 1, column: 1 }, { row: 1, column: 1 })).toBe('B2');
    expect(formatReference({ row: 3, column: 2 }, { row: 1, column: 1 })).toBe('B2:C4');
  });
});

describe('resolveReference', () => {
  const sheet = { rows: 10, columns: 5 };

  it('resolves cells and ranges', () => {
    expect(resolveReference('$b$2', sheet)).toEqual({
      sheetName: null,
      range: { startRow: 1, endRow: 1, startColumn: 1, endColumn: 1 },
    });
    expect(resolveReference('C4:B2', sheet)?.range).toEqual({
      startRow: 1,
      endRow: 3,
      startColumn: 1,
      endColumn: 2,
    });
  });

  it('extends open-ended ranges to the sheet edge', () => {
    expect(resolveReference('B2:B', sheet)?.range).toEqual({
      startRow: 1,
      endRow: 9,
      startColumn: 1,
      endColumn: 1,
    });
    expect(resolveReference('A:C', sheet)?.range).toEqual({
      startRow: 0,
      endRow: 9,
      startColumn: 0,
      endColumn: 2,
    });
    expect(resolveReference('2:3', sheet)?.range).toEqual({
      startRow: 1,
      endRow: 2,
      startColumn: 0,
      endColumn: 4,
    });
  });

  it('reports sheet names', () => {
    expect(resolveReference('Inputs!A1', sheet)?.sheetName).toBe('Inputs');
    expect(resolveReference("'Bob''s data'!A1:B2", sheet)?.sheetName).toBe("Bob's data");
  });
});
