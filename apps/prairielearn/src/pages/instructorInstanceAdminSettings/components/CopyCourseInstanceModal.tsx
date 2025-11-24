import { useMutation } from '@tanstack/react-query';
import { useState } from 'preact/compat';
import { Alert, Modal } from 'react-bootstrap';
import { FormProvider, useForm } from 'react-hook-form';

import {
  CourseInstancePublishingForm,
  type PublishingFormValues,
} from '../../../components/CourseInstancePublishingForm.js';
import type { PageContext } from '../../../lib/client/page-context.js';

interface CopyFormValues extends PublishingFormValues {
  short_name: string;
  long_name: string;
}

export function CopyCourseInstanceModal({
  show,
  onHide,
  csrfToken,
  courseInstance,
  initialShortName,
  initialLongName,
}: {
  show: boolean;
  onHide: () => void;
  csrfToken: string;
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  initialShortName: string;
  initialLongName: string;
}) {
  const [serverError, setServerError] = useState<string | null>(null);

  const methods = useForm<CopyFormValues>({
    defaultValues: {
      short_name: initialShortName,
      long_name: initialLongName,
      start_date: '',
      end_date: '',
    },
    mode: 'onSubmit',
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = methods;

  const copyMutation = useMutation({
    mutationFn: async (data: CopyFormValues) => {
      const body = {
        __csrf_token: csrfToken,
        __action: 'copy_course_instance',
        short_name: data.short_name.trim(),
        long_name: data.long_name.trim(),
        start_date: data.start_date,
        end_date: data.end_date,
      };

      const resp = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const body = await resp.json();
        throw new Error(body.error || 'Failed to copy course instance');
      }

      const result = await resp.json();
      return result;
    },
    onSuccess: (data) => {
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
      }
    },
    onError: (error: Error) => {
      setServerError(error.message);
    },
  });

  const onFormSubmit = async (data: CopyFormValues, event?: React.FormEvent) => {
    event?.preventDefault();
    setServerError(null);
    void copyMutation.mutate(data);
  };

  return (
    <Modal
      show={show}
      backdrop="static"
      size="lg"
      onHide={() => {
        copyMutation.reset();
        setServerError(null);
        onHide();
      }}
    >
      <Modal.Header closeButton>
        <Modal.Title>Copy course instance</Modal.Title>
      </Modal.Header>
      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Modal.Body>
            <p class="text-muted">
              Create a copy of this course instance with a new name and publishing settings.
            </p>

            {serverError && (
              <Alert variant="danger" dismissible onClose={() => setServerError(null)}>
                {serverError}
              </Alert>
            )}

            <div class="mb-3">
              <label class="form-label" for="copy-short-name">
                Short name (CIID)
              </label>
              <input
                id="copy-short-name"
                type="text"
                class="form-control font-monospace"
                {...register('short_name', {
                  required: 'Short name is required',
                  pattern: {
                    value: /^[-A-Za-z0-9_/]+$/,
                    message: 'Use only letters, numbers, dashes, and underscores, with no spaces',
                  },
                })}
              />
              {errors.short_name && (
                <div class="text-danger small mt-1">{errors.short_name.message}</div>
              )}
              <small class="form-text text-muted">
                The recommended format is <code>Fa19</code> or <code>Fall2019</code>.
              </small>
            </div>

            <div class="mb-3">
              <label class="form-label" for="copy-long-name">
                Long name
              </label>
              <input
                id="copy-long-name"
                type="text"
                class="form-control"
                {...register('long_name', {
                  required: 'Long name is required',
                })}
              />
              {errors.long_name && (
                <div class="text-danger small mt-1">{errors.long_name.message}</div>
              )}
              <small class="form-text text-muted">
                The full course instance name, such as "Fall 2025".
              </small>
            </div>

            <hr />

            <h3 class="h5">Publishing settings</h3>
            <p class="text-muted small">
              Choose the initial publishing status for your new course instance.
            </p>

            <CourseInstancePublishingForm
              courseInstance={courseInstance}
              canEdit={true}
              originalStartDate={null}
              originalEndDate={null}
              showButtons={false}
            />
          </Modal.Body>

          <Modal.Footer>
            <button
              type="button"
              class="btn btn-secondary"
              disabled={copyMutation.isPending}
              onClick={() => {
                copyMutation.reset();
                setServerError(null);
                onHide();
              }}
            >
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" disabled={copyMutation.isPending}>
              {copyMutation.isPending ? 'Copying...' : 'Copy course instance'}
            </button>
          </Modal.Footer>
        </form>
      </FormProvider>
    </Modal>
  );
}

CopyCourseInstanceModal.displayName = 'CopyCourseInstanceModal';
