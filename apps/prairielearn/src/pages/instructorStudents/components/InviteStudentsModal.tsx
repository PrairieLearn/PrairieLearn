import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { Alert, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

interface InviteStudentForm {
  uids: string;
}

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

  const parseUids = (value: string): string[] => {
    return [
      ...new Set(
        value
          .split(/[\n,\s]+/)
          .map((uid) => uid.trim())
          .filter((uid) => uid.length > 0),
      ),
    ];
  };

  const validateUidsFormat = (value: string): string | true => {
    const uids = parseUids(value);

    if (uids.length === 0) {
      return 'At least one UID is required';
    }

    const invalidEmails = uids.filter((uid) => !z.string().email().safeParse(uid).success);

    if (invalidEmails.length > 0) {
      return `The following UIDs were invalid: "${invalidEmails.join('", "')}"`;
    }

    return true;
  };

  const saveMutation = useMutation({
    mutationFn: async (uids: string[]) => {
      return onSubmit(uids);
    },
    onSuccess: () => {
      reset();
      onHide();
    },
  });

  const onFormSubmit = async (data: InviteStudentForm) => {
    const uids = parseUids(data.uids);
    saveMutation.mutate(uids);
  };

  const onExited = () => {
    reset();
    clearErrors();
    saveMutation.reset();
  };

  return (
    <Modal show={show} backdrop="static" onHide={onHide} onExited={onExited}>
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
              placeholder="One UID per line, or comma/space separated"
              aria-invalid={errors.uids ? 'true' : 'false'}
              aria-errormessage={errors.uids ? 'invite-uids-error' : undefined}
              {...register('uids', {
                validate: validateUidsFormat,
              })}
            />
            {errors.uids?.message && (
              <div class="invalid-feedback" id="invite-uids-error">
                {errors.uids.message}
              </div>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            class="btn btn-secondary"
            disabled={saveMutation.isPending}
            onClick={() => {
              onExited();
              onHide();
            }}
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
