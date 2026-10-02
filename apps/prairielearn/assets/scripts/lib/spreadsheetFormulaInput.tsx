import clsx from 'clsx';
import {
  type InputHTMLAttributes,
  type KeyboardEvent,
  type Ref,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import {
  type FormulaFunctionSignature,
  formatSignature,
} from '../../../src/lib/client/spreadsheetFormula/functions.js';
import {
  formulaReferences,
  tokenizeFormula,
} from '../../../src/lib/client/spreadsheetFormula/lexer.js';
import { isPointingPosition } from '../../../src/lib/client/spreadsheetFormula/references.js';
import {
  type FormulaSignatureHint,
  applyCompletion,
  getCompletion,
  getSignatureHint,
} from '../../../src/lib/client/spreadsheetFormula/suggestions.js';

function HighlightedFormula({ formula }: { formula: string }) {
  const tokens = tokenizeFormula(formula.slice(1));
  const referenceColors = new Map(
    formulaReferences(tokens).map((reference) => [reference.token, reference.colorIndex]),
  );
  return (
    <>
      <span className="pl-spreadsheet-tok-comparison">=</span>
      {tokens.map((token) => (
        <span
          key={token.start}
          className={clsx(
            `pl-spreadsheet-tok-${token.kind}`,
            referenceColors.has(token) && `pl-spreadsheet-ref-color-${referenceColors.get(token)}`,
          )}
        >
          {token.text}
        </span>
      ))}
      {/* Lets the overlay scroll as far as the input does when the caret is at the end. */}
      {' '}
    </>
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
 * A formula bar input that highlights formulas, suggests functions, and accepts
 * references pointed at in the grid. The text is drawn
 * by an `aria-hidden` overlay laid exactly over a native input whose own text is
 * transparent, so editing, selection, IME, and assistive technology all keep using the
 * real input.
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
  const highlighted = value.startsWith('=');

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
      latestValueRef.current = next;
      pointedSpanRef.current = span;
      pendingCaretRef.current = span.end;
      setPointedSpan(span);
      setCaret(span.end);
      onValueChange(next);
    },
  }));

  function accept(signature: FormulaFunctionSignature) {
    if (!completion) return;
    const result = applyCompletion(value, completion, signature);
    pendingCaretRef.current = result.caret;
    setCaret(result.caret);
    announceHint(result.formula, result.caret);
    onValueChange(result.formula);
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
          latestValueRef.current = event.currentTarget.value;
          onValueChange(event.currentTarget.value);
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
      {highlighted && (
        <div
          ref={overlayRef}
          className="form-control form-control-sm pl-spreadsheet-formula-highlight"
          aria-hidden="true"
        >
          <HighlightedFormula formula={value} />
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
      ) : (
        hint && <SignatureHint hint={hint} />
      )}
    </div>
  );
}
