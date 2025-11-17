import clsx from 'clsx';
import { Alert, Modal } from 'react-bootstrap';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { z } from 'zod';

import type { StaffEnrollment } from '../../../lib/client/safe-db-types.js';

interface InviteStudentForm {
  uid: string;
}

export function InviteStudentModal({
  show,
  onHide,
  onSubmit,
}: {
  show: boolean;
  onHide: () => void;
  onSubmit: SubmitHandler<InviteStudentForm>;
}) {
  const {
    register,
    handleSubmit,
    clearErrors,
    reset,
    setError,
    formState: { errors, isSubmitting, isValidating },
  } = useForm<InviteStudentForm>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    defaultValues: { uid: '' },
  });

  const onClose = () => {
    reset();
    clearErrors();
    onHide();
  };

  return (
    <Modal show={show} backdrop="static" onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Invite student</Modal.Title>
      </Modal.Header>

      <form
        onSubmit={handleSubmit(async (data, event) => {
          event.preventDefault();
          try {
            await onSubmit(data);
          } catch (error) {
            // errors with root as the key will not persist with each submission
            setError('root.serverError', {
              message: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        })}
      >
        <Modal.Body>
          {errors.root?.serverError && (
            <Alert
              variant="danger"
              dismissible
              onClose={() => {
                clearErrors('root.serverError');
              }}
            >
              {errors.root.serverError.message}
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
                validate: async (uid) => {
                  if (!uid) return 'UID is required';
                  if (!z.string().email().safeParse(uid).success) return 'Invalid UID';

                  const params = new URLSearchParams({ uid });
                  const res = await fetch(
                    `${window.location.pathname}/enrollment.json?${params.toString()}`,
                    {
                      headers: {
                        Accept: 'application/json',
                      },
                    },
                  );
                  if (!res.ok) return 'Failed to fetch enrollment';
                  const data: StaffEnrollment | null = await res.json();
                  if (data) {
                    if (data.status === 'joined') return 'This student is already enrolled';
                    if (data.status === 'invited') return 'This student has a pending invitation';
                  }

                  return true;
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
          <button type="submit" class="btn btn-primary" disabled={isSubmitting || isValidating}>
            Invite
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
