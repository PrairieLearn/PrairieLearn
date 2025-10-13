import { useRef } from 'preact/compat';
import { Alert, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { run } from '@prairielearn/run';

import { getSelfEnrollmentLinkUrl, getSelfEnrollmentLookupUrl } from '../lib/client/url.js';

interface EnrollmentCodeFormData {
  code1: string;
  code2: string;
  code3: string;
}

/**
 * A form for entering an enrollment code. Redirects to a join URL if the code is valid.
 *
 * @param params
 * @param params.style - The style of the form
 * @param params.show - If the form is shown (only used for modal style)
 * @param params.onHide - The function to call when the form is hidden (only used for modal style)
 * @param params.courseInstanceId - The ID of the course instance the code is for (optional)
 */
export function EnrollmentCodeForm({
  style,
  show,
  onHide,
  courseInstanceId,
}:
  | {
      style: 'raw-form';
      show?: undefined;
      onHide?: undefined;
      courseInstanceId?: string;
    }
  | {
      style: 'modal';
      show: boolean;
      onHide: () => void;
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

  // Handle paste event
  const handlePaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const target = e.target as HTMLInputElement;
    const pastedText = e.clipboardData?.getData('text') || '';
    const formatted = formatInput(pastedText);
    const currentField = fields.find((f) => f.field === target.name);
    const cursorPosition = run(() => {
      const cursorPosition = target.selectionStart ?? 0;
      if (!currentField) {
        return cursorPosition;
      }
      if (currentField.field === 'code1') {
        return cursorPosition;
      } else if (currentField.field === 'code2') {
        return cursorPosition + 3;
      } else {
        return cursorPosition + 6;
      }
    });

    const existingCode = `${watchedValues.code1}${watchedValues.code2}${watchedValues.code3}`;
    const combinedCode =
      existingCode.slice(0, cursorPosition) +
      formatted +
      existingCode.slice(cursorPosition + formatted.length);
    // If the paste will fit at the current position, do it
    const newCode = combinedCode.length <= 10 ? combinedCode : formatted;

    // Distribute the pasted text across the three inputs
    setValue('code1', newCode.slice(0, 3));
    setValue('code2', newCode.slice(3, 6));
    setValue('code3', newCode.slice(6, 10));

    const endPosition = formatted.length + cursorPosition;

    if (endPosition < 3) {
      input1Ref.current!.focus();
      input1Ref.current!.setSelectionRange(endPosition, endPosition);
    } else if (endPosition < 6) {
      input2Ref.current!.focus();
      input2Ref.current!.setSelectionRange(endPosition - 3, endPosition - 3);
    } else {
      input3Ref.current!.focus();
      input3Ref.current!.setSelectionRange(endPosition - 6, endPosition - 6);
    }
  };

  // Handle key navigation
  const handleKeyDown = (e: KeyboardEvent, field: keyof EnrollmentCodeFormData) => {
    const target = e.target as HTMLInputElement;
    const cursorPosition = target.selectionStart ?? 0;
    const valueLength = target.value.length;

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

  if (style === 'raw-form') {
    return (
      <form onSubmit={handleSubmit(onSubmit)}>
        {formContent}
        <div class="d-grid">{submitButton}</div>
      </form>
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
