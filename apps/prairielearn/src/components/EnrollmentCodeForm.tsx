import { type FormEvent, useState } from 'react';
import { Alert, Modal } from 'react-bootstrap';

import { OtpInput } from '@prairielearn/ui';

import { getSelfEnrollmentLinkUrl, getSelfEnrollmentLookupUrl } from '../lib/client/url.js';

/**
 * A form for entering an enrollment code. Redirects to a join URL if the code is valid.
 *
 * @param params
 * @param params.style - The style of the form
 * @param params.show - If the form is shown (only used for modal style)
 * @param params.onHide - The function to call when the form is hidden (only used for modal style)
 * @param params.courseInstanceId - The ID of the course instance the code is for (optional)
 * @param params.leadingContent - Content to display above the form
 * @param params.showInstructorHelp - Whether to show the instructor help text
 */
export function EnrollmentCodeForm({
  style,
  show,
  onHide,
  courseInstanceId,
  leadingContent,
  showInstructorHelp = false,
}:
  | {
      style: 'raw-form';
      show?: undefined;
      onHide?: undefined;
      courseInstanceId?: string;
      leadingContent?: React.ReactNode;
      showInstructorHelp?: boolean;
    }
  | {
      style: 'modal';
      show: boolean;
      onHide: () => void;
      courseInstanceId?: string;
      leadingContent?: React.ReactNode;
      showInstructorHelp?: boolean;
    }) {
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Handle modal close - reset form and clear errors on exit
  const resetModalState = () => {
    setCode('');
    setServerError(null);
    setValidationError(null);
  };

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    // Clear errors when user starts typing
    if (serverError) {
      setServerError(null);
    }
    if (validationError) {
      setValidationError(null);
    }
  };

  // Submit the enrollment code
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Validate code length
    if (code.length !== 10) {
      setValidationError('Code must be 10 alphanumeric characters');
      return;
    }

    setIsSubmitting(true);
    let response: Response | null = null;
    try {
      response = await fetch(getSelfEnrollmentLookupUrl(code, courseInstanceId), {
        headers: {
          Accept: 'application/json',
        },
      });
    } catch (error) {
      console.error('Enrollment code lookup failed:', error);
      setServerError('An error occurred while looking up the code. Please try again.');
      setIsSubmitting(false);
      return;
    }

    if (response.ok) {
      let responseData;
      try {
        responseData = await response.json();
      } catch (error) {
        console.error('Failed to parse enrollment lookup response:', error);
        setServerError('An error occurred while processing the response. Please try again.');
        setIsSubmitting(false);
        return;
      }
      if (responseData.course_instance_id) {
        window.location.href = getSelfEnrollmentLinkUrl({
          courseInstanceId: responseData.course_instance_id,
          enrollmentCode: code,
        });
        return; // Don't reset isSubmitting since we're navigating away
      } else {
        setServerError('No course found with this enrollment code');
      }
    } else {
      try {
        const responseData = await response.json();
        if (responseData.error) {
          setServerError(responseData.error);
        } else {
          setServerError('An error occurred while looking up the code. Please try again.');
        }
      } catch (error) {
        console.error('Failed to parse error response:', error);
        setServerError('An error occurred while looking up the code. Please try again.');
      }
    }
    setIsSubmitting(false);
  };

  const formContent = (
    <>
      {leadingContent}
      {serverError && (
        <Alert variant="danger" dismissible onClose={() => setServerError(null)}>
          {serverError}
        </Alert>
      )}
      <div className="d-flex flex-column gap-3">
        <div>
          <OtpInput
            ariaLabel="Enrollment code"
            autoFocus={style === 'modal'}
            errorMessage={validationError ?? undefined}
            groupPattern={[3, 3, 4]}
            isInvalid={!!validationError}
            value={code}
            onChange={handleCodeChange}
          />
        </div>
        <div className="small text-muted">
          Don't have an enrollment code? Your instructor may have given you a link to your course or
          asked you to access it from another learning management system.
        </div>
        {showInstructorHelp && (
          <div className="small text-muted">
            <b>Instructors: </b>
            You can find both the enrollment code and a self-enrollment link on the settings page of
            your course instance.
          </div>
        )}
      </div>
    </>
  );

  const submitButton = (
    <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
      {isSubmitting ? 'Looking up code...' : 'Join course'}
    </button>
  );

  if (style === 'raw-form') {
    return (
      <form onSubmit={onSubmit}>
        {formContent}
        <div className="d-grid mt-3">{submitButton}</div>
      </form>
    );
  }

  return (
    <Modal show={show} size="md" onHide={onHide} onExited={resetModalState}>
      <Modal.Header closeButton>
        <Modal.Title>Join a course</Modal.Title>
      </Modal.Header>
      <form onSubmit={onSubmit}>
        <Modal.Body>{formContent}</Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-secondary" onClick={onHide}>
            Cancel
          </button>
          {submitButton}
        </Modal.Footer>
      </form>
    </Modal>
  );
}
