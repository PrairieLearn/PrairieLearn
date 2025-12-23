import { Temporal } from '@js-temporal/polyfill';
import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'preact/compat';
import { Alert, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import z from 'zod';

import { run } from '@prairielearn/run';

import { parseUniqueValuesFromString } from '../../../lib/user.js';
import { plainDateTimeStringToDate } from '../utils/dateUtils.js';

export type ExtensionModifyModalData =
  | { type: 'add'; endDate: string }
  | { type: 'edit'; endDate: string; extensionId: string; name: string; uids: string };

interface ExtensionFormValues {
  name: string;
  end_date: string;
  uids: string;
}

export function ExtensionModifyModal({
  data,
  currentUnpublishText,
  courseInstanceEndDate,
  courseInstanceTimezone,
  csrfToken,
  show,
  onHide,
  onExited,
  onSuccess,
}: {
  data: ExtensionModifyModalData | null;
  currentUnpublishText: string;
  courseInstanceEndDate: Date | null;
  courseInstanceTimezone: string;
  csrfToken: string;
  show: boolean;
  onHide: () => void;
  onExited: () => void;
  onSuccess: () => void;
}) {
  const [stage, setStage] = useState<
    { type: 'editing' } | { type: 'confirming'; unenrolledUids: string[] }
  >({ type: 'editing' });

  const defaultValues = run(() => {
    if (data === null) return { end_date: '', name: '', uids: '' };
    if (data.type === 'add') return { end_date: data.endDate, name: '', uids: '' };
    return { end_date: data.endDate, name: data.name, uids: data.uids };
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors },
  } = useForm<ExtensionFormValues>({
    values: defaultValues,
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
  });

  const currentEndDate = watch('end_date');

  const handleAddWeek = async () => {
    const currentDate = Temporal.PlainDateTime.from(currentEndDate);
    const newValue = currentDate.add({ weeks: 1 });
    setValue('end_date', newValue.toString());
    await trigger('end_date');
  };

  const validateEmails = async (value: string) => {
    let uids: string[] = [];
    try {
      uids = parseUniqueValuesFromString(value);
    } catch (error) {
      return error instanceof Error ? error.message : 'Failed to parse UIDs';
    }

    if (uids.length === 0) {
      return 'At least one UID is required';
    }

    const invalidEmails = uids.filter((uid) => !z.string().email().safeParse(uid).success);

    if (invalidEmails.length > 0) {
      return `The following UIDs were invalid: "${invalidEmails.join('", "')}"`;
    }

    const params = new URLSearchParams();
    params.append('uids', uids.join(','));
    let resp: Response | null = null;
    try {
      resp = await fetch(`${window.location.pathname}/extension/check?${params.toString()}`);
    } catch {
      return 'Failed to validate UIDs';
    }

    if (!resp.ok) return 'Failed to validate UIDs';

    const { success, data } = z
      .object({ invalidUids: z.array(z.string()) })
      .safeParse(await resp.json());
    if (!success) return 'Failed to check UIDs';

    const validCount = uids.length - data.invalidUids.length;
    if (validCount < 1) {
      return 'Only enrolled students can be added to an extension';
    }

    if (data.invalidUids.length > 0) {
      setStage({ type: 'confirming', unenrolledUids: data.invalidUids });
      return false;
    }
    return true;
  };

  const saveMutation = useMutation({
    mutationFn: async (formData: ExtensionFormValues) => {
      const body = {
        __csrf_token: csrfToken,
        __action: data?.type === 'edit' ? 'edit_extension' : 'add_extension',
        name: formData.name.trim(),
        end_date: formData.end_date,
        extension_id: data?.type === 'edit' ? data.extensionId : undefined,
        uids: formData.uids.trim(),
      };
      const resp = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const body = await resp.json();
        throw new Error(body.error);
      }
    },
    onSuccess,
  });

  const onFormSubmit = async (data: ExtensionFormValues, event?: React.FormEvent) => {
    event?.preventDefault();
    void saveMutation.mutate(data);
  };

  if (stage.type === 'confirming') {
    return (
      <Modal show={data !== null} backdrop="static" onHide={() => setStage({ type: 'editing' })}>
        <Modal.Header closeButton>
          <Modal.Title>Confirm unenrolled students</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>The following UIDs are not enrolled in this course instance:</p>
          <div class="mb-3 p-3 bg-light border rounded">
            {stage.unenrolledUids.map((uid) => (
              <div key={uid}>{uid}</div>
            ))}
          </div>
          <p>
            Do you want to continue editing, or save the extension anyway? Extensions for unenrolled
            students will be ignored.
          </p>
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
            onClick={handleSubmit((data, event) => {
              event?.preventDefault();
              void saveMutation.mutate(data);
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
        <Modal.Title>{data?.type === 'add' ? 'Add extension' : 'Edit extension'}</Modal.Title>
      </Modal.Header>
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <Modal.Body>
          <div class="mb-3">
            <label class="form-label" for="ext-name">
              Extension name (optional)
            </label>
            <input id="ext-name" type="text" class="form-control" {...register('name')} />
          </div>
          <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <label class="form-label" for="ext-date">
                End date
              </label>
              <button
                type="button"
                class={clsx('btn btn-outline-primary btn-sm', !currentEndDate && 'disabled')}
                onClick={handleAddWeek}
              >
                +1 week
              </button>
            </div>
            <input
              id="ext-date"
              type="datetime-local"
              step="1"
              class="form-control"
              {...register('end_date', {
                required: 'End date is required',
                validate: (value) => {
                  if (!courseInstanceEndDate) return true;
                  const enteredDate = plainDateTimeStringToDate(value, courseInstanceTimezone);
                  // edit mode has no validation on the end date
                  return (
                    data?.type === 'edit' ||
                    enteredDate > courseInstanceEndDate ||
                    'End date must be after the course end date'
                  );
                },
              })}
            />
            {errors.end_date && (
              <div class="text-danger small">{String(errors.end_date.message)}</div>
            )}
            <small class="form-text">Current course end date: {currentUnpublishText}</small>
          </div>
          {saveMutation.isError && (
            <Alert variant="danger" dismissible onClose={() => saveMutation.reset()}>
              {saveMutation.error.message}
            </Alert>
          )}
          <div class="mb-0">
            <label class="form-label" for="ext-uids">
              UIDs
            </label>
            <textarea
              id="ext-uids"
              class="form-control"
              aria-describedby="ext-uids-help"
              rows={5}
              {...register('uids', {
                validate: validateEmails,
              })}
            />
            {errors.uids && !errors.uids.message?.toString().startsWith('UNENROLLED:') && (
              <div class="text-danger small">{String(errors.uids.message)}</div>
            )}
            <small id="ext-uids-help" class="form-text">
              Enter UIDs separated by commas, whitespace, or new lines.
            </small>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            class="btn btn-outline-secondary"
            disabled={saveMutation.isPending}
            onClick={() => {
              setStage({ type: 'editing' });
              saveMutation.reset();
              onHide();
            }}
          >
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
