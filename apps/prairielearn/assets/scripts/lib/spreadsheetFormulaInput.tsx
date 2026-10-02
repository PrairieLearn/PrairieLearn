import clsx from 'clsx';
import {
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import {
  type FormulaEditState,
  describeHole,
  nextPhantoms,
} from '../../../src/lib/client/spreadsheetFormula/editModel.js';
import {
  type FormulaFunctionSignature,
  formatSignature,
} from '../../../src/lib/client/spreadsheetFormula/functions.js';
import {
  type FormulaToken,
  formulaReferences,
} from '../../../src/lib/client/spreadsheetFormula/lexer.js';
import {
  type FormulaHole,
  type FormulaStructure,
  parseFormula,
} from '../../../src/lib/client/spreadsheetFormula/parser.js';
import { isPointingPosition } from '../../../src/lib/client/spreadsheetFormula/references.js';
import {
  type FormulaSignatureHint,
  applyCompletion,
  getCompletion,
  getSignatureHint,
} from '../../../src/lib/client/spreadsheetFormula/suggestions.js';

// Long formulas get plain token colors only; tiles and holes would just add noise.
const MAX_STRUCTURED_LENGTH = 400;

const TILE_CLASSES: Partial<Record<FormulaToken['kind'], string>> = {
  number: 'pl-spreadsheet-tile-value',
  string: 'pl-spreadsheet-tile-value',
  boolean: 'pl-spreadsheet-tile-value',
  ref: 'pl-spreadsheet-tile-value',
  name: 'pl-spreadsheet-tile-value',
  range: 'pl-spreadsheet-tile-range',
  operator: 'pl-spreadsheet-tile-operator',
  comparison: 'pl-spreadsheet-tile-operator',
};

/**
 * Draws the formula as tylr-style tiles: each tile's edge shape shows what fits next to
 * it, the function name, parentheses, and commas of a call are shards of one tile, and
 * missing pieces are drawn as holes shaped like what belongs there. Every decoration is
 * absolutely positioned so the text lays out exactly like the input beneath it.
 */
function StructuredFormula({
  formula,
  structure,
  caret,
}: {
  formula: string;
  structure: FormulaStructure;
  caret: number | null;
}) {
  const structured = formula.length <= MAX_STRUCTURED_LENGTH;
  const referenceColors = new Map(
    formulaReferences(structure.tokens).map((reference) => [reference.token, reference.colorIndex]),
  );
  const shardContainers = new Map<FormulaToken, number>();
  for (const [index, container] of structure.containers.entries()) {
    for (const shard of container.shards) shardContainers.set(shard, index);
  }
  // The innermost call or group containing the caret has its shards highlighted.
  let activeContainer: number | null = null;
  if (caret !== null) {
    for (const [index, container] of structure.containers.entries()) {
      const contains = container.start < caret && caret <= container.end;
      if (
        contains &&
        (activeContainer === null || container.start > structure.containers[activeContainer].start)
      ) {
        activeContainer = index;
      }
    }
  }

  const holes = structured ? structure.holes : [];
  const elements: ReactNode[] = [
    <span key="equals" className="pl-spreadsheet-tok-comparison">
      =
    </span>,
  ];
  let holeIndex = 0;

  function pushHolesBefore(position: number) {
    for (; holeIndex < holes.length && holes[holeIndex].position <= position; holeIndex += 1) {
      const hole = holes[holeIndex];
      elements.push(
        <span
          key={`hole-${holeIndex}`}
          className={clsx(
            'pl-spreadsheet-hole',
            `pl-spreadsheet-hole-${hole.kind}`,
            hole.argument?.kind === 'range' && 'pl-spreadsheet-hole-range',
            hole.position === caret && 'is-current',
          )}
        />,
      );
    }
  }
  for (const token of structure.tokens) {
    pushHolesBefore(token.start);
    // Phantom parentheses only mark where a delimiter hole goes.
    if (token.text === '') continue;
    const container = shardContainers.get(token);
    elements.push(
      <span
        key={token.start}
        className={clsx(
          `pl-spreadsheet-tok-${token.kind}`,
          referenceColors.has(token) && `pl-spreadsheet-ref-color-${referenceColors.get(token)}`,
          structured &&
            (container === undefined
              ? TILE_CLASSES[token.kind]
              : clsx('pl-spreadsheet-tile-shard', container === activeContainer && 'is-active')),
        )}
      >
        {token.text}
      </span>,
    );
  }
  pushHolesBefore(Infinity);
  // Lets the overlay scroll as far as the input does when the caret is at the end.
  elements.push('\u00a0');
  return <>{elements}</>;
}

function HoleHint({ hole }: { hole: FormulaHole }) {
  return (
    <div
      className="dropdown-menu show pl-spreadsheet-formula-popup px-2 py-1 small"
      aria-hidden="true"
    >
      {describeHole(hole)}{' '}
      {hole.kind === 'operator'
        ? 'Type an operator such as + or * here.'
        : 'Type ) here to close it, or press Enter to close it at the end.'}
    </div>
  );
}

function SignatureHint({ hint }: { hint: FormulaSignatureHint }) {
  const { signature, argumentIndex, argumentName } = hint;
  const parts = formatSignature(signature);
  // Arguments past the first repetition are represented by the trailing `…`.
  const currentPart = Math.min(argumentIndex, signature.repeat ? parts.length - 1 : parts.length);
  return (
    <div
      className="dropdown-menu show pl-spreadsheet-formula-popup px-2 py-1 small"
      aria-hidden="true"
    >
      <div className="font-monospace">
        {signature.name}(
        {parts.map((part, index) => (
          <span key={part}>
            {index > 0 && ', '}
            {index === currentPart ? <strong>{part}</strong> : part}
          </span>
        ))}
        )
      </div>
      <div className="text-body-secondary">
        {argumentName && <strong>{argumentName}: </strong>}
        {signature.description}
      </div>
    </div>
  );
}

export interface FormulaInputHandle {
  /**
   * Where a reference pointed at in the grid should be written, or null if the caret is
   * not in point mode. `continuing` is set when it would replace the reference that was
   * just pointed at, so clicking another cell or dragging further swaps it.
   */
  pointingTarget(): { start: number; end: number; continuing: boolean } | null;
  /** Replaces the text from `start` to `end` with `reference` and moves the caret after it. */
  writeReference(start: number, end: number, reference: string): void;
}

interface PointedSpan {
  start: number;
  end: number;
  value: string;
}

/**
 * A formula bar input that draws formulas as tiles with holes, suggests functions, and
 * accepts references pointed at in the grid. The text is drawn by an `aria-hidden`
 * overlay laid exactly over a native input whose own text is transparent, so editing,
 * selection, IME, and assistive technology all keep using the real input.
 */
export function FormulaInput({
  value,
  className,
  onValueChange,
  onAnnounce,
  onKeyDown,
  onFocus,
  onBlur,
  ref,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onScroll' | 'onSelect'> & {
  value: string;
  onValueChange: (value: string) => void;
  onAnnounce: (message: string) => void;
  ref?: Ref<FormulaInputHandle>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const lastHintAnnouncementRef = useRef('');
  // The latest value, which runs ahead of `value` while a drag writes several references
  // before the parent re-renders.
  const latestValueRef = useRef(value);
  const pointedSpanRef = useRef<PointedSpan | null>(null);
  const [pointedSpan, setPointedSpan] = useState<PointedSpan | null>(null);
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [caret, setCaret] = useState<number | null>(null);
  const [dismissedValue, setDismissedValue] = useState<string | null>(null);
  const [active, setActive] = useState({ key: '', index: 0 });
  const [editState, setEditState] = useState<FormulaEditState>({ formula: value, phantoms: [] });
  // Phantoms only apply to the text they were computed for, not to a value the parent
  // replaced, e.g. by selecting another cell.
  const structure = parseFormula(value, editState.formula === value ? editState.phantoms : []);
  const highlighted = structure !== null;
  const currentHole =
    focused && caret !== null
      ? structure?.holes.find(
          (hole) =>
            hole.position === caret && (hole.kind === 'operator' || hole.kind === 'delimiter'),
        )
      : undefined;

  const completion =
    focused && caret !== null && value !== dismissedValue ? getCompletion(value, caret) : null;
  const hint = focused && caret !== null ? getSignatureHint(value, caret) : null;
  const completionKey = completion
    ? `${completion.start}:${value.slice(completion.start, caret!)}`
    : '';
  const activeIndex = active.key === completionKey ? active.index : 0;
  const pointing =
    focused &&
    caret !== null &&
    ((pointedSpan?.value === value && pointedSpan.end === caret) ||
      isPointingPosition(value, caret));

  /** Reports a new value from any kind of edit, updating the phantoms it leaves behind. */
  function changeValue(next: string) {
    const base = latestValueRef.current;
    latestValueRef.current = next;
    setEditState((previous) => ({
      formula: next,
      phantoms: nextPhantoms(
        previous.formula === base ? previous : { formula: base, phantoms: [] },
        next,
      ),
    }));
    onValueChange(next);
  }

  function syncScroll() {
    if (inputRef.current && overlayRef.current) {
      overlayRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  }

  /** Tells screen reader users which argument they are typing whenever it changes. */
  function announceHint(nextValue: string, nextCaret: number | null) {
    const nextHint = nextCaret === null ? null : getSignatureHint(nextValue, nextCaret);
    const message = nextHint
      ? `${nextHint.signature.name}, ${nextHint.argumentName ? `argument ${nextHint.argumentName}` : 'too many arguments'}`
      : '';
    if (message && message !== lastHintAnnouncementRef.current) onAnnounce(message);
    lastHintAnnouncementRef.current = message;
  }

  function syncCaret() {
    const input = inputRef.current;
    if (!input) return;
    const nextCaret = input.selectionStart === input.selectionEnd ? input.selectionStart : null;
    setCaret(nextCaret);
    announceHint(input.value, nextCaret);
  }

  // Place the caret after an accepted suggestion once its text is rendered, then keep the
  // overlay aligned, since the input scrolls to show the caret without firing an event.
  useLayoutEffect(() => {
    latestValueRef.current = value;
    if (pendingCaretRef.current !== null) {
      inputRef.current?.setSelectionRange(pendingCaretRef.current, pendingCaretRef.current);
      pendingCaretRef.current = null;
    }
    syncScroll();
  });

  useImperativeHandle(ref, () => ({
    pointingTarget() {
      const input = inputRef.current;
      if (!input || document.activeElement !== input) return null;
      const current = latestValueRef.current;
      const caretPosition =
        pendingCaretRef.current ??
        (input.selectionStart === input.selectionEnd ? input.selectionStart : null);
      if (caretPosition === null) return null;
      const span = pointedSpanRef.current;
      if (span?.value === current && span.end === caretPosition) {
        return { start: span.start, end: span.end, continuing: true };
      }
      if (!isPointingPosition(current, caretPosition)) return null;
      return { start: caretPosition, end: caretPosition, continuing: false };
    },
    writeReference(start, end, reference) {
      const current = latestValueRef.current;
      const next = current.slice(0, start) + reference + current.slice(end);
      const span = { start, end: start + reference.length, value: next };
      pointedSpanRef.current = span;
      pendingCaretRef.current = span.end;
      setPointedSpan(span);
      setCaret(span.end);
      changeValue(next);
    },
  }));

  function accept(signature: FormulaFunctionSignature) {
    if (!completion) return;
    const result = applyCompletion(value, completion, signature);
    pendingCaretRef.current = result.caret;
    setCaret(result.caret);
    announceHint(result.formula, result.caret);
    changeValue(result.formula);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (completion) {
      const count = completion.matches.length;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const offset = event.key === 'ArrowDown' ? 1 : -1;
        setActive({ key: completionKey, index: (activeIndex + offset + count) % count });
        return;
      }
      if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
        event.preventDefault();
        accept(completion.matches[activeIndex]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setDismissedValue(value);
        return;
      }
    }
    const input = event.currentTarget;
    if (event.key === 'Tab' && structure && input.selectionStart === input.selectionEnd) {
      // Tab and Shift+Tab move between holes, then leave the formula bar as usual.
      const position = input.selectionStart ?? 0;
      const holes = event.shiftKey
        ? structure.holes.filter((hole) => hole.position < position).reverse()
        : structure.holes.filter((hole) => hole.position > position);
      if (holes.length > 0) {
        event.preventDefault();
        input.setSelectionRange(holes[0].position, holes[0].position);
        syncCaret();
        onAnnounce(describeHole(holes[0]));
        return;
      }
    }
    onKeyDown?.(event);
  }

  return (
    <div
      className={clsx(
        'pl-spreadsheet-formula-input',
        highlighted && 'is-highlighted',
        pointing && 'is-pointing',
      )}
    >
      <input
        ref={inputRef}
        {...props}
        className={clsx('form-control form-control-sm', className)}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={completion !== null}
        aria-controls={completion ? listId : undefined}
        aria-activedescendant={completion ? `${listId}-${activeIndex}` : undefined}
        onChange={(event) => {
          changeValue(event.currentTarget.value);
          syncCaret();
        }}
        onSelect={() => {
          syncScroll();
          syncCaret();
        }}
        onScroll={syncScroll}
        onKeyDown={handleKeyDown}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
      />
      {structure && (
        <div
          ref={overlayRef}
          className="form-control form-control-sm pl-spreadsheet-formula-highlight"
          aria-hidden="true"
        >
          <StructuredFormula formula={value} structure={structure} caret={focused ? caret : null} />
        </div>
      )}
      {completion ? (
        <ul
          id={listId}
          className="dropdown-menu show pl-spreadsheet-formula-popup"
          role="listbox"
          aria-label="Function suggestions"
        >
          {completion.matches.map((signature, index) => (
            // The combobox input handles keyboard selection through aria-activedescendant.
            // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events
            <li
              key={signature.name}
              id={`${listId}-${index}`}
              className={clsx('dropdown-item small', index === activeIndex && 'active')}
              role="option"
              aria-selected={index === activeIndex}
              // Keep focus in the input so choosing a suggestion does not commit the cell.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => accept(signature)}
            >
              <span className="font-monospace fw-semibold">{signature.name}</span>{' '}
              <span className={index === activeIndex ? undefined : 'text-body-secondary'}>
                {signature.description}
              </span>
            </li>
          ))}
        </ul>
      ) : hint ? (
        <SignatureHint hint={hint} />
      ) : (
        currentHole && <HoleHint hole={currentHole} />
      )}
    </div>
  );
}
