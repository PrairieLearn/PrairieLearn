import { describe, expect, it } from 'vitest';

import { FORMULA_FUNCTION_SIGNATURES } from './functions.js';
import { applyCompletion, getCompletion, getSignatureHint } from './suggestions.js';

function completionNames(formula: string, caret = formula.length) {
  return getCompletion(formula, caret)?.matches.map((signature) => signature.name) ?? null;
}

describe('getCompletion', () => {
  it('lists prefix matches before substring matches', () => {
    expect(completionNames('=SU')).toEqual(['SUM', 'SUMIF', 'SUMIFS', 'SUMPRODUCT']);
    expect(completionNames('=1+cou')).toEqual([
      'COUNT',
      'COUNTA',
      'COUNTBLANK',
      'COUNTIF',
      'COUNTIFS',
    ]);
  });

  it('completes identifiers that lex as references or booleans', () => {
    expect(completionNames('=LOG1')).toEqual(['LOG10']);
    expect(completionNames('=TRUE')).toEqual(['TRUE']);
  });

  it('only completes in operand positions', () => {
    expect(completionNames('=A1 SU')).toBeNull();
    expect(completionNames('="SU')).toBeNull();
    expect(completionNames('SU')).toBeNull();
    expect(completionNames('=B2')).toBeNull();
  });

  it('completes the identifier before the caret', () => {
    expect(completionNames('=MAX(A1)+MI(B1)', 11)).toEqual(['MID', 'MIN', 'SUMIF', 'SUMIFS']);
  });
});

describe('applyCompletion', () => {
  function complete(formula: string, name: string, caret = formula.length) {
    return applyCompletion(
      formula,
      getCompletion(formula, caret)!,
      FORMULA_FUNCTION_SIGNATURES.get(name)!,
    );
  }

  it('inserts the function name and an opening parenthesis', () => {
    expect(complete('=1+su', 'SUM')).toEqual({ formula: '=1+SUM(', caret: 7 });
    expect(complete('=su+1', 'SUM', 3)).toEqual({ formula: '=SUM(+1', caret: 5 });
  });

  it('turns a bare group into a call', () => {
    expect(complete('=SU(A1+B1)', 'SUM', 3)).toEqual({ formula: '=SUM(A1+B1)', caret: 5 });
  });

  it('reuses an existing parenthesis', () => {
    expect(complete('=SU(A1)', 'SUM', 3)).toEqual({ formula: '=SUM(A1)', caret: 5 });
  });

  it('inserts constants and zero-argument functions whole', () => {
    expect(complete('=tr', 'TRUE')).toEqual({ formula: '=TRUE', caret: 5 });
    expect(complete('=p', 'PI')).toEqual({ formula: '=PI()', caret: 5 });
  });
});

describe('getSignatureHint', () => {
  function hint(formula: string, caret = formula.length) {
    const result = getSignatureHint(formula, caret);
    return result && [result.signature.name, result.argumentIndex, result.argumentName];
  }

  it('tracks the current argument of the innermost call', () => {
    expect(hint('=SUM(')).toEqual(['SUM', 0, 'number1']);
    expect(hint('=SUMIF(A1:A3, ">0", ')).toEqual(['SUMIF', 2, 'sum_range']);
    expect(hint('=IF(MAX(A1, B1')).toEqual(['MAX', 1, 'number2']);
    expect(hint('=IF(MAX(A1, B1), ')).toEqual(['IF', 1, 'value_if_true']);
  });

  it('ignores commas inside strings and closed calls', () => {
    expect(hint('=LEN("a,b"')).toEqual(['LEN', 0, 'text']);
    expect(hint('=SUM(A1)')).toBeNull();
    expect(hint('=(1,')).toBeNull();
  });

  it('reports arguments beyond the signature', () => {
    expect(hint('=ABS(1, ')).toEqual(['ABS', 1, null]);
  });
});
