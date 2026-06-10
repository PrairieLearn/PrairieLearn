import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Alert, Modal } from 'react-bootstrap';
import { Controller, useForm } from 'react-hook-form';

import { run } from '@prairielearn/run';
import { assertNever } from '@prairielearn/utils';

import { ColorPicker } from '../../../components/ColorPicker.js';
import { getAppError } from '../../../lib/client/errors.js';
import { getCourseInstanceJobSequenceUrl } from '../../../lib/client/url.js';
import { parseUniqueValuesFromString } from '../../../lib/string-util.js';
import { ColorJsonSchema } from '../../../schemas/infoCourse.js';
import { useTRPC } from '../../../trpc/courseInstance/context.js';
import type { StudentLabelError } from '../../../trpc/courseInstance/student-labels.js';
import { MAX_LABEL_UIDS } from '../instructorStudentsLabels.types.js';

export type LabelModifyModalData =
  | { type: 'add'; origHash: string | null }
  | {
      type: 'edit';
      labelId: string;
      name: string;
      color: string;
      uids: string[];
      origHash: string | null;
    };

interface LabelFormValues {
  name: string;
  color: string;
  uids: string;
}

export function LabelModifyModal({
  data,
  courseInstanceId,
  show,
  onHide,
  onExited,
  onSuccess,
}: {
  data: LabelModifyModalData | null;
  courseInstanceId: string;
  show: boolean;
  onHide: () => void;
  onExited?: () => void;
  onSuccess: (result: { origHash: string | null; enrollmentWarning?: string }) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<
    { type: 'editing' } | { type: 'confirming'; unknownUids: string[] }
  >({ type: 'editing' });

  const values = run(() => {
    if (data === null) return { name: '', color: 'blue1', uids: '' };
    if (data.type === 'add') return { name: '', color: 'blue1', uids: '' };
    return { name: data.name, color: data.color, uids: data.uids.join('\n') };
  });

  const {
    control,
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
    watch,
  } = useForm<LabelFormValues>({
    // Use reactive values because this modal stays mounted while editing different labels.
    values,
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
  });

  const selectedColor = watch('color');

  const saveMutation = useMutation({
    ...trpc.studentLabels.upsert.mutationOptions(),
    onSuccess: (result) => onSuccess(result),
  });

  const onFormSubmit = async (formData: LabelFormValues) => {
    let uids: string[] = [];
    try {
      uids = parseUniqueValuesFromString(formData.uids, MAX_LABEL_UIDS);
    } catch (err) {
      setError('uids', {
        message: err instanceof Error ? err.message : 'Invalid UIDs',
      });
      return;
    }

    if (uids.length > 0) {
      try {
        const result = await queryClient.fetchQuery(
          trpc.studentLabels.checkUids.queryOptions({ uids }),
        );
        if (result.unenrolledUids.length > 0) {
          setStage({ type: 'confirming', unknownUids: result.unenrolledUids });
          return;
        }
      } catch (err) {
        setError('uids', {
          message:
            err instanceof Error
              ? `Failed to validate UIDs: ${err.message}`
              : 'Failed to validate UIDs',
        });
        return;
      }
    }

    submitMutation(formData);
  };

  const submitMutation = (formData: LabelFormValues) => {
    const color = ColorJsonSchema.parse(formData.color);
    saveMutation.mutate({
      labelId: data?.type === 'edit' ? data.labelId : undefined,
      name: formData.name.trim(),
      color,
      uids: parseUniqueValuesFromString(formData.uids.trim(), MAX_LABEL_UIDS),
      origHash: data?.origHash ?? null,
    });
  };

  const appError = getAppError<StudentLabelError['Upsert']>(saveMutation.error);

  function renderMutationError() {
    if (!appError) return null;

    switch (appError.code) {
      case 'SYNC_JOB_FAILED':
        return (
          <Alert variant="danger" dismissible onClose={() => saveMutation.reset()}>
            {appError.message}{' '}
            <a href={getCourseInstanceJobSequenceUrl(courseInstanceId, appError.jobSequenceId)}>
              View job logs
            </a>
          </Alert>
        );
      case 'UNKNOWN':
        return (
          <Alert variant="danger" dismissible onClose={() => saveMutation.reset()}>
            {appError.message}
          </Alert>
        );
      default:
        assertNever(appError);
    }
  }

  if (stage.type === 'confirming') {
    return (
      <Modal show={show} backdrop="static" onHide={() => setStage({ type: 'editing' })}>
        <Modal.Header closeButton>
          <Modal.Title>Confirm unknown UIDs</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {renderMutationError()}
          <p>The following UIDs are not found in this course instance:</p>
          <div className="mb-3 p-3 bg-light border rounded">
            {stage.unknownUids.map((uid) => (
              <div key={uid}>{uid}</div>
            ))}
          </div>
          <p>
            Do you want to continue editing, or save the label anyway? Unknown UIDs will be ignored.
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
            onClick={() => submitMutation(watch())}
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
        reset();
        onExited?.();
      }}
    >
      <Modal.Header closeButton>
        <Modal.Title>{data?.type === 'add' ? 'Add label' : 'Edit label'}</Modal.Title>
      </Modal.Header>
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <Modal.Body>
          {renderMutationError()}
          <div className="d-flex flex-column align-items-center mb-4">
            <span className={clsx('badge', `color-${selectedColor}`)}>
              {watch('name') || 'Label preview'}
            </span>
          </div>
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
            <Controller
              control={control}
              name="color"
              render={({ field }) => (
                <ColorPicker id="label-color" value={field.value} onChange={field.onChange} />
              )}
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
              {...register('uids')}
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
