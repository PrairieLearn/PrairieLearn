import { useMutation } from '@tanstack/react-query';
import { Alert, Modal } from 'react-bootstrap';
import { FormProvider, useForm } from 'react-hook-form';

import {
  CourseInstancePublishingForm,
  type PublishingFormValues,
} from '../../../components/CourseInstancePublishingForm.js';
import {
  CourseInstanceSelfEnrollmentForm,
  type SelfEnrollmentFormValues,
} from '../../../components/CourseInstanceSelfEnrollmentForm.js';
import type { PageContext } from '../../../lib/client/page-context.js';
import {
  getCourseInstanceEditErrorUrl,
  getCourseInstanceSettingsUrl,
} from '../../../lib/client/url.js';

interface CopyFormValues extends PublishingFormValues, SelfEnrollmentFormValues {
  short_name: string;
  long_name: string;
}

export function CopyCourseInstanceModal({
  show,
  onHide,
  csrfToken,
  courseInstance,
  courseShortName,
  enrollmentManagementEnabled,
}: {
  show: boolean;
  onHide: () => void;
  csrfToken: string;
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  courseShortName: string;
  enrollmentManagementEnabled: boolean;
}) {
  const methods = useForm<CopyFormValues>({
    defaultValues: {
      short_name: '',
      long_name: '',
      start_date: '',
      end_date: '',
      self_enrollment_enabled: courseInstance.self_enrollment_enabled,
      self_enrollment_use_enrollment_code: courseInstance.self_enrollment_use_enrollment_code,
    },
    mode: 'onSubmit',
  });

  const {
    register,
    handleSubmit,
    reset,
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
        self_enrollment_enabled: data.self_enrollment_enabled,
        self_enrollment_use_enrollment_code: data.self_enrollment_use_enrollment_code,
      };

      const resp = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await resp.json();
      if (!resp.ok) {
        if (result.job_sequence_id) {
          window.location.href = getCourseInstanceEditErrorUrl(
            courseInstance.id,
            result.job_sequence_id,
          );
          return null;
        }

        throw new Error(result.error);
      }

      return result;
    },
    onSuccess: (data) => {
      if (data?.course_instance_id) {
        window.location.href = getCourseInstanceSettingsUrl(data.course_instance_id);
      }
    },
  });

  const onFormSubmit = async (data: CopyFormValues, event?: React.FormEvent) => {
    event?.preventDefault();
    void copyMutation.mutate(data);
  };

  return (
    <Modal
      show={show}
      backdrop="static"
      size="lg"
      onHide={() => {
        copyMutation.reset();
        reset();
        onHide();
      }}
    >
      <Modal.Header closeButton>
        <Modal.Title>Copy course instance</Modal.Title>
      </Modal.Header>
      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Modal.Body>
            {copyMutation.isError && (
              <Alert variant="danger" dismissible onClose={() => copyMutation.reset()}>
                {copyMutation.error.message}
              </Alert>
            )}

            <div class="mb-3">
              <label class="form-label" for="copy-long-name">
                Long name
              </label>
              <input
                id="copy-long-name"
                type="text"
                class="form-control"
                aria-describedby="copy-long-name-help"
                aria-invalid={!!errors.long_name}
                aria-errormessage={errors.long_name ? 'copy-long-name-error' : undefined}
                placeholder={courseInstance.long_name ?? undefined}
                {...register('long_name', {
                  required: 'Long name is required',
                })}
              />
              <small id="copy-long-name-help" class="form-text text-muted">
                The full course instance name, such as &quot;Fall 2025&quot;. Users see it joined to
                the course name, e.g. &quot;
                {courseShortName} Fall 2025&quot;.
              </small>
              {errors.long_name && (
                <div class="text-danger small mt-1" id="copy-long-name-error">
                  {errors.long_name.message}
                </div>
              )}
            </div>

            <div class="mb-3">
              <label class="form-label" for="copy-short-name">
                Short name
              </label>
              <input
                id="copy-short-name"
                type="text"
                class="form-control font-monospace"
                aria-describedby="copy-short-name-help"
                aria-invalid={!!errors.short_name}
                aria-errormessage={errors.short_name ? 'copy-short-name-error' : undefined}
                placeholder={courseInstance.short_name}
                {...register('short_name', {
                  required: 'Short name is required',
                  pattern: {
                    value: /^[-A-Za-z0-9_/]+$/,
                    message: 'Use only letters, numbers, dashes, and underscores, with no spaces',
                  },
                })}
              />
              <small id="copy-short-name-help" class="form-text text-muted">
                A short name, such as &quot;Fa25&quot; or &quot;W25b&quot;. This is used in menus
                and headers where a short description is required. Use only letters, numbers,
                dashes, and underscores, with no spaces.
              </small>
              {errors.short_name && (
                <div class="text-danger small mt-1" id="copy-short-name-error">
                  {errors.short_name.message}
                </div>
              )}
            </div>

            <hr />

            <h3 class="h5">Publishing settings</h3>
            <p class="text-muted small">
              Choose the initial publishing status for your new course instance. This can be changed
              later.
            </p>

            <CourseInstancePublishingForm
              displayTimezone={courseInstance.display_timezone}
              canEdit={true}
              originalStartDate={null}
              originalEndDate={null}
              showButtons={false}
            />

            {enrollmentManagementEnabled && (
              <>
                <hr />

                <h3 class="h5">Self-enrollment settings</h3>
                <p class="text-muted small">
                  Configure self-enrollment for your new course instance. This can be changed later.
                </p>

                <CourseInstanceSelfEnrollmentForm />
              </>
            )}
          </Modal.Body>

          <Modal.Footer>
            <button
              type="button"
              class="btn btn-secondary"
              disabled={copyMutation.isPending}
              onClick={() => {
                copyMutation.reset();
                reset();
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
