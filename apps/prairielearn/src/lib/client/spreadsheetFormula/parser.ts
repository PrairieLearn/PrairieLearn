// Total parser for spreadsheet formulas, ported from the structure-preserving editing
// prototype for pl-symbolic-input. It runs on every keystroke and never throws:
// anything missing from a half-typed formula becomes an explicit hole rather than an
// error, so the formula bar can show what still needs to be filled in.

import {
  FORMULA_FUNCTION_SIGNATURES,
  type FormulaArgument,
  type FormulaFunctionSignature,
  argumentAt,
} from './functions.js';
import { type FormulaToken, formulaTokens } from './lexer.js';

type FormulaHoleKind = 'operand' | 'argument' | 'operator' | 'delimiter' | 'name';

export interface FormulaHole {
  kind: FormulaHoleKind;
  /** The offset in the formula where the hole sits. Holes occupy no characters. */
  position: number;
  /** For argument holes, the function and the argument it expects, if known. */
  functionName?: string;
  argument?: FormulaArgument | null;
  /**
   * Set on the function-name hole before a bare group's `(`, which may be filled to turn
   * the group into a call but is never missing.
   */
  optional?: boolean;
}

export type FormulaNode =
  | { kind: 'literal' | 'reference' | 'name' | 'error'; token: FormulaToken }
  | {
      kind: 'call';
      name: FormulaToken;
      signature: FormulaFunctionSignature | null;
      args: FormulaNode[];
      close: FormulaToken | null;
    }
  | { kind: 'group'; inner: FormulaNode; close: FormulaToken | null }
  | { kind: 'prefix' | 'postfix'; operator: FormulaToken; operand: FormulaNode }
  | { kind: 'infix'; operator: FormulaToken; left: FormulaNode; right: FormulaNode }
  // An operator hole keeps the two values it sits between, like the prototype's.
  | { kind: 'hole'; hole: FormulaHole; left?: FormulaNode; right?: FormulaNode };

/** A function call or parenthesized group, drawn as one tile split into several shards. */
interface FormulaContainer {
  start: number;
  /** The end of the closing parenthesis, or where it is missing. */
  end: number;
  /** The function name, parentheses, and commas that make up the tile. */
  shards: FormulaToken[];
  /** Holes standing in for a shard: a group's optional name, or a missing `)`. */
  holes: FormulaHole[];
}

export interface FormulaPhantom {
  /**
   * `close` stands in for a deleted `)` so the call or group still ends where it did;
   * `split` keeps the tokens on either side of a deleted operator from merging.
   */
  kind: 'close' | 'split';
  position: number;
}

export interface FormulaStructure {
  root: FormulaNode;
  tokens: FormulaToken[];
  holes: FormulaHole[];
  containers: FormulaContainer[];
  /** Positions of infix operators, which a deletion may turn into an operator hole. */
  operatorPositions: number[];
  /** Positions of real closing parentheses, which a deletion may turn into a phantom. */
  closePositions: number[];
  /** Whether anything is missing, stray, or unrecognized. */
  complete: boolean;
}

const INFIX_BINDING_POWER: Record<string, number> = {
  '=': 1,
  '<>': 1,
  '<': 1,
  '>': 1,
  '<=': 1,
  '>=': 1,
  '&': 2,
  '+': 3,
  '-': 3,
  '*': 4,
  '/': 4,
  '^': 5,
};
// Like Excel, negation binds tighter than percent, which binds tighter than
// exponentiation: -2^2 is 4.
const PERCENT_BINDING_POWER = 6;
const PREFIX_BINDING_POWER = 7;
const OPERATOR_HOLE_BINDING_POWER = 1;
const OPERAND_START_KINDS = new Set([
  'number',
  'string',
  'boolean',
  'ref',
  'range',
  'name',
  'function',
  'lparen',
]);

class Parser {
  private readonly significant: FormulaToken[];
  private position = 0;
  private lastEnd: number;
  readonly holes: FormulaHole[] = [];
  readonly containers: FormulaContainer[] = [];
  readonly operatorPositions: number[] = [];
  readonly closePositions: number[] = [];
  problems = 0;

