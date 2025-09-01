import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect } from 'preact/compat';
import { Alert, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

export function InviteStudentModal({
  show,
  onHide,
  onSubmit,
}: {
  show: boolean;
  onHide: () => void;
  onSubmit: (uid: string) => Promise<void> | void;
}) {
  const FormSchema = z.object({
    uid: z.string().email('Enter a valid UID'),
  });

  const {
    register,
    handleSubmit,
    watch,
    setError,
    clearErrors,
    reset,

    formState: { errors, isSubmitting, isValid },
  } = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    mode: 'onChange',
    reValidateMode: 'onChange',
    defaultValues: { uid: '' },
  });

  const uidValue = watch('uid');

  const {
    data: eligibilityData,
    isFetching,
    isPending,
  } = useQuery({
    queryKey: ['enrollments', 'invite-eligibility', uidValue],
    enabled: show && !errors.uid,
    queryFn: async () => {
      const params = new URLSearchParams({ uid: uidValue });
      const res = await fetch(`${window.location.pathname}/enrollment.json?${params.toString()}`);
      if (!res.ok) return null;
      return await res.json();
    },
  });

  const loading = isFetching || isPending;

  useEffect(() => {
    if (loading) return;
    if (eligibilityData) {
      const isEnrolled = eligibilityData.status === 'joined';
      const isPending = eligibilityData.status === 'invited' && !eligibilityData.lti_synced;
      if (isEnrolled) {
        setError('uid', { type: 'server', message: 'This student is already enrolled' });
      } else if (isPending) {
        setError('uid', { type: 'server', message: 'This student has a pending invitation' });
      } else {
        clearErrors('uid');
      }
    }
  }, [eligibilityData, loading, clearErrors, setError]);

  const onClose = () => {
    clearErrors();
    reset();
    onHide();
  };

  return (
    <Modal show={show} backdrop="static" onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Invite student</Modal.Title>
      </Modal.Header>

      <form
        onSubmit={handleSubmit(async ({ uid }) => {
          try {
            clearErrors();
            await onSubmit(uid.trim());
            reset();
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Failed to invite';
            setError('root', { type: 'server', message });
          }
        })}
      >
        <Modal.Body>
          {errors.root && (
            <Alert
              variant="danger"
              dismissible
              onClose={() => {
                clearErrors();
                reset();
              }}
            >
              {errors.root.message}
            </Alert>
          )}
          <div class="mb-3">
            <label for="invite-uid" class="form-label">
              UID
            </label>
            <input
              id="invite-uid"
              class={clsx('form-control', errors.uid && 'is-invalid')}
              type="email"
              placeholder="Enter UID"
              aria-invalid={errors.uid ? 'true' : 'false'}
              {...register('uid')}
            />
            {loading && !errors.uid?.message && <div class="form-text">Checking status...</div>}
            {errors.uid?.message && <div class="invalid-feedback">{errors.uid.message}</div>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" class="btn btn-secondary" disabled={isSubmitting} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" disabled={!isValid || isSubmitting}>
            Invite
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
