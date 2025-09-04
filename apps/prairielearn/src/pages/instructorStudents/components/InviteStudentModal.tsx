import { zodResolver } from '@hookform/resolvers/zod';
import clsx from 'clsx';
import { Alert, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { StaffEnrollment } from '../../../lib/client/safe-db-types.js';

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
    clearErrors,
    reset,

    formState: { errors, isSubmitting, isValid },
  } = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    defaultValues: { uid: '' },
  });

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
        onSubmit={handleSubmit(
          async ({ uid }) => await onSubmit(uid),
          ({ uid }) => {
            console.log('error', uid);
          },
        )}
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
              {...register('uid', {
                validate: {
                  checkEnrollment: async (uid) => {
                    console.log('checkEnrollment', uid);
                    const params = new URLSearchParams({ uid });
                    const res = await fetch(
                      `${window.location.pathname}/enrollment.json?${params.toString()}`,
                    );
                    if (!res.ok) return 'Failed to fetch enrollment';
                    const data: StaffEnrollment | null = await res.json();
                    if (!data) {
                      return true;
                    }

                    if (data.status === 'joined') return 'This student is already enrolled';
                    if (data.status === 'invited') return 'This student has a pending invitation';

                    return true;
                  },
                },
              })}
            />
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
