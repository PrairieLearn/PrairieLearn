import { useEffect, useRef, useState } from 'preact/compat';
import { Modal } from 'react-bootstrap';

interface EnrollmentCodeModalProps {
  show: boolean;
  onHide: () => void;
}

export function EnrollmentCodeModal({ show, onHide }: EnrollmentCodeModalProps) {
  const [formState, setFormState] = useState({
    code1: '',
    code2: '',
    code3: '',
    isLoading: false,
    error: '',
  });

  const input1Ref = useRef<HTMLInputElement>(null);
  const input2Ref = useRef<HTMLInputElement>(null);
  const input3Ref = useRef<HTMLInputElement>(null);

  // Focus first input when modal opens
  useEffect(() => {
    if (show) {
      const timeoutId = setTimeout(() => input1Ref.current?.focus(), 100);
      return () => clearTimeout(timeoutId);
    }
  }, [show]);

  // Validate and format input - only alphanumeric, uppercase
  const formatInput = (value: string): string => {
    return value.replaceAll(/[^A-Za-z0-9]/g, '').toUpperCase();
  };

  // Handle input change for individual fields
  const handleInputChange = (value: string, field: 'code1' | 'code2' | 'code3') => {
    const formatted = formatInput(value);

    setFormState((prev) => ({
      ...prev,
      [field]: formatted,
    }));

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

      setFormState((prev) => ({
        ...prev,
        code1: part1,
        code2: part2,
        code3: part3,
      }));
    }
  };

  // Handle key navigation
  const handleKeyDown = (e: KeyboardEvent, field: 'code1' | 'code2' | 'code3') => {
    const target = e.target as HTMLInputElement;
    const cursorPosition = target.selectionStart || 0;
    const valueLength = target.value.length;

    if (e.key === 'Backspace') {
      if (field === 'code2' && formState.code2 === '' && input1Ref.current) {
        input1Ref.current.focus();
      } else if (field === 'code3' && formState.code3 === '' && input2Ref.current) {
        input2Ref.current.focus();
      }
    } else if (e.key === 'ArrowLeft') {
      // Only navigate to previous input if cursor is at the start
      if (cursorPosition === 0) {
        if (field === 'code2' && input1Ref.current) {
          e.preventDefault();
          input1Ref.current.focus();
          // Move cursor to end of previous input
          setTimeout(() => {
            input1Ref.current!.setSelectionRange(
              input1Ref.current!.value.length,
              input1Ref.current!.value.length,
            );
          }, 0);
        } else if (field === 'code3' && input2Ref.current) {
          e.preventDefault();
          input2Ref.current.focus();
          // Move cursor to end of previous input
          setTimeout(() => {
            input2Ref.current!.setSelectionRange(
              input2Ref.current!.value.length,
              input2Ref.current!.value.length,
            );
          }, 0);
        }
      }
    } else if (e.key === 'ArrowRight') {
      // Only navigate to next input if cursor is at the end
      if (cursorPosition === valueLength) {
        if (field === 'code1' && input2Ref.current) {
          e.preventDefault();
          input2Ref.current.focus();
          // Move cursor to start of next input
          setTimeout(() => {
            input2Ref.current!.setSelectionRange(0, 0);
          }, 0);
        } else if (field === 'code2' && input3Ref.current) {
          e.preventDefault();
          input3Ref.current.focus();
          // Move cursor to start of next input
          setTimeout(() => {
            input3Ref.current!.setSelectionRange(0, 0);
          }, 0);
        }
      }
    }
  };

  // Submit the enrollment code
  const handleSubmit = async () => {
    const fullCode = `${formState.code1}${formState.code2}${formState.code3}`;

    if (fullCode.length !== 10) {
      setFormState((prev) => ({ ...prev, error: 'Please enter a complete 10-character code' }));
      return;
    }

    setFormState((prev) => ({ ...prev, isLoading: true, error: '' }));

    try {
      const response = await fetch(`/lookup_code?code=${encodeURIComponent(fullCode)}`);

      if (response.ok) {
        const data = await response.json();
        if (data.course_instance_id) {
          // Redirect to the join page
          window.location.href = `/pl/course_instance/${data.course_instance_id}/join/code`;
        } else {
          setFormState((prev) => ({ ...prev, error: 'No course found with this enrollment code' }));
        }
      } else if (response.status === 404) {
        setFormState((prev) => ({ ...prev, error: 'No course found with this enrollment code' }));
      } else {
        setFormState((prev) => ({
          ...prev,
          error: 'An error occurred while looking up the code. Please try again.',
        }));
      }
    } catch {
      setFormState((prev) => ({
        ...prev,
        error: 'An error occurred while looking up the code. Please try again.',
      }));
    } finally {
      setFormState((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const fullCode = formState.code1 + formState.code2 + formState.code3;
  const isComplete = fullCode.length === 10;

  return (
    <Modal key={show ? 'open' : 'closed'} show={show} size="md" onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Join a course</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div class="mb-3">
          <label for="enrollment-code" class="form-label">
            Enter your enrollment code
          </label>
          <div class="d-flex gap-2 align-items-center">
            <input
              ref={input1Ref}
              type="text"
              class="form-control text-center"
              style="font-family: monospace; font-size: 1.2em; letter-spacing: 0.1em;"
              maxLength={3}
              value={formState.code1}
              placeholder="ABC"
              disabled={formState.isLoading}
              onChange={(e) => handleInputChange((e.target as HTMLInputElement).value, 'code1')}
              onKeyDown={(e) => handleKeyDown(e, 'code1')}
              onPaste={handlePaste}
            />
            <span class="text-muted">-</span>
            <input
              ref={input2Ref}
              type="text"
              class="form-control text-center"
              style="font-family: monospace; font-size: 1.2em; letter-spacing: 0.1em;"
              maxLength={3}
              value={formState.code2}
              placeholder="DEF"
              disabled={formState.isLoading}
              onChange={(e) => handleInputChange((e.target as HTMLInputElement).value, 'code2')}
              onKeyDown={(e) => handleKeyDown(e, 'code2')}
              onPaste={handlePaste}
            />
            <span class="text-muted">-</span>
            <input
              ref={input3Ref}
              type="text"
              class="form-control text-center"
              style="font-family: monospace; font-size: 1.2em; letter-spacing: 0.1em;"
              maxLength={4}
              value={formState.code3}
              placeholder="GHIJ"
              disabled={formState.isLoading}
              onChange={(e) => handleInputChange((e.target as HTMLInputElement).value, 'code3')}
              onKeyDown={(e) => handleKeyDown(e, 'code3')}
              onPaste={handlePaste}
            />
          </div>
          <div class="form-text">
            If you don't have a code, ask your instructor for the enrollment code or link to the
            course.
          </div>
        </div>

        {formState.error && (
          <div class="alert alert-danger" role="alert">
            {formState.error}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          class="btn btn-secondary"
          disabled={formState.isLoading}
          onClick={onHide}
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-primary"
          disabled={!isComplete || formState.isLoading}
          onClick={handleSubmit}
        >
          {formState.isLoading ? (
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
    </Modal>
  );
}
