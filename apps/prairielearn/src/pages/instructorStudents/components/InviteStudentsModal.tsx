import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { Alert, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { parseUniqueValuesFromString } from '../../../lib/string-util.js';

interface InviteStudentForm {
  uids: string;
}

const MAX_UIDS = 1000;

export function InviteStudentsModal({
  show,
  onHide,
  onSubmit,
}: {
  show: boolean;
  onHide: () => void;
  onSubmit: (uids: string[]) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    clearErrors,
    reset,
    formState: { errors },
  } = useForm<InviteStudentForm>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    defaultValues: { uids: '' },
  });

  const validateUidsFormat = (value: string): string | true => {
    let uids: string[] = [];
    try {
      uids = parseUniqueValuesFromString(value, MAX_UIDS);
    } catch (error) {
      return error instanceof Error ? error.message : 'An error occurred';
    }

    if (uids.length === 0) {
      return 'At least one UID is required';
    }

    const invalidUids = uids.filter((uid) => !z.string().email().safeParse(uid).success);

    if (invalidUids.length > 0) {
      return `The following UIDs were invalid: "${invalidUids.join('", "')}"`;
    }

    return true;
  };

  const saveMutation = useMutation({
    mutationFn: async (uids: string[]) => {
      return onSubmit(uids);
    },
    onSuccess: onHide,
  });

  const onFormSubmit = async (data: InviteStudentForm) => {
    const uids = parseUniqueValuesFromString(data.uids, MAX_UIDS);
    saveMutation.mutate(uids);
  };

  const resetModalState = () => {
    reset();
    clearErrors();
  };

  return (
    <Modal show={show} backdrop="static" onHide={onHide} onExited={resetModalState}>
      <Modal.Header closeButton>
        <Modal.Title>Invite students</Modal.Title>
      </Modal.Header>

      <form onSubmit={handleSubmit(onFormSubmit)}>
        <Modal.Body>
          {saveMutation.isError && (
            <Alert variant="danger" dismissible onClose={() => saveMutation.reset()}>
              {saveMutation.error instanceof Error
                ? saveMutation.error.message
                : 'An error occurred'}
            </Alert>
          )}
          <div class="mb-0">
            <label for="invite-uids" class="form-label">
              UIDs
            </label>
            <textarea
              id="invite-uids"
              class={clsx('form-control', errors.uids && 'is-invalid')}
              rows={5}
              placeholder="student@example.com"
              aria-invalid={!!errors.uids}
              aria-errormessage={errors.uids ? 'invite-uids-error' : undefined}
              aria-describedby="invite-uids-help"
              {...register('uids', {
                validate: validateUidsFormat,
              })}
            />
            {errors.uids?.message && (
              <div class="invalid-feedback" id="invite-uids-error">
                {errors.uids.message}
              </div>
            )}
            <div class="form-text" id="invite-uids-help">
              One UID per line, or comma/space separated.
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            class="btn btn-secondary"
            disabled={saveMutation.isPending}
            onClick={onHide}
          >
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Inviting...' : 'Invite'}
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
