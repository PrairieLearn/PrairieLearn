import clsx from 'clsx';
import type { ReactNode } from 'react';

import {
  formulaReferences,
  formulaTokens,
} from '../../../src/lib/client/spreadsheetFormula/lexer.js';
import type {
  FormulaHole,
  FormulaStructure,
} from '../../../src/lib/client/spreadsheetFormula/parser.js';
import {
  type FormulaPiece,
  layoutFormula,
} from '../../../src/lib/client/spreadsheetFormula/tiles.js';

export interface FormulaSelection {
  start: number;
  end: number;
}

const HOLE_LABELS: Record<FormulaHole['kind'], string> = {
  operand: '',
  argument: '',
  operator: '',
  delimiter: ')',
  name: 'ƒ',
};

/**
 * Renders `text`, which starts at `start` in the formula, as spans that record their
 * offsets, splitting it so that selected characters are highlighted and the caret is
 * drawn between characters.
 */
function renderText(
  text: string,
  start: number,
  selection: FormulaSelection | null,
  className?: string,
): ReactNode[] {
  const end = start + text.length;
  const cuts = new Set([start, end]);
  if (selection) {
    for (const edge of [selection.start, selection.end]) {
      if (edge > start && edge < end) cuts.add(edge);
    }
  }
  const points = [...cuts].sort((a, b) => a - b);
  const nodes: ReactNode[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (index > 0 && selection?.start === from && selection.end === from) {
      nodes.push(<span key={`caret-${from}`} className="pl-spreadsheet-caret" />);
    }
    nodes.push(
      <span
        key={from}
        data-start={from}
        className={clsx(
          className,
          selection &&
            selection.start !== selection.end &&
            from >= selection.start &&
            to <= selection.end &&
            'is-selected',
        )}
      >
        {text.slice(from - start, to - start)}
      </span>,
    );
  }
  return nodes;
}

/**
 * Draws a formula as plain text with each reference in the color of its outline in the
 * grid, with the caret and selection of the hidden input that is actually being edited.
 */
export function FormulaText({
  value,
  selection,
}: {
  value: string;
  /** The input's selection while it is focused. */
  selection: FormulaSelection | null;
}) {
  const caret = selection && selection.start === selection.end ? selection.start : null;
  const segments: { start: number; end: number; colorIndex: number | null }[] = [];
  let offset = 0;
  for (const { token, colorIndex } of formulaReferences(formulaTokens(value) ?? [])) {
    if (token.start > offset) segments.push({ start: offset, end: token.start, colorIndex: null });
    segments.push({ start: token.start, end: token.end, colorIndex });
    offset = token.end;
  }
  if (offset < value.length || segments.length === 0) {
    segments.push({ start: offset, end: value.length, colorIndex: null });
  }
  const nodes: ReactNode[] = [];
  for (const { start, end, colorIndex } of segments) {
    if (caret === start)
      {nodes.push(<span key={`caret-${start}`} className="pl-spreadsheet-caret" />);}
    nodes.push(
      ...renderText(
        value.slice(start, end),
        start,
        selection,
        clsx(
          colorIndex !== null && `pl-spreadsheet-reference pl-spreadsheet-ref-fill-${colorIndex}`,
        ),
      ),
    );
  }
  if (caret === value.length && caret > 0) {
    nodes.push(<span key="caret-end" className="pl-spreadsheet-caret" />);
  }
  return <>{nodes}</>;
}

function pieceStart(piece: FormulaPiece) {
  if (piece.kind === 'hole') return piece.hole.position;
  if (piece.kind === 'gap') return piece.token.start;
  return piece.start;
}

/**
 * Draws a formula as tylr-style tiles with holes, with the caret and selection of the
 * hidden input that is actually being edited. The text of every piece is laid out in
 * spans carrying `data-start` offsets, so `offsetAtPoint` can map clicks back to it.
 */
