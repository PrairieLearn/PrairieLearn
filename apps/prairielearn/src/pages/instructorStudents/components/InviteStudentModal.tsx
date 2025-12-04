import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'preact/compat';
import { Alert, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { StaffEnrollment } from '../../../lib/client/safe-db-types.js';

interface InviteStudentForm {
  uids: string;
}

interface InvalidUidInfo {
  uid: string;
  reason: string;
}

type ModalStage =
  | { type: 'editing' }
  | { type: 'confirming'; invalidUids: InvalidUidInfo[]; validUids: string[] };

export function InviteStudentModal({
  show,
  onHide,
  onSubmit,
}: {
  show: boolean;
  onHide: () => void;
  onSubmit: (uids: string[]) => Promise<StaffEnrollment[]>;
}) {
  const [stage, setStage] = useState<ModalStage>({ type: 'editing' });

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

  const validateUids = async (value: string): Promise<string | boolean> => {
    const uids = parseUids(value);

    if (uids.length === 0) {
      return 'At least one UID is required';
    }

    const invalidEmails = uids.filter((uid) => !z.string().email().safeParse(uid).success);

    if (invalidEmails.length > 0) {
      return `The following UIDs were invalid: "${invalidEmails.join('", "')}"`;
    }

    // Check with server for enrollment status
    const params = new URLSearchParams();
    params.append('uids', uids.join(','));

    let resp: Response | null = null;
    try {
      resp = await fetch(`${window.location.pathname}/invitation/check?${params.toString()}`, {
        headers: {
          Accept: 'application/json',
        },
      });
    } catch {
      return 'Failed to validate UIDs';
    }

    // TODO: Handle error messages from the server more gracefully.
    if (!resp.ok) return 'Failed to validate UIDs';

    const { success, data } = z
      .object({ invalidUids: z.array(z.object({ uid: z.string(), reason: z.string() })) })
      .safeParse(await resp.json());
    if (!success) return 'Failed to check UIDs';

    const validUids = uids.filter(
      (uid) => !data.invalidUids.some((invalid) => invalid.uid === uid),
    );

    if (validUids.length === 0) {
      if (uids.length === 1) {
        // Single UID case - show specific error
        return data.invalidUids[0].reason;
      }
      // Multiple UIDs, all invalid
      return 'None of the UIDs can be invited. Please check that all users are not already invited or enrolled already, and are not instructors.';
    }

    // If some valid and some invalid, show confirmation modal
    if (data.invalidUids.length > 0) {
      setStage({ type: 'confirming', invalidUids: data.invalidUids, validUids });
      // Prevents form submission but don't set an error message on the main form
      return false;
    }

    return true;
  };

  const saveMutation = useMutation({
    mutationFn: async (uids: string[]) => {
      return onSubmit(uids);
    },
    onSuccess: () => {
      setStage({ type: 'editing' });
      reset();
      onHide();
    },
  });

  const onFormSubmit = async (data: InviteStudentForm) => {
    const uids = parseUids(data.uids);
    void saveMutation.mutate(uids);
  };

  const onClose = () => {
    setStage({ type: 'editing' });
    reset();
    clearErrors();
    saveMutation.reset();
    onHide();
  };

  if (stage.type === 'confirming') {
    return (
      <Modal show={show} backdrop="static" onHide={() => setStage({ type: 'editing' })}>
        <Modal.Header closeButton>
          <Modal.Title>Confirm invalid students</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>The following UIDs cannot be invited:</p>
          <div class="mb-3 p-3 bg-light border rounded">
            {stage.invalidUids.map((invalid) => (
              <div key={invalid.uid}>
                <strong>{invalid.uid}</strong>: {invalid.reason}
              </div>
            ))}
          </div>
          <p>
            Do you want to continue editing, or invite just the {stage.validUids.length} valid{' '}
            {stage.validUids.length === 1 ? 'student' : 'students'}?
          </p>
          {saveMutation.isError && (
            <Alert variant="danger" dismissible onClose={() => saveMutation.reset()}>
              {saveMutation.error instanceof Error
                ? saveMutation.error.message
                : 'An error occurred'}
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            class="btn btn-outline-secondary"
            disabled={saveMutation.isPending}
            onClick={() => setStage({ type: 'editing' })}
          >
            Continue editing
          </button>
          <button
            type="button"
            class="btn btn-warning"
            disabled={saveMutation.isPending}
            onClick={() => {
              void saveMutation.mutate(stage.validUids);
            }}
          >
            {saveMutation.isPending ? 'Inviting...' : 'Invite Anyway'}
          </button>
        </Modal.Footer>
      </Modal>
    );
  }

  return (
    <Modal show={show} backdrop="static" onHide={onClose}>
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
              {...register('uids', {
                validate: validateUids,
              })}
            />
            {errors.uids?.message && <div class="invalid-feedback">{errors.uids.message}</div>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            class="btn btn-secondary"
            disabled={saveMutation.isPending}
            onClick={onClose}
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
