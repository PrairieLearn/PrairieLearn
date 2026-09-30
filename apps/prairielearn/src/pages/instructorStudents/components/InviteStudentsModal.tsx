import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Alert, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { StudentLabelBadge } from '../../../components/StudentLabelBadge.js';
import { StudentLabelDropdown } from '../../../components/StudentLabelDropdown.js';
import type { StaffCourseInstance, StaffStudentLabel } from '../../../lib/client/safe-db-types.js';
import { computeStatus } from '../../../lib/publishing.js';
import { parseUniqueValuesFromString } from '../../../lib/string-util.js';

interface InviteStudentForm {
  uids: string;
}

const MAX_UIDS = 1000;

export function InviteStudentsModal({
  show,
  courseInstance,
  studentLabels,
  selfEnrollLink,
  onHide,
  onSubmit,
}: {
  show: boolean;
  courseInstance: StaffCourseInstance;
  studentLabels: StaffStudentLabel[];
  selfEnrollLink: string;
  onHide: () => void;
  onSubmit: (uids: string[], labelIds: string[]) => Promise<void>;
}) {
  const [selectedLabelIds, setSelectedLabelIds] = useState<Set<string>>(() => new Set());
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

    const invalidUids = uids.filter((uid) => !z.email().safeParse(uid).success);

    if (invalidUids.length > 0) {
      return `The following UIDs were invalid: "${invalidUids.join('", "')}"`;
    }

    return true;
  };

  const saveMutation = useMutation({
    mutationFn: async (uids: string[]) => {
      return onSubmit(uids, [...selectedLabelIds]);
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
    setSelectedLabelIds(new Set());
    saveMutation.reset();
  };

  return (
    <Modal show={show} backdrop="static" onHide={onHide} onExited={resetModalState}>
      <Modal.Header closeButton>
        <Modal.Title>Invite students</Modal.Title>
      </Modal.Header>

      <form onSubmit={handleSubmit(onFormSubmit)}>
        <Modal.Body>
          {courseInstance.modern_publishing &&
            computeStatus(
              courseInstance.publishing_start_date,
              courseInstance.publishing_end_date,
            ) !== 'published' && (
              <Alert variant="warning">
                Students will not be able to accept the invitation until the course instance is
                published.
              </Alert>
            )}
          {saveMutation.isError && (
            <Alert variant="danger" dismissible onClose={() => saveMutation.reset()}>
              {saveMutation.error instanceof Error
                ? saveMutation.error.message
                : 'An error occurred'}
            </Alert>
          )}
          <div className="mb-0">
            <label htmlFor="invite-uids" className="form-label">
              UIDs
            </label>
            <textarea
              id="invite-uids"
              className={clsx('form-control', errors.uids && 'is-invalid')}
              rows={5}
              defaultValue=""
              placeholder="student@example.com"
              aria-invalid={!!errors.uids}
              aria-errormessage={errors.uids ? 'invite-uids-error' : undefined}
              aria-describedby="invite-uids-help"
              {...register('uids', {
                validate: validateUidsFormat,
              })}
            />
            {errors.uids?.message && (
              <div className="invalid-feedback" id="invite-uids-error">
                {errors.uids.message}
              </div>
            )}
            <div className="form-text" id="invite-uids-help">
              One UID per line, or comma/space separated. Students are not notified about the
              invitation: you must instruct them to visit{' '}
              <a href="/" target="_blank" rel="noopener noreferrer">
                the PrairieLearn homepage
              </a>{' '}
              or{' '}
              <a href={selfEnrollLink} target="_blank" rel="noopener noreferrer">
                the course instance enrollment link
              </a>{' '}
              to accept the invitation.
            </div>
          </div>
          {studentLabels.length > 0 && (
            <fieldset className="mt-3" disabled={saveMutation.isPending}>
              <legend className="form-label fs-6">Labels</legend>
              <div className="d-flex flex-wrap align-items-center gap-2">
                <StudentLabelDropdown
                  labels={studentLabels}
                  selectedIds={selectedLabelIds}
                  buttonLabel="Select labels"
                  disabled={saveMutation.isPending}
                  onToggle={(label) => {
                    setSelectedLabelIds((previous) => {
                      const next = new Set(previous);
                      if (next.has(label.id)) {
                        next.delete(label.id);
                      } else {
                        next.add(label.id);
                      }
                      return next;
                    });
                  }}
                />
                {studentLabels
                  .filter((label) => selectedLabelIds.has(label.id))
                  .map((label) => (
                    <StudentLabelBadge key={label.id} label={label} />
                  ))}
              </div>
              <div className="form-text">
                Selected labels will be added to new and already invited or enrolled students.
                Existing labels and enrollment statuses will be preserved.
              </div>
            </fieldset>
          )}
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={saveMutation.isPending}
            onClick={onHide}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Inviting...' : 'Invite'}
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
