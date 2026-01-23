import clsx from 'clsx';
import { Fragment } from 'react';
import { VisuallyHidden, useFocusRing } from 'react-aria';
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
  if (groupPattern.length === 0 || groupPattern.some((n) => n <= 0)) {
    throw new Error('OtpInput: groupPattern must be a non-empty array of positive integers');
  }

  const { isFocusVisible, focusProps } = useFocusRing();
  const length = groupPattern.reduce((sum, size) => sum + size, 0);

  const handleChange = (newValue: string) => {
    const formatted = formatOtpValue(newValue, length);
    onChange(formatted);
    if (formatted.length === length) {
      onComplete?.(formatted);
    }
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
      className={clsx('d-inline-block', className)}
      isDisabled={disabled}
      isInvalid={isInvalid}
      name={name}
      value={value}
      onChange={handleChange}
    >
      {/* Using a label element provides native click-to-focus behavior */}
      <label className="d-inline-flex align-items-center gap-1" style={{ cursor: 'text' }}>
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
                  const showCursor = isFocusVisible && boxIndex === value.length;
                  return (
                    <div
                      key={boxIndex}
                      className={clsx(
                        'pl-ui-otp-box',
                        showCursor && 'focused focus-visible',
                        isInvalid && 'is-invalid',
                      )}
                      aria-hidden="true"
                    >
                      {char || (showCursor ? <div className="pl-ui-otp-caret" /> : null)}
                    </div>
                  );
                })}
              </div>
            </Fragment>
          );
        })}
        <VisuallyHidden>
          <Input
            autoCapitalize="characters"
            autoComplete="one-time-code"
            autoCorrect="off"
            // eslint-disable-next-line jsx-a11y-x/no-autofocus -- autoFocus is intentionally supported for modal use cases
            autoFocus={autoFocus}
            inputMode="text"
            onBlur={onBlur}
            {...focusProps}
          />
        </VisuallyHidden>
      </label>
      <FieldError className="form-text text-danger">{errorMessage}</FieldError>
    </TextField>
  );
}
