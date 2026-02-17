import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Alert, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { run } from '@prairielearn/run';

import { ColorPicker } from '../../../components/ColorPicker.js';
import { extractJobSequenceId } from '../../../lib/client/errors.js';
import { getCourseInstanceJobSequenceUrl } from '../../../lib/client/url.js';
import { parseUniqueValuesFromString } from '../../../lib/string-util.js';
import { ColorJsonSchema } from '../../../schemas/infoCourse.js';
import type { StudentLabelsTrpcClient } from '../utils/trpc-client.js';

export type LabelModifyModalData =
  | { type: 'add'; origHash: string | null }
  | {
      type: 'edit';
      labelId: string;
      name: string;
      color: string;
      uids: string;
      origHash: string | null;
    };

interface LabelFormValues {
  name: string;
  color: string;
  uids: string;
}

const MAX_UIDS = 1000;

export function LabelModifyModal({
  data,
  trpcClient,
  courseInstanceId,
  show,
  onHide,
  onExited,
  onSuccess,
  initialUids,
}: {
  data: LabelModifyModalData | null;
  trpcClient: StudentLabelsTrpcClient;
  courseInstanceId: string;
  show: boolean;
  onHide: () => void;
  onExited?: () => void;
  onSuccess: (newOrigHash: string | null) => void;
  initialUids?: string;
}) {
  const [stage, setStage] = useState<
    { type: 'editing' } | { type: 'confirming'; unenrolledUids: string[] }
  >({ type: 'editing' });

  const defaultValues = run(() => {
    if (data === null) return { name: '', color: 'blue1', uids: '' };
    if (data.type === 'add') return { name: '', color: 'blue1', uids: initialUids ?? '' };
    return { name: data.name, color: data.color, uids: data.uids };
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<LabelFormValues>({
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

    try {
      const result = await trpcClient.checkUids.query({ uids });
      if (result.invalidUids.length > 0) {
        setStage({ type: 'confirming', unenrolledUids: result.invalidUids });
        return 'Some UIDs are not enrolled in this course instance';
      }
      return true;
    } catch {
      return 'Failed to validate UIDs.';
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (formData: LabelFormValues) => {
      const color = ColorJsonSchema.parse(formData.color);
      if (data?.type === 'edit') {
        return await trpcClient.editLabel.mutate({
          labelId: data.labelId,
          name: formData.name.trim(),
          oldName: data.name,
          color,
          uids: formData.uids.trim(),
          origHash: data.origHash,
        });
      } else {
        return await trpcClient.createLabel.mutate({
          name: formData.name.trim(),
          color,
          uids: formData.uids.trim(),
          origHash: data?.origHash ?? null,
        });
      }
    },
    onSuccess: (result) => onSuccess(result.origHash),
  });

  const onFormSubmit = async (formData: LabelFormValues) => {
    void saveMutation.mutate(formData);
  };

  const jobSequenceId = extractJobSequenceId(saveMutation.error);

  if (stage.type === 'confirming') {
    return (
      <Modal show={show} backdrop="static" onHide={() => setStage({ type: 'editing' })}>
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
            Do you want to continue editing, or save the label anyway? Unenrolled students will be
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
            onClick={() => {
              const formData = watch();
              void saveMutation.mutate(formData);
            }}
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
        onExited?.();
      }}
    >
      <Modal.Header closeButton>
        <Modal.Title>{data?.type === 'add' ? 'Add label' : 'Edit label'}</Modal.Title>
      </Modal.Header>
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <Modal.Body>
          {saveMutation.isError && (
            <Alert variant="danger" dismissible onClose={() => saveMutation.reset()}>
              {saveMutation.error.message}
              {jobSequenceId && (
                <>
                  {' '}
                  <a href={getCourseInstanceJobSequenceUrl(courseInstanceId, jobSequenceId)}>
                    View job logs
                  </a>
                </>
              )}
            </Alert>
          )}
          <div className="mb-3">
            <label className="form-label" htmlFor="label-name">
              Label name
            </label>
            <input
              id="label-name"
              type="text"
              className={clsx('form-control', errors.name && 'is-invalid')}
              aria-invalid={!!errors.name}
              aria-errormessage={errors.name ? 'label-name-error' : undefined}
              {...register('name', { required: 'Label name is required' })}
            />
            {errors.name && (
              <div id="label-name-error" className="invalid-feedback d-block">
                {String(errors.name.message)}
              </div>
            )}
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="label-color">
              Color
            </label>
            <ColorPicker
              id="label-color"
              value={selectedColor}
              onChange={(color) => setValue('color', color)}
            />
          </div>
          <div className="mb-0">
            <label className="form-label" htmlFor="label-uids">
              UIDs (optional)
            </label>
            <textarea
              id="label-uids"
              className={clsx('form-control', errors.uids && 'is-invalid')}
              aria-invalid={!!errors.uids}
              aria-describedby="label-uids-help"
              aria-errormessage={errors.uids ? 'label-uids-error' : undefined}
              rows={5}
              {...register('uids', {
                validate: validateUids,
              })}
            />
            {errors.uids && (
              <div id="label-uids-error" className="invalid-feedback d-block">
                {String(errors.uids.message)}
              </div>
            )}
            <small id="label-uids-help" className="form-text">
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
