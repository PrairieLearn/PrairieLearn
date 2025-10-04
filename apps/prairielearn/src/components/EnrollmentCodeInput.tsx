import { useEffect, useRef } from 'preact/compat';
import {
  type FieldValues,
  type Path,
  type UseFormRegister,
  type UseFormSetValue,
  type UseFormWatch,
} from 'react-hook-form';

export function EnrollmentCodeInput<T extends FieldValues>({
  register,
  setValue,
  watch,
  code1Field,
  code2Field,
  code3Field,
  error,
  autoFocus = false,
  disabled = false,
  class: className = '',
}: {
  register: UseFormRegister<T>;
  setValue: UseFormSetValue<T>;
  watch: UseFormWatch<T>;
  code1Field: Path<T>;
  code2Field: Path<T>;
  code3Field: Path<T>;
  error?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  class?: string;
}) {
  const input1Ref = useRef<HTMLInputElement>(null);
  const input2Ref = useRef<HTMLInputElement>(null);
  const input3Ref = useRef<HTMLInputElement>(null);

  const watchedValues = watch();

  // Focus first input when autoFocus is true
  useEffect(() => {
    if (autoFocus) {
      const timeoutId = setTimeout(() => input1Ref.current?.focus(), 100);
      return () => clearTimeout(timeoutId);
    }
  }, [autoFocus]);

  // Validate and format input - only alphanumeric, uppercase
  const formatInput = (value: string): string => {
    return value.replaceAll(/[^A-Za-z0-9]/g, '').toUpperCase();
  };

  // Handle input change for individual fields
  const handleInputChange = (value: string, field: Path<T>) => {
    const formatted = formatInput(value);
    setValue(field, formatted as any, { shouldValidate: true });

    if (field === code1Field && formatted.length === 3 && input2Ref.current) {
      input2Ref.current.focus();
    } else if (field === code2Field && formatted.length === 3 && input3Ref.current) {
      input3Ref.current.focus();
    }
  };

  // Handle paste event
  const handlePaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData?.getData('text') || '';
    const formatted = formatInput(pastedText);

    if (formatted.length <= 10) {
      // Distribute the pasted text across the three inputs
      const part1 = formatted.slice(0, 3);
      const part2 = formatted.slice(3, 6);
      const part3 = formatted.slice(6, 10);

      setValue(code1Field, part1 as any, { shouldValidate: true });
      setValue(code2Field, part2 as any, { shouldValidate: true });
      setValue(code3Field, part3 as any, { shouldValidate: true });
    }
  };

  // Handle key navigation
  const handleKeyDown = (e: KeyboardEvent, field: Path<T>) => {
    const target = e.target as HTMLInputElement;
    const cursorPosition = target.selectionStart ?? 0;
    const valueLength = target.value.length;

    const fields = [
      {
        currentRef: input1Ref.current!,
        value: watchedValues[code1Field],
        field: code1Field,
      },
      { currentRef: input2Ref.current!, value: watchedValues[code2Field], field: code2Field },
      { currentRef: input3Ref.current!, value: watchedValues[code3Field], field: code3Field },
    ];

    const fieldIndex = fields.findIndex((f) => f.field === field);
    const prevField = fields.at(fieldIndex - 1) ?? null;
    const currentField = fields[fieldIndex];
    const nextField = fields.at(fieldIndex + 1) ?? null;

    if (e.key === 'Backspace') {
      if (prevField && currentField.value.length === 0) {
        prevField.currentRef.focus();
      }
    } else if (e.key === 'ArrowLeft' && cursorPosition === 0) {
      if (prevField) {
        prevField.currentRef.focus();
        prevField.currentRef.setSelectionRange(
          prevField.currentRef.value.length,
          prevField.currentRef.value.length,
        );
      }
    } else if (e.key === 'ArrowRight' && cursorPosition === valueLength) {
      if (nextField) {
        nextField.currentRef.focus();
        nextField.currentRef.setSelectionRange(
          nextField.currentRef.value.length,
          nextField.currentRef.value.length,
        );
      }
    }
  };

  return (
    <div class={className}>
      {error && (
        <div class="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      <div class="mb-3">
        <label for="enrollment-code" class="form-label">
          Enter your enrollment code
        </label>
        <div class="d-flex gap-2 align-items-center">
          <input
            type="text"
            class="form-control text-center"
            style="font-family: monospace; font-size: 1.2em; letter-spacing: 0.1em;"
            maxLength={3}
            placeholder="ABC"
            disabled={disabled}
            {...register(code1Field, {
              required: 'First part is required',
              pattern: {
                value: /^[A-Z0-9]{3}$/,
                message: 'Must be 3 alphanumeric characters',
              },
              onChange: (e) => handleInputChange(e.target.value, code1Field),
            })}
            ref={(e) => {
              input1Ref.current = e;
              register(code1Field).ref(e);
            }}
            onKeyDown={(e) => handleKeyDown(e, code1Field)}
            onPaste={handlePaste}
          />
          <span class="text-muted">-</span>
          <input
            type="text"
            class="form-control text-center"
            style="font-family: monospace; font-size: 1.2em; letter-spacing: 0.1em;"
            maxLength={3}
            placeholder="DEF"
            disabled={disabled}
            {...register(code2Field, {
              required: 'Second part is required',
              pattern: {
                value: /^[A-Z0-9]{3}$/,
                message: 'Must be 3 alphanumeric characters',
              },
              onChange: (e) => handleInputChange(e.target.value, code2Field),
            })}
            ref={(e) => {
              input2Ref.current = e;
              register(code2Field).ref(e);
            }}
            onKeyDown={(e) => handleKeyDown(e, code2Field)}
            onPaste={handlePaste}
          />
          <span class="text-muted">-</span>
          <input
            type="text"
            class="form-control text-center"
            style="font-family: monospace; font-size: 1.2em; letter-spacing: 0.1em;"
            maxLength={4}
            placeholder="GHIJ"
            disabled={disabled}
            {...register(code3Field, {
              required: 'Third part is required',
              pattern: {
                value: /^[A-Z0-9]{4}$/,
                message: 'Must be 4 alphanumeric characters',
              },
              onChange: (e) => handleInputChange(e.target.value, code3Field),
            })}
            ref={(e) => {
              input3Ref.current = e;
              register(code3Field).ref(e);
            }}
            onKeyDown={(e) => handleKeyDown(e, code3Field)}
            onPaste={handlePaste}
          />
        </div>
        <div class="form-text">
          If you don't have a code, ask your instructor for the enrollment code or link to the
          course.
        </div>
      </div>
    </div>
  );
}
