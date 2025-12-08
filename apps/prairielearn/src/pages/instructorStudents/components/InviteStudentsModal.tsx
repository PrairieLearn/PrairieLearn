import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { Alert, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { StaffEnrollment } from '../../../lib/client/safe-db-types.js';

interface InviteStudentForm {
  uids: string;
}

export interface InvalidUidInfo {
  uid: string;
  reason: string;
}

export interface InviteResult {
  enrollments: StaffEnrollment[];
  skippedUids: InvalidUidInfo[];
}

export function InviteStudentsModal({
  show,
  onHide,
  onSubmit,
}: {
  show: boolean;
  onHide: () => void;
  onSubmit: (uids: string[], skippedUids: InvalidUidInfo[]) => Promise<InviteResult>;
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
      // Check with server for enrollment status
      const params = new URLSearchParams();
      params.append('uids', uids.join(','));

      const resp = await fetch(
        `${window.location.pathname}/invitation/check?${params.toString()}`,
        {
          headers: {
            Accept: 'application/json',
          },
        },
      );

      if (!resp.ok) throw new Error('Failed to validate UIDs');

      const { success, data } = z
        .object({ invalidUids: z.array(z.object({ uid: z.string(), reason: z.string() })) })
        .safeParse(await resp.json());
      if (!success) throw new Error('Failed to check UIDs');

      const validUids = uids.filter(
        (uid) => !data.invalidUids.some((invalid) => invalid.uid === uid),
      );

      if (validUids.length === 0) {
        if (uids.length === 1) {
          // Single UID case - show specific error
          throw new Error(data.invalidUids[0].reason);
        }
        // Multiple UIDs, all invalid
        throw new Error(
          'None of the UIDs can be invited. Please check that all users are not already invited or enrolled already, and are not instructors.',
        );
      }

      return onSubmit(validUids, data.invalidUids);
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

  const onClose = () => {
    reset();
    clearErrors();
    saveMutation.reset();
    onHide();
  };

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
                validate: validateUidsFormat,
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
