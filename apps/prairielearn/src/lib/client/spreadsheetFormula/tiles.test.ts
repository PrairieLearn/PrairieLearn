import { describe, expect, it } from 'vitest';

import { parseFormula } from './parser.js';
import { layoutFormula } from './tiles.js';

const EDGE = { convex: '<', concave: ']', flat: '|' } as const;
const RIGHT_EDGE = { convex: '>', concave: '[', flat: '|' } as const;

/** Renders pieces like `<SUM([` with edge marks, `{kind}` for holes, and `+` for joins. */
function layout(formula: string) {
  return layoutFormula(parseFormula(formula)!)
    .map((piece) => {
      if (piece.kind === 'gap') return ' ';
      const body =
        piece.kind === 'tile'
          ? piece.tokens.map((token) => token.text).join('')
          : `{${piece.hole.kind}}`;
      return `${piece.joined ? '+' : ''}${EDGE[piece.left]}${body}${RIGHT_EDGE[piece.right]}`;
    })
    .join('');
}

describe('layoutFormula', () => {
  it('interlocks values, operators, and call shards', () => {
    expect(layout('=SUM(A1,-B1%)*2')).toBe('|=[+<SUM([+<A1>+],[+<-[+<B1>+]%>+])>+]*[+<2>');
  });

  it('draws holes shaped like what belongs in them', () => {
    expect(layout('=SUMIF(')).toBe('|=[+<SUMIF([|{argument}|<{argument}>+]{delimiter}>');
    expect(layout('=1+')).toBe('|=[+<1>+]+[+<{operand}>');
    expect(layout('=A1 B1')).toBe('|=[+<A1>+]{operator}[ <B1>');
  });

  it('puts an optional name hole before a bare group', () => {
    expect(layout('=(1)')).toBe('|=[+<{name}||([+<1>+])>');
  });

  it('makes the leading = a prefix tile for the whole expression', () => {
    expect(layout('=')).toBe('|=[+<{operand}>');
  });

  it('separates tiles at whitespace', () => {
    expect(layout('=1 + 2')).toBe('|=[+<1> ]+[ <2>');
  });

  it('cycles the colors of nested calls and groups by depth', () => {
    const colors = layoutFormula(parseFormula('=SUM((ABS((1))),(')!)
      .filter((piece) => piece.kind !== 'gap' && piece.nestingColor !== null)
      .map((piece) => {
        if (piece.kind === 'gap') throw new Error('unreachable');
        const text =
          piece.kind === 'tile'
            ? piece.tokens.map((token) => token.text).join('')
            : `{${piece.hole.kind}}`;
        return `${text}${piece.nestingColor}`;
      });
    expect(colors).toEqual([
      'SUM(0',
      '{name}1',
      '(1',
      'ABS(2',
      '{name}0',
      '(0',
      ')0',
      ')2',
      ')1',
      ',0',
      '{name}1',
      '(1',
      '{delimiter}1',
      '{delimiter}0',
    ]);
  });

  it('marks shards outside any call as errors', () => {
    const pieces = layoutFormula(parseFormula('=1)')!);
    expect(pieces.at(-1)).toMatchObject({ kind: 'tile', sort: 'error' });
  });
});
