import clsx from 'clsx';
import {
  type InputHTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
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
  type FormulaHole,
  parseFormula,
} from '../../../src/lib/client/spreadsheetFormula/parser.js';
import { isPointingPosition } from '../../../src/lib/client/spreadsheetFormula/references.js';
import {
  type FormulaSignatureHint,
  applyCompletion,
  getCompletion,
  getSignatureHint,
} from '../../../src/lib/client/spreadsheetFormula/suggestions.js';

import {
  type FormulaSelection,
  FormulaTiles,
  offsetAtPoint,
  tileRangeAtPoint,
} from './spreadsheetFormulaTiles.js';

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
  /** Focuses the formula bar with the caret at `offset` once the current value renders. */
  focusAt(offset: number): void;
  /** Flashes an outline around the formula bar to draw the eye to it. */
  flash(): void;
  /** Hides suggestions and hints until the next keystroke, so the grid beneath can be seen. */
  hidePopups(): void;
}

interface PointedSpan {
  start: number;
  end: number;
  value: string;
}

/**
 * A formula bar that draws formulas as tiles with holes, suggests functions, and accepts
 * references pointed at in the grid. Typing, selection, IME, undo, and assistive
 * technology all use a real input, which stays focused but invisible beneath an
 * `aria-hidden` tile view that draws its text, caret, and selection.
 */
