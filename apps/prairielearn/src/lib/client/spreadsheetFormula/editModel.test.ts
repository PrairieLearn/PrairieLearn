import { describe, expect, it } from 'vitest';

import { closeTrailingParentheses, describeFirstHole, nextPhantoms } from './editModel.js';
import { parseFormula } from './parser.js';

describe('nextPhantoms', () => {
  it('keeps a deleted closing parenthesis where it was', () => {
    const phantoms = nextPhantoms({ formula: '=SUM(A1)+B1', phantoms: [] }, '=SUM(A1+B1');
    expect(phantoms).toEqual([{ kind: 'close', position: 7 }]);
    expect(parseFormula('=SUM(A1+B1', phantoms)?.holes).toEqual([
      { kind: 'delimiter', position: 7 },
    ]);
  });

  it('keeps a deleted operator as an operator hole', () => {
    const phantoms = nextPhantoms({ formula: '=A1+B1', phantoms: [] }, '=A1B1');
    expect(phantoms).toEqual([{ kind: 'split', position: 3 }]);
    expect(parseFormula('=A1B1', phantoms)?.holes).toEqual([{ kind: 'operator', position: 3 }]);
  });

  it('shifts phantoms with edits elsewhere and drops them once resolved', () => {
    const state = { formula: '=SUM(A1+B1', phantoms: [{ kind: 'close', position: 7 }] as const };
    expect(nextPhantoms({ ...state, phantoms: [...state.phantoms] }, '=SUM(A12+B1')).toEqual([
      { kind: 'close', position: 8 },
    ]);
    expect(nextPhantoms({ ...state, phantoms: [...state.phantoms] }, '=SUM(A1+B12')).toEqual([
      { kind: 'close', position: 7 },
    ]);
    // Typing `)` back where it was resolves the phantom.
    expect(nextPhantoms({ ...state, phantoms: [...state.phantoms] }, '=SUM(A1)+B1')).toEqual([]);
    // Closing the call at the end instead makes the formula complete, which also drops it.
    expect(nextPhantoms({ ...state, phantoms: [...state.phantoms] }, '=SUM(A1+B1)')).toEqual([]);
  });

  it('does not create phantoms for other deletions', () => {
    expect(nextPhantoms({ formula: '=SUM(A1', phantoms: [] }, '=SUM(A')).toEqual([]);
    expect(nextPhantoms({ formula: '="a+b"', phantoms: [] }, '="ab"')).toEqual([]);
  });
});

describe('closeTrailingParentheses', () => {
  it('closes calls and groups left open at the end', () => {
    expect(closeTrailingParentheses('=SUM(A1, MAX(B1')).toBe('=SUM(A1, MAX(B1))');
    expect(closeTrailingParentheses('=(1+2 ')).toBe('=(1+2) ');
    expect(closeTrailingParentheses('=SUM(A1)')).toBe('=SUM(A1)');
    expect(closeTrailingParentheses('text (')).toBe('text (');
  });
});

describe('describeFirstHole', () => {
  it('names the first missing piece', () => {
    expect(describeFirstHole('=SUMIF(A1:A3)')).toBe('SUMIF is missing criteria.');
    expect(describeFirstHole('=1+')).toBe('A value is missing.');
    expect(describeFirstHole('=SUM(A1)')).toBeNull();
  });
});
