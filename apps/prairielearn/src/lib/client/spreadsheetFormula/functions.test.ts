import { describe, expect, it } from 'vitest';

import { SPREADSHEET_ALLOWED_FUNCTIONS } from '../../spreadsheet.js';

import { FORMULA_FUNCTION_SIGNATURES, argumentAt, formatSignature } from './functions.js';

describe('formula function signatures', () => {
  it('covers exactly the allowed functions', () => {
    expect([...FORMULA_FUNCTION_SIGNATURES.keys()].sort()).toEqual(
      [...SPREADSHEET_ALLOWED_FUNCTIONS].sort(),
    );
  });

  it('numbers repeated arguments', () => {
    const countifs = FORMULA_FUNCTION_SIGNATURES.get('COUNTIFS')!;
    expect(argumentAt(countifs, 2)).toEqual({
      name: 'criteria_range2',
      kind: 'range',
      optional: true,
    });
    expect(argumentAt(countifs, 5)?.name).toBe('criteria3');
    expect(argumentAt(FORMULA_FUNCTION_SIGNATURES.get('ABS')!, 1)).toBeNull();
  });

  it('formats signatures', () => {
    expect(formatSignature(FORMULA_FUNCTION_SIGNATURES.get('SUM')!)).toEqual([
      'range1',
      '[range2]',
      '…',
    ]);
    expect(formatSignature(FORMULA_FUNCTION_SIGNATURES.get('SUMIF')!)).toEqual([
      'range',
      'criteria',
      '[sum_range]',
    ]);
  });
});
