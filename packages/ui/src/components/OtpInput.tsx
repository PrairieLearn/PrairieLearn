import clsx from 'clsx';
import { Fragment, useRef, useState } from 'preact/compat';
import { FieldError, Input, TextField } from 'react-aria-components';

export function formatOtpValue(raw: string, maxLength: number): string {
  return raw
    .replaceAll(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, maxLength);
}

export interface OtpInputProps {
  /** e.g., [3, 3, 4] for ABC-DEF-GHIJ format */
  groupPattern: number[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  isInvalid?: boolean;
  errorMessage?: string;
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
  className?: string;
  name?: string;
  onBlur?: () => void;
}

export function OtpInput({
  groupPattern,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  isInvalid = false,
  errorMessage,
  onComplete,
  autoFocus = false,
  className,
  name,
  onBlur,
}: OtpInputProps) {
  const [focused, setFocused] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const length = groupPattern.reduce((sum, size) => sum + size, 0);

  const focusedIndex = focused ? Math.min(Math.max(cursorPosition, 0), length - 1) : -1;

  const handleChange = (newValue: string) => {
    const formatted = formatOtpValue(newValue, length);
    onChange(formatted);
    setCursorPosition(formatted.length);
    if (formatted.length === length) {
      onComplete?.(formatted);
    }
  };

  const handleBoxClick = (index: number) => {
    if (disabled) return;
    inputRef.current?.focus();
    const pos = Math.min(index, value.length);
    setCursorPosition(pos);
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(pos, pos);
    });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    let newPos = cursorPosition;
    if (e.key === 'ArrowLeft') {
      newPos = Math.max(0, cursorPosition - 1);
    } else if (e.key === 'ArrowRight') {
      newPos = Math.min(length - 1, cursorPosition + 1);
    } else if (e.key === 'Home') {
      newPos = 0;
    } else if (e.key === 'End') {
      newPos = length - 1;
    } else {
      return;
    }
    e.preventDefault();
    setCursorPosition(newPos);
    inputRef.current?.setSelectionRange(
      Math.min(value.length, newPos),
      Math.min(value.length, newPos),
    );
  };

  // Build group start indices for stable keys
  const groupStarts: number[] = [];
  let idx = 0;
  for (const size of groupPattern) {
    groupStarts.push(idx);
    idx += size;
  }

  return (
    <TextField
      aria-label={ariaLabel}
      className={clsx('position-relative d-inline-block', className)}
      style={{ cursor: 'text' }}
      isDisabled={disabled}
      isInvalid={isInvalid}
      maxLength={length}
      name={name}
      value={value}
      onChange={handleChange}
    >
      <div className="d-inline-flex align-items-center gap-1">
        {groupPattern.map((groupSize, groupIndex) => {
          const start = groupStarts[groupIndex];
          return (
            <Fragment key={start}>
              {groupIndex > 0 && (
                <span className="text-secondary fw-medium px-1 user-select-none" aria-hidden="true">
                  -
                </span>
              )}
              <div className="d-flex gap-1">
                {Array.from({ length: groupSize }, (_, i) => {
                  const boxIndex = start + i;
                  const char = value[boxIndex] ?? '';
                  const isFocused = boxIndex === focusedIndex;
                  return (
                    <div
                      key={boxIndex}
                      className={clsx(
                        'pl-ui-otp-box',
                        isFocused && 'focused',
                        isInvalid && 'is-invalid',
                      )}
                      aria-hidden="true"
                      onClick={() => handleBoxClick(boxIndex)}
                    >
                      {char || (isFocused ? <div className="pl-ui-otp-caret" /> : null)}
                    </div>
                  );
                })}
              </div>
            </Fragment>
          );
        })}
      </div>
      <Input
        ref={inputRef}
        autoCapitalize="characters"
        autoComplete="one-time-code"
        autoCorrect="off"
        // eslint-disable-next-line jsx-a11y-x/no-autofocus -- autoFocus is intentionally supported for modal use cases
        autoFocus={autoFocus}
        className="position-absolute opacity-0"
        style={{ pointerEvents: 'none', width: 1, height: 1 }}
        inputMode="text"
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        onFocus={() => {
          setFocused(true);
          setCursorPosition(inputRef.current?.selectionStart ?? value.length);
        }}
        onKeyDown={handleKeyDown}
        onSelect={(e: { target: EventTarget | null }) =>
          setCursorPosition((e.target as HTMLInputElement).selectionStart ?? 0)
        }
      />
      <FieldError className="form-text text-danger">{errorMessage}</FieldError>
    </TextField>
  );
}
