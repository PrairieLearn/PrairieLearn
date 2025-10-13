import { useEffect, useRef } from 'preact/compat';
import { Alert, Card, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { getSelfEnrollmentLinkUrl, getSelfEnrollmentLookupUrl } from '../lib/client/url.js';

interface EnrollmentCodeFormData {
  code1: string;
  code2: string;
  code3: string;
}

export function EnrollmentCodeForm({
  style,
  show,
  onHide,
  disabled = false,
  courseInstanceId,
}: {
  style: 'modal' | 'card';
  show?: boolean;
  onHide?: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
  courseInstanceId?: string;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    clearErrors,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<EnrollmentCodeFormData>({
    mode: 'onSubmit',
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

  useEffect(() => {
    if (show && style === 'modal') {
      const timeoutId = setTimeout(() => input1Ref.current?.focus(), 100);
      return () => clearTimeout(timeoutId);
    }
  }, [show, style]);

  // Handle modal close - reset form and clear errors
  const handleClose = () => {
    reset();
    clearErrors();
    onHide?.();
  };

  // Validate and format input - only alphanumeric, uppercase
  const formatInput = (value: string): string => {
    return value.replaceAll(/[^A-Za-z0-9]/g, '').toUpperCase();
  };

  // Handle input change for individual fields
  const handleInputChange = (value: string, field: keyof EnrollmentCodeFormData) => {
    const formatted = formatInput(value);
    setValue(field, formatted);

    // Clear server errors when user starts typing
    if (errors.root?.serverError) {
      clearErrors('root.serverError');
    }

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
      // Clear server errors when user pastes
      if (errors.root?.serverError) {
        clearErrors('root.serverError');
      }

      // Distribute the pasted text across the three inputs
      setValue('code1', formatted.slice(0, 3));
      setValue('code2', formatted.slice(3, 6));
      setValue('code3', formatted.slice(6, 10));
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
    const prevField = fieldIndex > 0 ? fields[fieldIndex - 1] : null;
    const currentField = fields[fieldIndex];
    const nextField = fieldIndex < fields.length - 1 ? fields[fieldIndex + 1] : null;

    if (e.key === 'Backspace') {
      if (prevField && currentField.value.length === 0) {
        // If there is nothing to backspace, it should move to the previous field
        e.preventDefault();
        prevField.currentRef.focus();
      }
    } else if (e.key === 'ArrowLeft' && cursorPosition === 0) {
      if (prevField) {
        e.preventDefault();
        prevField.currentRef.focus();
        prevField.currentRef.setSelectionRange(
          prevField.currentRef.value.length,
          prevField.currentRef.value.length,
        );
      }
    } else if (e.key === 'ArrowRight' && cursorPosition === valueLength) {
      if (nextField) {
        e.preventDefault();
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
    const response = await fetch(getSelfEnrollmentLookupUrl(fullCode, courseInstanceId));

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
    } else {
      try {
        const responseData = await response.json();
        setError('root.serverError', {
          message: responseData.error,
        });
      } catch {
        setError('root.serverError', {
          message: 'An error occurred while looking up the code. Please try again.',
        });
      }
    }
  };

  const formContent = (
    <>
      {errors.root?.serverError && (
        <Alert variant="danger" dismissible onClose={() => clearErrors('root.serverError')}>
          {errors.root.serverError.message}
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
              required: 'Code must be 10 alphanumeric characters',
              pattern: {
                value: /^[A-Z0-9]{3}$/,
                message: 'Code must be 10 alphanumeric characters',
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
              required: 'Code must be 10 alphanumeric characters',
              pattern: {
                value: /^[A-Z0-9]{3}$/,
                message: 'Code must be 10 alphanumeric characters',
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
              required: 'Code must be 10 alphanumeric characters',
              pattern: {
                value: /^[A-Z0-9]{4}$/,
                message: 'Code must be 10 alphanumeric characters',
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
        {(errors.code1 || errors.code2 || errors.code3) && (
          <div class="form-text text-danger">
            {errors.code1?.message ?? errors.code2?.message ?? errors.code3?.message}
          </div>
        )}
        <div class="form-text">
          If you don't have a code, ask your instructor for the enrollment code or link to the
          course.
        </div>
      </div>
    </>
  );

  const submitButton = (
    <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
      {isSubmitting ? 'Looking up code...' : 'Join Course'}
    </button>
  );

  if (style === 'card') {
    return (
      <Card>
        <Card.Header>
          <h4 class="mb-0">Join a course</h4>
        </Card.Header>
        <Card.Body>
          <form onSubmit={handleSubmit(onSubmit)}>
            {formContent}
            <div class="d-grid">{submitButton}</div>
          </form>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Modal key={show ? 'open' : 'closed'} show={show} size="md" onHide={handleClose}>
      <Modal.Header closeButton>
        <Modal.Title>Join a course</Modal.Title>
      </Modal.Header>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Body>{formContent}</Modal.Body>
        <Modal.Footer>
          <button type="button" class="btn btn-secondary" onClick={handleClose}>
            Cancel
          </button>
          {submitButton}
        </Modal.Footer>
      </form>
    </Modal>
  );
}
