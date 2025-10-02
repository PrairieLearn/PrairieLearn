import { useState } from 'preact/compat';
import { Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { EnrollmentCodeInput } from '../../components/EnrollmentCodeInput.js';
import { getSelfEnrollmentLinkUrl } from '../../lib/client/url.js';

interface EnrollmentCodeForm {
  code1: string;
  code2: string;
  code3: string;
}

interface EnrollmentCodeModalProps {
  show: boolean;
  onHide: () => void;
}

export function EnrollmentCodeModal({ show, onHide }: EnrollmentCodeModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const { register, handleSubmit, setValue, watch } = useForm<EnrollmentCodeForm>({
    mode: 'onChange',
    defaultValues: {
      code1: '',
      code2: '',
      code3: '',
    },
  });

  // Submit the enrollment code
  const onSubmit = async (data: EnrollmentCodeForm) => {
    const fullCode = `${data.code1}${data.code2}${data.code3}`;
    setIsSubmitting(true);
    setError(undefined);

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
          setError('No course found with this enrollment code');
        }
      } else if (response.status === 404) {
        setError('No course found with this enrollment code');
      } else {
        setError('An error occurred while looking up the code. Please try again.');
      }
    } catch {
      setError('An error occurred while looking up the code. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal key={show ? 'open' : 'closed'} show={show} size="md" onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Join a course</Modal.Title>
      </Modal.Header>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Body>
          <EnrollmentCodeInput
            register={register}
            setValue={setValue}
            watch={watch}
            code1Field="code1"
            code2Field="code2"
            code3Field="code3"
            error={error}
            autoFocus={false}
            disabled={isSubmitting}
          />
        </Modal.Body>
        <Modal.Footer>
          <button type="button" class="btn btn-secondary" disabled={isSubmitting} onClick={onHide}>
            Cancel
          </button>
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
        </Modal.Footer>
      </form>
    </Modal>
  );
}
