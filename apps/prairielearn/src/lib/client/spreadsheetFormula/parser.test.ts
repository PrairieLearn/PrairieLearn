import { describe, expect, it } from 'vitest';

import { type FormulaNode, type FormulaPhantom, parseFormula } from './parser.js';

/** Renders a parse tree compactly: holes as `□kind`, missing `)` as `⟩`. */
function show(node: FormulaNode): string {
  switch (node.kind) {
    case 'literal':
    case 'reference':
    case 'name':
    case 'error':
      return node.token.text;
    case 'call':
      return `${node.name.text}(${node.args.map(show).join(', ')}${node.close?.text || '⟩'}`;
    case 'group':
      return `(${show(node.inner)}${node.close?.text || '⟩'}`;
    case 'prefix':
      return `(${node.operator.text}${show(node.operand)})`;
    case 'postfix':
      return `(${show(node.operand)}${node.operator.text})`;
    case 'infix':
      return `(${show(node.left)} ${node.operator.text} ${show(node.right)})`;
    case 'hole':
      return node.left && node.right
        ? `(${show(node.left)} □operator ${show(node.right)})`
        : `□${node.hole.kind}`;
  }
}

function parse(formula: string, phantoms?: FormulaPhantom[]) {
  const structure = parseFormula(formula, phantoms)!;
  return {
    tree: show(structure.root),
    holes: structure.holes.map((hole) =>
      [hole.kind, hole.position, hole.argument?.name].filter((part) => part !== undefined),
    ),
    complete: structure.complete,
  };
}

describe('parseFormula', () => {
  it('parses complete formulas with Excel precedence', () => {
    expect(parse('=1+2*3^-4%')).toEqual({
      tree: '(1 + (2 * (3 ^ ((-4)%))))',
      holes: [],
      complete: true,
    });
    expect(parse('=-2^2').tree).toBe('((-2) ^ 2)');
    expect(parse('=A1&"x"=B1').tree).toBe('((A1 & "x") = B1)');
    expect(parse('=SUM(Inputs!D2:D6, 1)').tree).toBe('SUM(Inputs!D2:D6, 1)');
    expect(parse('=PI()').complete).toBe(true);
  });

  it('turns a half-typed call into argument and delimiter holes', () => {
    expect(parse('=SUM(')).toEqual({
      tree: 'SUM(□argument⟩',
      holes: [
        ['argument', 5, 'number1'],
        ['delimiter', 5],
      ],
      complete: false,
    });
    expect(parse('=SUMIF(A1:A3').holes).toEqual([
      ['argument', 12, 'criteria'],
      ['delimiter', 12],
    ]);
    expect(parse('=IF(A1>0,,1)').holes).toEqual([['argument', 9, 'value_if_true']]);
    expect(parse('=SUMIF(A1:A3, ').holes).toEqual([
      ['argument', 14, 'criteria'],
      ['delimiter', 14],
    ]);
  });

  it('marks missing operands and operators', () => {
    expect(parse('=1+').holes).toEqual([['operand', 3]]);
    expect(parse('=').holes).toEqual([['operand', 1]]);
    expect(parse('=A1 B1*2')).toMatchObject({
      tree: '(A1 □operator (B1 * 2))',
      holes: [['operator', 3]],
    });
  });

  it('reports stray and unknown tokens as incomplete without holes', () => {
    expect(parse('=1)+2')).toMatchObject({ tree: '(1 + 2)', holes: [], complete: false });
    expect(parse('=FOO(1)').complete).toBe(false);
    expect(parse('=foo').complete).toBe(false);
    expect(parse('=SUM(A1 # B1, 2)')).toMatchObject({
      tree: 'SUM((A1 □operator B1), 2)',
      holes: [['operator', 9]],
      complete: false,
    });
  });

  it('offers an optional function name before a bare group', () => {
    expect(parse('=(A1+B1)*2')).toEqual({
      tree: '(((A1 + B1)) * 2)',
      holes: [['name', 1]],
      complete: true,
    });
    expect(parseFormula('=(A1+B1)')?.holes[0].optional).toBe(true);
    expect(parse('=SU(A1+B1)').tree).toBe('SU((A1 + B1))');
  });

  it('uses phantoms to keep deleted parentheses and operators in place', () => {
    expect(parse('=SUM(A1+B1', [{ kind: 'close', position: 7 }])).toMatchObject({
      tree: '(SUM(A1⟩ + B1)',
      holes: [['delimiter', 7]],
    });
    expect(parse('=A1B1', [{ kind: 'split', position: 3 }])).toMatchObject({
      tree: '(A1 □operator B1)',
      holes: [['operator', 3]],
    });
  });

  it('never throws on any prefix of a formula', () => {
    for (const formula of [
      '=SUM(Inputs!D2:D6)*IF(A1>=0,"yes","no")&TEXT(B2, "0.00")',
      '=AVERAGEIFS(\'My sheet\'!A:A, B1:B, ">5", C$1:C$9, "<>")-(-(1+2)%)^3',
      '=1)2,(3 # {',
    ]) {
      for (let end = 1; end <= formula.length; end += 1) {
        expect(() => parseFormula(formula.slice(0, end))).not.toThrow();
      }
    }
  });
});
