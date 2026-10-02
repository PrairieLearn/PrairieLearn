// Lays a parsed formula out as tylr-style tiles. A tile's left and right edges show what
// fits next to it: a value has convex nibs on both sides, an infix operator has concave
// notches on both sides that values slot into, and a call is split into shards (`SUM(`,
// `,`, `)`) whose notches face the arguments between them. Holes are hollow tiles shaped
// like what belongs in them. The leading `=` is a prefix tile whose operand is the whole
// expression, like tylr's `let … in` tile and its body. Like rainbow parentheses, the
// shards of each call or group (and its name and `)` holes) share a color that cycles
// with nesting depth, so matching parentheses are easy to pair up.

import { type FormulaToken, formulaReferences } from './lexer.js';
import { type FormulaHole, type FormulaStructure } from './parser.js';

export type TileEdge = 'convex' | 'concave' | 'flat';

export type TileSort =
  'number' | 'string' | 'operator' | 'shard' | 'reference' | 'error' | 'formula';

/** The number of colors that nested calls and groups cycle through. */
export const NESTING_COLORS = 3;

interface PieceEdges {
  left: TileEdge;
  right: TileEdge;
  /** Whether this piece's left edge interlocks with the previous piece's right edge. */
  joined: boolean;
  /**
   * For shards and the holes standing in for them, the nesting depth of their call or
   * group modulo `NESTING_COLORS`.
   */
  nestingColor: number | null;
}

export type FormulaPiece =
  | (PieceEdges & {
      kind: 'tile';
      start: number;
      end: number;
      tokens: FormulaToken[];
      sort: TileSort;
      /** The call or group this shard belongs to, an index into `structure.containers`. */
      container: number | null;
      /** For references, the color shared with the reference's outline in the grid. */
      colorIndex: number | null;
    })
  | (PieceEdges & { kind: 'hole'; hole: FormulaHole })
  | { kind: 'gap'; token: FormulaToken };

const VALUE_SORTS: Partial<Record<FormulaToken['kind'], TileSort>> = {
  number: 'number',
  boolean: 'number',
  string: 'string',
  ref: 'reference',
  range: 'reference',
  name: 'error',
  error: 'error',
};

const OPERAND_POSITION_KINDS = new Set(['lparen', 'comma', 'operator', 'comparison']);

function holeEdges(hole: FormulaHole): { left: TileEdge; right: TileEdge } {
  switch (hole.kind) {
    case 'operator':
      return { left: 'concave', right: 'concave' };
    case 'delimiter':
      return { left: 'concave', right: 'convex' };
    case 'name':
      return { left: 'convex', right: 'flat' };
    case 'argument':
      return hole.argument?.kind === 'range'
        ? { left: 'flat', right: 'flat' }
        : { left: 'convex', right: 'convex' };
    case 'operand':
      return { left: 'convex', right: 'convex' };
  }
}

export function layoutFormula(structure: FormulaStructure): FormulaPiece[] {
  const containerOf = new Map<FormulaToken, number>();
  for (const [index, container] of structure.containers.entries()) {
    for (const shard of container.shards) containerOf.set(shard, index);
  }
  const containerOfHole = new Map<FormulaHole, number>();
  for (const [index, container] of structure.containers.entries()) {
    for (const hole of container.holes) containerOfHole.set(hole, index);
  }
  // A container lies inside each one whose span contains its start.
  const nestingColors = structure.containers.map(
    (container) =>
      structure.containers.filter(
        (other) =>
          other !== container && other.start <= container.start && container.start < other.end,
      ).length % NESTING_COLORS,
  );
  const nestingColorOf = (container: number | undefined | null) =>
    container == null ? null : nestingColors[container];

  const colors = new Map(
    formulaReferences(structure.tokens).map((reference) => [reference.token, reference.colorIndex]),
  );

  const pieces: FormulaPiece[] = [];

  function push(piece: Exclude<FormulaPiece, { kind: 'gap' }>) {
    const previous = pieces.at(-1);
    piece.joined =
      previous !== undefined &&
      previous.kind !== 'gap' &&
      previous.right !== 'flat' &&
      piece.left !== 'flat';
    pieces.push(piece);
  }

  push({
    kind: 'tile',
    start: 0,
    end: 1,
    tokens: [{ kind: 'comparison', text: '=', start: 0, end: 1 }],
    sort: 'formula',
    // Nothing comes before the `=`, so its left edge is flat like the start of a line.
    left: 'flat',
    right: 'concave',
    container: null,
    colorIndex: null,
    joined: false,
    nestingColor: null,
  });

  let holeIndex = 0;

  function pushHolesBefore(position: number) {
    for (; holeIndex < structure.holes.length; holeIndex += 1) {
      const hole = structure.holes[holeIndex];
      if (hole.position > position) return;
      push({
        kind: 'hole',
        hole,
        ...holeEdges(hole),
        joined: false,
        nestingColor: nestingColorOf(containerOfHole.get(hole)),
      });
    }
  }

  let previousSignificant: FormulaToken | null = null;
  const tokens = structure.tokens;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    pushHolesBefore(token.start);
    // A phantom `)` is drawn as the delimiter hole at its position.
    if (token.text === '') continue;
    if (token.kind === 'whitespace') {
      pieces.push({ kind: 'gap', token });
      continue;
    }

    const container = containerOf.get(token) ?? null;
    let tileTokens = [token];
    let sort: TileSort;
    let left: TileEdge;
    let right: TileEdge;
    const valueSort = VALUE_SORTS[token.kind];
    if (valueSort) {
      sort = valueSort;
      left = 'convex';
      right = 'convex';
    } else if (token.kind === 'operator' || token.kind === 'comparison') {
      sort = 'operator';
      const isPrefix =
        (token.text === '+' || token.text === '-') &&
        (previousSignificant === null ||
          (OPERAND_POSITION_KINDS.has(previousSignificant.kind) &&
            previousSignificant.text !== '%'));
      left = isPrefix ? 'convex' : 'concave';
      right = token.text === '%' ? 'convex' : 'concave';
    } else if (token.kind === 'function') {
      sort = container === null ? 'error' : 'shard';
      left = 'convex';
      right = 'concave';
      // The name and its `(` form a single shard.
      const next = tokens.at(index + 1);
      if (next?.kind === 'lparen') {
        tileTokens = [token, next];
        index += 1;
      } else {
        right = 'flat';
      }
    } else if (token.kind === 'lparen') {
      // A bare group's `(` sits flat against its optional name hole.
      sort = container === null ? 'error' : 'shard';
      left = 'flat';
      right = 'concave';
    } else if (token.kind === 'comma') {
      sort = container === null ? 'error' : 'shard';
      left = 'concave';
      right = 'concave';
    } else {
      sort = container === null ? 'error' : 'shard';
      left = 'concave';
      right = 'convex';
    }

    const last = tileTokens.at(-1)!;
    const tileContainer = containerOf.get(last) ?? container;
    push({
      kind: 'tile',
      start: token.start,
      end: last.end,
      tokens: tileTokens,
      sort,
      left,
      right,
      container: tileContainer,
      colorIndex: colors.get(token) ?? null,
      joined: false,
      nestingColor: nestingColorOf(tileContainer),
    });
    previousSignificant = last;
  }
  pushHolesBefore(Infinity);
  return pieces;
}
