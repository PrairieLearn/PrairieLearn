import { useEffect, useRef } from 'preact/compat';
import { Modal } from 'react-bootstrap';
import { type SubmitHandler, useForm } from 'react-hook-form';

import { getSelfEnrollmentLinkUrl } from '../../lib/client/url.js';

interface EnrollmentCodeModalProps {
  show: boolean;
  onHide: () => void;
}

interface EnrollmentCodeForm {
  code1: string;
  code2: string;
  code3: string;
}

export function EnrollmentCodeModal({ show, onHide }: EnrollmentCodeModalProps) {
  const input1Ref = useRef<HTMLInputElement>(null);
  const input2Ref = useRef<HTMLInputElement>(null);
  const input3Ref = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<EnrollmentCodeForm>({
    mode: 'onChange',
    defaultValues: {
      code1: '',
      code2: '',
      code3: '',
    },
  });

  const watchedValues = watch();

  // Focus first input when modal opens
  useEffect(() => {
    if (show) {
      const timeoutId = setTimeout(() => input1Ref.current!.focus(), 100);
      return () => clearTimeout(timeoutId);
    } else {
      // Reset form when modal closes
      reset();
      clearErrors();
    }
  }, [show, reset, clearErrors]);

  // Validate and format input - only alphanumeric, uppercase
  const formatInput = (value: string): string => {
    return value.replaceAll(/[^A-Za-z0-9]/g, '').toUpperCase();
  };

  // Handle input change for individual fields
  const handleInputChange = (value: string, field: keyof EnrollmentCodeForm) => {
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
  const handleKeyDown = (e: KeyboardEvent, field: keyof EnrollmentCodeForm) => {
    const target = e.target as HTMLInputElement;
    const cursorPosition = target.selectionStart ?? 0;
    const valueLength = target.value.length;

    const fields = [
      {
        currentRef: input1Ref.current!,
        value: watchedValues.code1,
        field: 'code1' as const,
      },
      { currentRef: input2Ref.current!, value: watchedValues.code2, field: 'code2' as const },
      { currentRef: input3Ref.current!, value: watchedValues.code3, field: 'code3' as const },
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
  const onSubmit: SubmitHandler<EnrollmentCodeForm> = async (data) => {
    const fullCode = `${data.code1}${data.code2}${data.code3}`;

    try {
      const response = await fetch(`/lookup_code?code=${encodeURIComponent(fullCode)}`);

      if (response.ok) {
        const responseData = await response.json();
        if (responseData.course_instance_id) {
          // Redirect to the join page
          window.location.href = getSelfEnrollmentLinkUrl({
            courseInstanceId: responseData.course_instance_id,
            enrollmentCode: fullCode,
          });
        } else {
          setError('root.serverError', {
            message: 'No course found with this enrollment code',
          });
        }
      } else if (response.status === 404) {
        setError('root.serverError', {
          message: 'No course found with this enrollment code',
        });
      } else {
        setError('root.serverError', {
          message: 'An error occurred while looking up the code. Please try again.',
        });
      }
    } catch {
      setError('root.serverError', {
        message: 'An error occurred while looking up the code. Please try again.',
      });
    }
  };

  const fullCode = watchedValues.code1 + watchedValues.code2 + watchedValues.code3;
  const isComplete = fullCode.length === 10;

  return (
    <Modal key={show ? 'open' : 'closed'} show={show} size="md" onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Join a course</Modal.Title>
      </Modal.Header>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Body>
          {errors.root?.serverError && (
            <div class="alert alert-danger" role="alert">
              {errors.root.serverError.message}
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
                disabled={isSubmitting}
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
                disabled={isSubmitting}
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
                disabled={isSubmitting}
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
        </Modal.Body>
        <Modal.Footer>
          <button type="button" class="btn btn-secondary" disabled={isSubmitting} onClick={onHide}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" disabled={!isComplete || isSubmitting}>
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
        </Modal.Footer>
      </form>
    </Modal>
  );
}