  constructor(
    tokens: FormulaToken[],
    private readonly length: number,
  ) {
    this.significant = tokens.filter((token) => token.kind !== 'whitespace');
    this.lastEnd = 1;
  }

  peek(): FormulaToken | null {
    return this.significant[this.position] ?? null;
  }

  private peekStart() {
    return this.peek()?.start ?? this.length;
  }

  skip() {
    this.consume();
  }

  private consume(): FormulaToken {
    const token = this.significant[this.position];
    this.position += 1;
    this.lastEnd = token.end;
    return token;
  }

  private hole(hole: FormulaHole): FormulaNode {
    this.holes.push(hole);
    return { kind: 'hole', hole };
  }

  parseExpression(minBindingPower: number): FormulaNode {
    return this.parseInfix(this.parsePrefix(), minBindingPower);
  }

  parseInfix(initial: FormulaNode, minBindingPower: number): FormulaNode {
    let left = initial;
    for (;;) {
      const token = this.peek();
      if (!token) return left;
      if (token.kind === 'error') {
        // Skip a stray character so it does not break up the structure around it.
        this.problems += 1;
        this.consume();
        continue;
      }
      if (token.kind === 'operator' && token.text === '%') {
        if (PERCENT_BINDING_POWER < minBindingPower) return left;
        left = { kind: 'postfix', operator: this.consume(), operand: left };
        continue;
      }
      const bindingPower =
        token.kind === 'operator' || token.kind === 'comparison'
          ? INFIX_BINDING_POWER[token.text]
          : undefined;
      if (bindingPower !== undefined) {
        if (bindingPower < minBindingPower) return left;
        this.operatorPositions.push(token.start);
        const operator = this.consume();
        const right = this.parseExpression(bindingPower + 1);
        left = { kind: 'infix', operator, left, right };
        continue;
      }
      if (OPERAND_START_KINDS.has(token.kind)) {
        // Two values with nothing between them: keep both and mark the missing operator.
        if (OPERATOR_HOLE_BINDING_POWER < minBindingPower) return left;
        const hole: FormulaHole = { kind: 'operator', position: this.lastEnd };
        this.holes.push(hole);
        const right = this.parseExpression(OPERATOR_HOLE_BINDING_POWER + 1);
        left = { kind: 'hole', hole, left, right };
        continue;
      }
      return left;
    }
  }

  private parsePrefix(): FormulaNode {
    const token = this.peek();
    if (!token) return this.hole({ kind: 'operand', position: this.length });
    switch (token.kind) {
      case 'number':
      case 'string':
      case 'boolean':
        if (token.unterminated) this.problems += 1;
        return { kind: 'literal', token: this.consume() };
      case 'ref':
      case 'range':
        return { kind: 'reference', token: this.consume() };
      case 'name':
        this.problems += 1;
        return { kind: 'name', token: this.consume() };
      case 'error':
        this.problems += 1;
        return { kind: 'error', token: this.consume() };
      case 'function':
        return this.parseCall(this.consume());
      case 'lparen':
        return this.parseGroup(this.consume());
      case 'operator':
        if (token.text === '-' || token.text === '+') {
          const operator = this.consume();
          return {
            kind: 'prefix',
            operator,
            operand: this.parseExpression(PREFIX_BINDING_POWER),
          };
        }
        return this.hole({ kind: 'operand', position: token.start });
      default:
        return this.hole({ kind: 'operand', position: token.start });
    }
  }

  /** Consumes the closing parenthesis, or records a delimiter hole where it is missing. */
  private parseClose(): { close: FormulaToken | null; end: number; hole: FormulaHole | null } {
    if (this.peek()?.kind === 'rparen') {
      const close = this.consume();
      if (close.text !== '') {
        this.closePositions.push(close.start);
        return { close, end: close.end, hole: null };
      }
      const hole: FormulaHole = { kind: 'delimiter', position: close.start };
      this.holes.push(hole);
      return { close, end: close.end, hole };
    }
    // After any trailing whitespace and argument holes, i.e. where the `)` would be typed.
    const hole: FormulaHole = { kind: 'delimiter', position: this.peekStart() };
    this.holes.push(hole);
    return { close: null, end: this.length, hole };
  }

