import { describe, expect, it } from 'vitest';

import { formulaReferences, tokenizeFormula } from './lexer.js';

function kinds(text: string) {
  return tokenizeFormula(text)
    .filter((token) => token.kind !== 'whitespace')
    .map((token) => [token.kind, token.text]);
}

describe('tokenizeFormula', () => {
  it('tokenizes a function call over a range', () => {
    expect(kinds('SUM(B2:B4, $C$1) * 2')).toEqual([
      ['function', 'SUM'],
      ['lparen', '('],
      ['range', 'B2:B4'],
      ['comma', ','],
      ['ref', '$C$1'],
      ['rparen', ')'],
      ['operator', '*'],
      ['number', '2'],
    ]);
  });

  it('recognizes sheet-qualified and open-ended references', () => {
    expect(kinds("Inputs!A1+'My sheet'!B2:C3+A:C+1:3+B2:B")).toEqual([
      ['ref', 'Inputs!A1'],
      ['operator', '+'],
      ['range', "'My sheet'!B2:C3"],
      ['operator', '+'],
      ['range', 'A:C'],
      ['operator', '+'],
      ['range', '1:3'],
      ['operator', '+'],
      ['range', 'B2:B'],
    ]);
  });

  it('distinguishes functions, cells, booleans, and names', () => {
    expect(kinds('LOG10(A1) LOG10 true SU')).toEqual([
      ['function', 'LOG10'],
      ['lparen', '('],
      ['ref', 'A1'],
      ['rparen', ')'],
      ['ref', 'LOG10'],
      ['boolean', 'true'],
      ['name', 'SU'],
    ]);
  });

  it('tokenizes strings, comparisons, and errors', () => {
    expect(kinds('IF(A1<>"a""b",1.5e3,"x')).toEqual([
      ['function', 'IF'],
      ['lparen', '('],
      ['ref', 'A1'],
      ['comparison', '<>'],
      ['string', '"a""b"'],
      ['comma', ','],
      ['number', '1.5e3'],
      ['comma', ','],
      ['string', '"x'],
    ]);
    expect(tokenizeFormula('"x').at(-1)?.unterminated).toBe(true);
    expect(kinds('A1 # {')).toEqual([
      ['ref', 'A1'],
      ['error', '#'],
      ['error', '{'],
    ]);
  });

  it('always reproduces its input', () => {
    for (const text of [
      '',
      'SUM(',
      "'unterminated",
      "'Sheet'!",
      'A1:',
      '$$$',
      '((1+2)*3)^-4%',
      'IF(AND(A1>=0,B$2<=1),"ok","no")&C3',
    ]) {
      expect(
        tokenizeFormula(text)
          .map((token) => token.text)
          .join(''),
      ).toBe(text);
    }
  });
});

describe('formulaReferences', () => {
  it('colors equivalent references the same', () => {
    const references = formulaReferences(tokenizeFormula('A1+$a$1+B2:B3+A1'));
    expect(references.map((reference) => reference.colorIndex)).toEqual([0, 0, 1, 0]);
  });
});