export function FormulaTiles({
  value,
  structure,
  selection,
}: {
  value: string;
  structure: FormulaStructure | null;
  /** The input's selection while it is focused. */
  selection: FormulaSelection | null;
}) {
  const caret = selection && selection.start === selection.end ? selection.start : null;
  if (!structure) {
    return (
      <>
        {caret === 0 && <span className="pl-spreadsheet-caret" />}
        {renderText(value, 0, selection)}
        {caret === value.length && caret > 0 && <span className="pl-spreadsheet-caret" />}
      </>
    );
  }

  // The innermost call or group containing the caret has its shards highlighted.
  let activeContainer: number | null = null;
  if (caret !== null) {
    for (const [index, container] of structure.containers.entries()) {
      if (
        container.start < caret &&
        caret <= container.end &&
        (activeContainer === null || container.start > structure.containers[activeContainer].start)
      ) {
        activeContainer = index;
      }
    }
  }
  // Several holes can share an offset, e.g. a missing argument and the missing `)` after
  // it; the caret fills the first one that is required.
  const holesAtCaret = structure.holes.filter((hole) => hole.position === caret);
  const currentHole = holesAtCaret.find((hole) => !hole.optional) ?? holesAtCaret.at(0);
  const caretOnHole = currentHole !== undefined;

  const nodes: ReactNode[] = [];
  let caretDrawn = caret === null || caretOnHole;

  for (const [index, piece] of layoutFormula(structure).entries()) {
    const start = pieceStart(piece);
    // A caret between two pieces is drawn before the piece that starts there.
    if (!caretDrawn && caret !== null && caret <= start) {
      nodes.push(<span key={`caret-${index}`} className="pl-spreadsheet-caret" />);
      caretDrawn = true;
    }
    if (piece.kind === 'gap') {
      if (!caretDrawn && caret !== null && caret < piece.token.end) caretDrawn = true;
      nodes.push(
        <span key={`gap-${index}`} className="pl-spreadsheet-gap">
          {renderText(piece.token.text, piece.token.start, selection)}
        </span>,
      );
      continue;
    }
    const edgeClasses = [
      `pl-spreadsheet-left-${piece.left}`,
      `pl-spreadsheet-right-${piece.right}`,
      piece.joined && 'is-joined',
      piece.nestingColor !== null && `pl-spreadsheet-nesting-${piece.nestingColor}`,
    ];
    if (piece.kind === 'hole') {
      const { hole } = piece;
      nodes.push(
        <span
          key={`hole-${index}`}
          data-hole-offset={hole.position}
          className={clsx(
            'pl-spreadsheet-piece pl-spreadsheet-hole',
            `pl-spreadsheet-hole-${hole.kind}`,
            hole.argument && `pl-spreadsheet-hole-${hole.argument.kind}`,
            hole.optional && 'is-optional',
            hole === currentHole && 'is-current',
            edgeClasses,
          )}
        >
          <span className="pl-spreadsheet-hole-label">
            {hole.argument?.name ?? HOLE_LABELS[hole.kind]}
          </span>
        </span>,
      );
      continue;
    }
    if (!caretDrawn && caret !== null && caret < piece.end) caretDrawn = true;
    nodes.push(
      <span
        key={`tile-${index}`}
        data-tile-start={piece.start}
        data-tile-end={piece.end}
        className={clsx(
          'pl-spreadsheet-piece pl-spreadsheet-tile',
          `pl-spreadsheet-tile-${piece.sort}`,
          piece.colorIndex !== null && `pl-spreadsheet-ref-fill-${piece.colorIndex}`,
          piece.container !== null && piece.container === activeContainer && 'is-active',
          edgeClasses,
        )}
      >
        {/* A tile's tokens are contiguous, e.g. a function name and its `(`. */}
        {renderText(piece.tokens.map((token) => token.text).join(''), piece.start, selection)}
      </span>,
    );
  }
  if (!caretDrawn) nodes.push(<span key="caret-end" className="pl-spreadsheet-caret" />);
  return <>{nodes}</>;
}

function caretPositionAt(x: number, y: number): { node: Node; offset: number } | null {
  // Browsers without this API fall back to snapping clicks to the nearer edge of a tile.
  const view: Partial<Pick<Document, 'caretPositionFromPoint'>> = document;
  const position = view.caretPositionFromPoint?.(x, y);
  return position ? { node: position.offsetNode, offset: position.offset } : null;
}

/** Maps a point in a `FormulaTiles` view to the formula offset nearest to it. */
export function offsetAtPoint(view: HTMLElement, x: number, y: number, length: number): number {
  const target = document.elementFromPoint(x, y);
  if (!target || !view.contains(target)) return length;
  const hole = target.closest<HTMLElement>('[data-hole-offset]');
  if (hole) return Number(hole.dataset.holeOffset);

  const position = caretPositionAt(x, y);
  const element = position?.node instanceof Element ? position.node : position?.node.parentElement;
  const segment = element?.closest<HTMLElement>('[data-start]');
  if (position && segment && view.contains(segment) && !segment.closest('[data-hole-offset]')) {
    return Number(segment.dataset.start) + Math.min(position.offset, segment.textContent.length);
  }

  // Padding and nibs of a tile snap to its nearer end.
  const tile = target.closest<HTMLElement>('[data-tile-start]');
  if (tile) {
    const bounds = tile.getBoundingClientRect();
    return Number(
      x < bounds.left + bounds.width / 2 ? tile.dataset.tileStart : tile.dataset.tileEnd,
    );
  }
  return length;
}

/** The span of the tile at a point, for selecting a whole tile on double-click. */
export function tileRangeAtPoint(view: HTMLElement, x: number, y: number): FormulaSelection | null {
  const tile = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-tile-start]');
  if (!tile || !view.contains(tile)) return null;
  return { start: Number(tile.dataset.tileStart), end: Number(tile.dataset.tileEnd) };
}