  private parseGroup(open: FormulaToken): FormulaNode {
    const nameHole: FormulaHole = { kind: 'name', position: open.start, optional: true };
    this.holes.push(nameHole);
    const next = this.peek();
    const inner =
      !next || next.kind === 'rparen' || next.kind === 'comma'
        ? this.hole({ kind: 'operand', position: this.peekStart() })
        : this.parseExpression(0);
    const { close, end, hole } = this.parseClose();
    this.containers.push({
      start: open.start,
      end,
      shards: close ? [open, close] : [open],
      holes: hole ? [nameHole, hole] : [nameHole],
    });
    return { kind: 'group', inner, close };
  }

  private parseCall(name: FormulaToken): FormulaNode {
    const functionName = name.text.toUpperCase();
    const signature = FORMULA_FUNCTION_SIGNATURES.get(functionName) ?? null;
    if (!signature) this.problems += 1;
    // The lexer only produces a function token when a `(` follows it.
    const shards = [name, this.consume()];
    const args: FormulaNode[] = [];
    const takesArguments =
      !signature || signature.args.length > 0 || signature.repeat !== undefined;
    const next = this.peek();
    if (next?.kind !== 'rparen' && (takesArguments || next)) {
      for (;;) {
        const token = this.peek();
        const argument = signature ? argumentAt(signature, args.length) : null;
        args.push(
          !token || token.kind === 'comma' || token.kind === 'rparen'
            ? this.hole({
                kind: 'argument',
                position: this.peekStart(),
                functionName,
                argument,
              })
            : this.parseExpression(0),
        );
        if (this.peek()?.kind !== 'comma') break;
        shards.push(this.consume());
      }
    }
    if (signature) {
      for (let index = args.length; index < signature.args.length; index += 1) {
        if (signature.args[index].optional) break;
        this.holes.push({
          kind: 'argument',
          position: this.peek()?.kind === 'rparen' ? this.peekStart() : this.lastEnd,
          functionName,
          argument: signature.args[index],
        });
      }
    }
    const { close, end, hole } = this.parseClose();
    if (close) shards.push(close);
    this.containers.push({ start: name.start, end, shards, holes: hole ? [hole] : [] });
    return { kind: 'call', name, signature, args, close };
  }
}

/**
 * Parses a formula (including its leading `=`), or returns null if the text is not a
 * formula. `phantoms` mark deleted parentheses and operators that should still shape
 * the structure; see `nextPhantoms`.
 */
export function parseFormula(
  formula: string,
  phantoms: FormulaPhantom[] = [],
): FormulaStructure | null {
  const tokens = formulaTokens(
    formula,
    phantoms.map((phantom) => phantom.position),
  );
  if (!tokens) return null;
  for (const phantom of phantoms) {
    if (phantom.kind !== 'close') continue;
    const index = tokens.findIndex((token) => token.start >= phantom.position);
    const token: FormulaToken = {
      kind: 'rparen',
      text: '',
      start: phantom.position,
      end: phantom.position,
    };
    tokens.splice(index === -1 ? tokens.length : index, 0, token);
  }

  const parser = new Parser(tokens, formula.length);
  let root = parser.parseExpression(0);
  for (let token = parser.peek(); token; token = parser.peek()) {
    // Only a `)` or `,` can be left over. A phantom `)` with nothing to close is ignored.
    parser.skip();
    if (token.text !== '') parser.problems += 1;
    root = parser.parseInfix(root, 0);
  }

  return {
    root,
    tokens,
    holes: parser.holes.sort((a, b) => a.position - b.position),
    containers: parser.containers,
    operatorPositions: parser.operatorPositions,
    closePositions: parser.closePositions,
    complete: parser.holes.every((hole) => hole.optional) && parser.problems === 0,
  };
}
