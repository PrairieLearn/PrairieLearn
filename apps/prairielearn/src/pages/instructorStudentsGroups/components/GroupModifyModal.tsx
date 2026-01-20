import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import z from 'zod';

import { run } from '@prairielearn/run';

import { ColorPicker } from '../../../components/ColorPicker.js';
import { getCourseInstanceJobSequenceUrl } from '../../../lib/client/url.js';
import { parseUniqueValuesFromString } from '../../../lib/string-util.js';

class SaveError extends Error {
  jobSequenceId?: string;

  constructor(message: string, jobSequenceId?: string) {
    super(message);
    this.jobSequenceId = jobSequenceId;
  }
}

export type GroupModifyModalData =
  | { type: 'add'; origHash: string | null }
  | {
      type: 'edit';
      groupId: string;
      name: string;
      color: string;
      uids: string;
      origHash: string | null;
    };

interface GroupFormValues {
  name: string;
  color: string;
  uids: string;
}

const MAX_UIDS = 1000;

export function GroupModifyModal({
  data,
  csrfToken,
  courseInstanceId,
  show,
  onHide,
  onExited,
  onSuccess,
}: {
  data: GroupModifyModalData | null;
  csrfToken: string;
  courseInstanceId: string;
  show: boolean;
  onHide: () => void;
  onExited: () => void;
  onSuccess: () => void;
}) {
  const [stage, setStage] = useState<
    { type: 'editing' } | { type: 'confirming'; unenrolledUids: string[] }
  >({ type: 'editing' });

  const defaultValues = run(() => {
    if (data === null) return { name: '', color: 'blue1', uids: '' };
    if (data.type === 'add') return { name: '', color: 'blue1', uids: '' };
    return { name: data.name, color: data.color, uids: data.uids };
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<GroupFormValues>({
    values: defaultValues,
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
  });

  const selectedColor = watch('color');

  const validateUids = async (value: string) => {
    let uids: string[] = [];
    try {
      uids = parseUniqueValuesFromString(value, MAX_UIDS);
    } catch (error) {
      return error instanceof Error ? error.message : 'Failed to parse UIDs';
    }

    // UIDs are optional - empty is valid
    if (uids.length === 0) {
      return true;
    }

    const invalidEmails = uids.filter((uid) => !z.string().email().safeParse(uid).success);

    if (invalidEmails.length > 0) {
      return `The following UIDs were invalid: "${invalidEmails.join('", "')}"`;
    }

    const params = new URLSearchParams();
    params.append('uids', uids.join(','));
    let resp: Response | null = null;
    try {
      resp = await fetch(`${window.location.pathname}/check?${params.toString()}`);
    } catch {
      return 'Failed to validate UIDs';
    }

    if (!resp.ok) return 'Failed to validate UIDs';

    const { success, data: responseData } = z
      .object({ invalidUids: z.array(z.string()) })
      .safeParse(await resp.json());
    if (!success) return 'Failed to check UIDs';

    if (responseData.invalidUids.length > 0) {
      setStage({ type: 'confirming', unenrolledUids: responseData.invalidUids });
      return false;
    }
    return true;
  };

  const saveMutation = useMutation({
    mutationFn: async (formData: GroupFormValues) => {
      const body = new URLSearchParams({
        __csrf_token: csrfToken,
        __action: data?.type === 'edit' ? 'edit_group' : 'create_group',
        name: formData.name.trim(),
        color: formData.color,
        uids: formData.uids.trim(),
        orig_hash: data?.origHash ?? '',
      });
      if (data?.type === 'edit') {
        body.append('group_id', data.groupId);
        body.append('old_name', data.name);
      }
      const resp = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body,
      });
      if (!resp.ok) {
        const responseBody = await resp.json();
        throw new SaveError(responseBody.error, responseBody.jobSequenceId);
      }
    },
    onSuccess,
  });

  const onFormSubmit = async (formData: GroupFormValues) => {
    void saveMutation.mutate(formData);
  };

  if (stage.type === 'confirming') {
    return (
      <Modal show={data !== null} backdrop="static" onHide={() => setStage({ type: 'editing' })}>
        <Modal.Header closeButton>
          <Modal.Title>Confirm unenrolled students</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>The following UIDs are not enrolled in this course instance:</p>
          <div className="mb-3 p-3 bg-light border rounded">
            {stage.unenrolledUids.map((uid) => (
              <div key={uid}>{uid}</div>
            ))}
          </div>
          <p>
            Do you want to continue editing, or save the group anyway? Unenrolled students will be
            ignored.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="btn btn-outline-secondary"
            disabled={saveMutation.isPending}
            onClick={() => setStage({ type: 'editing' })}
          >
            Continue editing
          </button>
          <button
            type="button"
            className="btn btn-warning"
            disabled={saveMutation.isPending}
            onClick={handleSubmit((formData, event) => {
              event?.preventDefault();
              void saveMutation.mutate(formData);
            })}
          >
            {saveMutation.isPending ? 'Saving...' : 'Save anyway'}
          </button>
        </Modal.Footer>
      </Modal>
    );
  }

  return (
    <Modal
      show={show}
      backdrop="static"
      onHide={onHide}
      onExited={() => {
        setStage({ type: 'editing' });
        saveMutation.reset();
        onExited();
      }}
    >
      <Modal.Header closeButton>
        <Modal.Title>{data?.type === 'add' ? 'Add group' : 'Edit group'}</Modal.Title>
      </Modal.Header>
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <Modal.Body>
          {saveMutation.isError && (
            <Alert variant="danger" dismissible onClose={() => saveMutation.reset()}>
              {saveMutation.error.message}
              {saveMutation.error instanceof SaveError && saveMutation.error.jobSequenceId && (
                <>
                  {' '}
                  <a
                    href={getCourseInstanceJobSequenceUrl(
                      courseInstanceId,
                      saveMutation.error.jobSequenceId,
                    )}
                  >
                    View job logs
                  </a>
                </>
              )}
            </Alert>
          )}
          <div className="mb-3">
            <label className="form-label" htmlFor="group-name">
              Group name
            </label>
            <input
              id="group-name"
              type="text"
              className="form-control"
              {...register('name', { required: 'Group name is required' })}
            />
            {errors.name && <div className="text-danger small">{String(errors.name.message)}</div>}
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="group-color">
              Color
            </label>
            <ColorPicker value={selectedColor} onChange={(color) => setValue('color', color)} />
            <input type="hidden" id="group-color" {...register('color')} />
          </div>
          <div className="mb-0">
            <label className="form-label" htmlFor="group-uids">
              UIDs (optional)
            </label>
            <textarea
              id="group-uids"
              className="form-control"
              aria-describedby="group-uids-help"
              rows={5}
              {...register('uids', {
                validate: validateUids,
              })}
            />
            {errors.uids && <div className="text-danger small">{String(errors.uids.message)}</div>}
            <small id="group-uids-help" className="form-text">
              Enter UIDs separated by commas, whitespace, or new lines.
            </small>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="btn btn-outline-secondary"
            disabled={saveMutation.isPending}
            onClick={() => {
              setStage({ type: 'editing' });
              saveMutation.reset();
              onHide();
            }}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