export function FormulaInput({
  value,
  adornment,
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
  /** Drawn inside the field before the formula, such as a badge describing the cell. */
  adornment?: ReactNode;
  onValueChange: (value: string) => void;
  onAnnounce: (message: string) => void;
  ref?: Ref<FormulaInputHandle>;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const lastHintAnnouncementRef = useRef('');
  // The latest value, which runs ahead of `value` while a drag writes several references
  // before the parent re-renders.
  const latestValueRef = useRef(value);
  const pointedSpanRef = useRef<PointedSpan | null>(null);
  const [pointedSpan, setPointedSpan] = useState<PointedSpan | null>(null);
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [selection, setSelection] = useState<FormulaSelection | null>(null);
  const caret = selection && selection.start === selection.end ? selection.start : null;
  const [dismissedValue, setDismissedValue] = useState<string | null>(null);
  const [active, setActive] = useState({ key: '', index: 0 });
  const [editState, setEditState] = useState<FormulaEditState>({ formula: value, phantoms: [] });
  const [popupsHidden, setPopupsHidden] = useState(false);
  // Phantoms only apply to the text they were computed for, not to a value the parent
  // replaced, e.g. by selecting another cell.
  const structure = parseFormula(value, editState.formula === value ? editState.phantoms : []);
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

  /** Tells screen reader users which argument they are typing whenever it changes. */
  function announceHint(nextValue: string, nextCaret: number | null) {
    const nextHint = nextCaret === null ? null : getSignatureHint(nextValue, nextCaret);
    const message = nextHint
      ? `${nextHint.signature.name}, ${nextHint.argumentName ? `argument ${nextHint.argumentName}` : 'too many arguments'}`
      : '';
    if (message && message !== lastHintAnnouncementRef.current) onAnnounce(message);
    lastHintAnnouncementRef.current = message;
  }

  /** Restarts the popups' fade, so they only fade once typing and caret moves stop. */
  function restartPopupFade() {
    const popups = wrapperRef.current?.querySelectorAll('.pl-spreadsheet-formula-popup') ?? [];
    for (const popup of popups) {
      for (const animation of popup.getAnimations()) {
        animation.currentTime = 0;
        animation.play();
      }
    }
  }

  function syncCaret() {
    restartPopupFade();
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    setSelection({ start, end });
    announceHint(input.value, start === end ? start : null);
  }

  function moveCaret(nextCaret: number) {
    pendingCaretRef.current = nextCaret;
    setSelection({ start: nextCaret, end: nextCaret });
  }

  // Place the caret after an edit made here, such as an accepted suggestion, once the
  // input holds the new text.
  useLayoutEffect(() => {
    latestValueRef.current = value;
    if (pendingCaretRef.current !== null) {
      inputRef.current?.setSelectionRange(pendingCaretRef.current, pendingCaretRef.current);
      pendingCaretRef.current = null;
    }
  });

  /** Places the caret, extends the selection, or selects a tile where the view is clicked. */
  function handleViewMouseDown(event: MouseEvent<HTMLDivElement>) {
    const input = inputRef.current;
    const view = viewRef.current;
    if (event.button !== 0 || !input || !view || input.disabled) return;
    // Keep focus in the input, which the view only draws.
    event.preventDefault();
    input.focus();
    const length = input.value.length;
    if (event.detail === 2) {
      const tile = tileRangeAtPoint(view, event.clientX, event.clientY);
      if (tile) input.setSelectionRange(tile.start, tile.end);
      syncCaret();
      return;
    }
    const anchor = event.shiftKey
      ? (input.selectionStart ?? 0)
      : offsetAtPoint(view, event.clientX, event.clientY, length);
    const select = (focus: number) => {
      input.setSelectionRange(
        Math.min(anchor, focus),
        Math.max(anchor, focus),
        focus < anchor ? 'backward' : 'forward',
      );
      syncCaret();
    };
    select(event.shiftKey ? offsetAtPoint(view, event.clientX, event.clientY, length) : anchor);
    const handleMove = (move: globalThis.MouseEvent) =>
      select(offsetAtPoint(view, move.clientX, move.clientY, length));
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }

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
      setPointedSpan(span);
      moveCaret(span.end);
      changeValue(next);
    },
    focusAt(offset) {
      moveCaret(offset);
      inputRef.current?.focus();
    },
    flash() {
      const view = viewRef.current;
      if (!view) return;
      const primary = getComputedStyle(view).getPropertyValue('--bs-primary');
      const shown = { outline: `3px solid ${primary}`, outlineOffset: '2px' };
      // Animated with the Web Animations API because React rewrites the class name as
      // focus moves into the bar, which would cut a class-based animation short.
      view.animate(
        matchMedia('(prefers-reduced-motion: reduce)').matches
          ? [shown, shown]
          : [shown, { outline: '3px solid transparent', outlineOffset: '6px' }],
        { duration: 700, easing: 'ease-out' },
      );
    },
    hidePopups() {
      setPopupsHidden(true);
    },
  }));

  function accept(signature: FormulaFunctionSignature) {
    if (!completion) return;
    const result = applyCompletion(value, completion, signature);
    moveCaret(result.caret);
    announceHint(result.formula, result.caret);
    changeValue(result.formula);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    restartPopupFade();
    setPopupsHidden(false);
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
    const position = input.selectionStart ?? 0;
    if (event.key === ',' && position === input.selectionEnd && input.value[position] === ',') {
      // A completed function comes with a comma per required argument, so typing one
      // moves past it, like typing over an editor's automatically closed bracket.
      event.preventDefault();
      input.setSelectionRange(position + 1, position + 1);
      syncCaret();
      return;
    }
    if (event.key === 'Tab' && structure && input.selectionStart === input.selectionEnd) {
      // Tab and Shift+Tab move between holes, then leave the formula bar as usual.
      const required = structure.holes.filter((hole) => !hole.optional);
      const holes = event.shiftKey
        ? required.filter((hole) => hole.position < position).reverse()
        : required.filter((hole) => hole.position > position);
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
      ref={wrapperRef}
      className={clsx(
        'pl-spreadsheet-formula-input',
        pointing && 'is-pointing',
        popupsHidden && 'is-popup-hidden',
      )}
    >
      <input
        ref={inputRef}
        {...props}
        className={className}
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
        onSelect={syncCaret}
        onKeyDown={handleKeyDown}
        onFocus={(event) => {
          setFocused(true);
          syncCaret();
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
      />
      {/* Clicks are mapped onto the input, which keeps focus and handles the keyboard. */}
      {}
      <div
        ref={viewRef}
        className={clsx(
          'form-control form-control-sm pl-spreadsheet-formula-view',
          focused && 'is-focused',
          props.disabled && 'is-disabled',
        )}
        aria-hidden="true"
        onMouseDown={handleViewMouseDown}
      >
        {adornment}
        <FormulaTiles value={value} structure={structure} selection={focused ? selection : null} />
      </div>
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
