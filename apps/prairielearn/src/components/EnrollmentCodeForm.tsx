import { useEffect, useRef, useState } from 'preact/compat';
import { Alert, Card } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

interface EnrollmentCodeFormData {
  code1: string;
  code2: string;
  code3: string;
}

interface EnrollmentCodeFormProps {
  style: 'modal' | 'card';
  onValidEnrollmentCode: (courseInstanceId: number, enrollmentCode: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  class?: string;
}

export function EnrollmentCodeForm({
  style,
  onValidEnrollmentCode,
  autoFocus = false,
  disabled = false,
  class: className = '',
}: EnrollmentCodeFormProps) {
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting },
  } = useForm<EnrollmentCodeFormData>({
    mode: 'onChange',
    defaultValues: {
      code1: '',
      code2: '',
      code3: '',
    },
  });

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

  // Handle dismissing the error alert
  const handleDismissError = () => {
    setError(null);
  };

  // Validate and format input - only alphanumeric, uppercase
  const formatInput = (value: string): string => {
    return value.replaceAll(/[^A-Za-z0-9]/g, '').toUpperCase();
  };

  // Handle input change for individual fields
  const handleInputChange = (value: string, field: keyof EnrollmentCodeFormData) => {
    const formatted = formatInput(value);
    setValue(field, formatted, { shouldValidate: true });

    if (field === 'code1' && formatted.length === 3 && input2Ref.current) {
      input2Ref.current.focus();
    } else if (field === 'code2' && formatted.length === 3 && input3Ref.current) {
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

      setValue('code1', part1, { shouldValidate: true });
      setValue('code2', part2, { shouldValidate: true });
      setValue('code3', part3, { shouldValidate: true });
    }
  };

  // Handle key navigation
  const handleKeyDown = (e: KeyboardEvent, field: keyof EnrollmentCodeFormData) => {
    const target = e.target as HTMLInputElement;
    const cursorPosition = target.selectionStart ?? 0;
    const valueLength = target.value.length;

    const fields: {
      currentRef: HTMLInputElement;
      value: string;
      field: keyof EnrollmentCodeFormData;
    }[] = [
      {
        currentRef: input1Ref.current!,
        value: watchedValues.code1,
        field: 'code1',
      },
      {
        currentRef: input2Ref.current!,
        value: watchedValues.code2,
        field: 'code2',
      },
      {
        currentRef: input3Ref.current!,
        value: watchedValues.code3,
        field: 'code3',
      },
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

  // Submit the enrollment code
  const onSubmit = async (data: EnrollmentCodeFormData) => {
    const fullCode = `${data.code1}${data.code2}${data.code3}`;
    setError(null);

    try {
      const response = await fetch(
        `/pl/course_instance/lookup?code=${encodeURIComponent(fullCode)}`,
      );

      if (response.ok) {
        const responseData = await response.json();
        if (responseData.course_instance_id) {
          // Call the callback with the course instance ID and enrollment code
          onValidEnrollmentCode(responseData.course_instance_id, fullCode);
        } else {
          setError('No course found with this enrollment code');
        }
      } else if (response.status === 404) {
        setError('No course found with this enrollment code');
      } else {
        setError('An error occurred while looking up the code. Please try again.');
      }
    } catch {
      setError('An error occurred while looking up the code. Please try again.');
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit(onSubmit)}>
      {error && (
        <Alert variant="danger" dismissible onClose={handleDismissError}>
          {error}
        </Alert>
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
            {...register('code1', {
              required: 'First part is required',
              pattern: {
                value: /^[A-Z0-9]{3}$/,
                message: 'Must be 3 alphanumeric characters',
              },
              onChange: (e) => handleInputChange(e.target.value, 'code1'),
            })}
            ref={(e) => {
              input1Ref.current = e;
              register('code1').ref(e);
            }}
            onKeyDown={(e) => handleKeyDown(e, 'code1')}
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
            {...register('code2', {
              required: 'Second part is required',
              pattern: {
                value: /^[A-Z0-9]{3}$/,
                message: 'Must be 3 alphanumeric characters',
              },
              onChange: (e) => handleInputChange(e.target.value, 'code2'),
            })}
            ref={(e) => {
              input2Ref.current = e;
              register('code2').ref(e);
            }}
            onKeyDown={(e) => handleKeyDown(e, 'code2')}
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
            {...register('code3', {
              required: 'Third part is required',
              pattern: {
                value: /^[A-Z0-9]{4}$/,
                message: 'Must be 4 alphanumeric characters',
              },
              onChange: (e) => handleInputChange(e.target.value, 'code3'),
            })}
            ref={(e) => {
              input3Ref.current = e;
              register('code3').ref(e);
            }}
            onKeyDown={(e) => handleKeyDown(e, 'code3')}
            onPaste={handlePaste}
          />
        </div>
        <div class="form-text">
          If you don't have a code, ask your instructor for the enrollment code or link to the
          course.
        </div>
      </div>
      <div class="d-grid">
        <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <span
                class="spinner-border spinner-border-sm me-2"
                role="status"
                aria-hidden="true"
              />
              Looking up code...
            </>
          ) : (
            'Join Course'
          )}
        </button>
      </div>
    </form>
  );

  if (style === 'card') {
    return (
      <Card class={className}>
        <Card.Header>
          <h4 class="mb-0">Join a course</h4>
        </Card.Header>
        <Card.Body>{formContent}</Card.Body>
      </Card>
    );
  }

  return <div class={className}>{formContent}</div>;
}
