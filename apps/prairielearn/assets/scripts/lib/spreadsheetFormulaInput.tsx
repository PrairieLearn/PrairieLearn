import clsx from 'clsx';
import { type InputHTMLAttributes, useLayoutEffect, useRef } from 'react';

import {
  formulaReferences,
  tokenizeFormula,
} from '../../../src/lib/client/spreadsheetFormula/lexer.js';

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

/**
 * A formula bar input that highlights formulas. The text is drawn by an `aria-hidden`
 * overlay laid exactly over a native input whose own text is transparent, so editing,
 * selection, IME, and assistive technology all keep using the real input.
 */
export function FormulaInput({
  value,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onScroll' | 'onSelect'> & {
  value: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const highlighted = value.startsWith('=');

  function syncScroll() {
    if (inputRef.current && overlayRef.current) {
      overlayRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  }

  // The input scrolls to keep the caret visible as the value changes, which fires no event.
  useLayoutEffect(syncScroll);

  return (
    <div className={clsx('pl-spreadsheet-formula-input', highlighted && 'is-highlighted')}>
      <input
        ref={inputRef}
        {...props}
        className={clsx('form-control form-control-sm', className)}
        value={value}
        onScroll={syncScroll}
        onSelect={syncScroll}
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
    </div>
  );
}
