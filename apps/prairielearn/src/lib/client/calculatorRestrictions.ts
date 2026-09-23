import {
  ARITHMETIC_DICTIONARY,
  CORE_DICTIONARY,
  LatexSyntax,
  type MathJsonExpression,
  SYMBOLS_DICTIONARY,
  TRIGONOMETRY_DICTIONARY,
} from '@cortex-js/compute-engine';

export type RestrictedCalculatorMode = 'basic' | 'scientific';

// Parse without canonicalization so operations such as 2^3 cannot simplify to an
// allowed number before we check them. These are Compute Engine's exported parser APIs.
const syntax = {
  basic: new LatexSyntax({
    dictionary: [...CORE_DICTIONARY, ...SYMBOLS_DICTIONARY, ...ARITHMETIC_DICTIONARY],
  }),
  scientific: new LatexSyntax({
    dictionary: [
      ...CORE_DICTIONARY,
      ...SYMBOLS_DICTIONARY,
      ...ARITHMETIC_DICTIONARY,
      ...TRIGONOMETRY_DICTIONARY,
    ],
  }),
};

export function parseCalculatorExpression(latex: string, mode: RestrictedCalculatorMode) {
  return syntax[mode].parse(latex) ?? 'Nothing';
}

const editingCommands = new Set([
  'frac',
  'dfrac',
  'tfrac',
  'times',
  'cdot',
  'div',
  'left',
  'right',
  'placeholder',
  'operatorname',
  'mathrm',
  'mathit',
  'text',
]);
const scientificCommands = new Set([
  'sqrt',
  'sin',
  'cos',
  'tan',
  'arcsin',
  'arccos',
  'arctan',
  'ln',
  'log',
  'lg',
  'pi',
  'exponentialE',
  'imaginaryI',
  'lvert',
  'rvert',
  'vert',
]);

/** Accept unfinished allowed expressions, but never unsupported display commands or symbols. */
export function isSupportedCalculatorInput(latex: string, mode: RestrictedCalculatorMode): boolean {
  const names =
    mode === 'basic'
      ? []
      : ['ans', 'sin', 'cos', 'tan', 'sqrt', 'root', 'ln', 'log', 'pi', 'abs', 'e', 'i'];
  // Ans is a controlled button insertion, not an editable variable name.
  if (mode === 'basic') {
    // MathLive adds an upright-font wrapper when it edits an existing operator.
    latex = latex.replaceAll(/\\operatorname\s*\{(?:ans|\\mathrm\s*\{ans\})\}/g, '0');
  }
  const tokens = latex.match(/\\[a-zA-Z]+|\\.|[a-zA-Z]+|[^a-zA-Z\\]/gu) ?? [];
  for (const token of tokens) {
    if (token.startsWith('\\')) {
      const command = token.slice(1);
      if (
        editingCommands.has(command) ||
        ['%', ',', ' ', '!', ';', ':'].includes(command) ||
        (mode === 'scientific' && scientificCommands.has(command))
      ) {
        continue;
      }
      return false;
    }
    if (/^[a-zA-Z]+$/.test(token)) {
      // Prefixes keep physical-keyboard shortcuts editable (s → si → sin).
      if (names.some((name) => name.startsWith(token))) continue;
      return false;
    }
    if (
      /^[\d\s.+\-*/(){}%#?@]$/.test(token) ||
      (mode === 'scientific' && '^_[]|'.includes(token))
    ) {
      continue;
    }
    return false;
  }
  return true;
}

const arithmetic = new Set([
  'Add',
  'Subtract',
  'Multiply',
  'Divide',
  'Negate',
  'Rational',
  'Delimiter',
  'InvisibleOperator',
]);
const scientific = new Set([
  'Power',
  'Square',
  'Sqrt',
  'Root',
  'Exp',
  'Ln',
  'Log',
  'Lb',
  'Lg',
  'Abs',
  'Sin',
  'Cos',
  'Tan',
  'Arcsin',
  'Arccos',
  'Arctan',
]);

/** Inspect the non-canonical tree: simplification must not erase forbidden operations. */
export function isSupportedCalculatorExpression(
  expression: MathJsonExpression,
  mode: RestrictedCalculatorMode,
): boolean {
  if (typeof expression === 'number') {
    return Number.isFinite(expression);
  }
  if (typeof expression === 'string') {
    return (
      expression === 'ans' ||
      (mode === 'scientific' &&
        ['Pi', 'ExponentialE', 'e', 'ImaginaryUnit', 'i'].includes(expression))
    );
  }
  if (Array.isArray(expression)) {
    const [operator, ...args] = expression;
    // Also accept the explicit MathJSON inverse-function application form.
    const inverseTrig =
      mode === 'scientific' &&
      operator === 'Apply' &&
      args.length === 2 &&
      Array.isArray(args[0]) &&
      args[0][0] === 'InverseFunction' &&
      args[0].length === 2 &&
      ['Sin', 'Cos', 'Tan'].includes(String(args[0][1]));
    if (
      !inverseTrig &&
      (typeof operator !== 'string' ||
        !(arithmetic.has(operator) || (mode === 'scientific' && scientific.has(operator))))
    ) {
      return false;
    }
    return (inverseTrig ? [args[1]] : args).every((arg) =>
      isSupportedCalculatorExpression(arg, mode),
    );
  }
  if ('num' in expression) {
    return Number.isFinite(Number(expression.num));
  }
  return false;
}
