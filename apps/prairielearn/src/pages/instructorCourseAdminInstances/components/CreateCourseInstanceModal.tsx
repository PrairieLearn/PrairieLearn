import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { Alert, Modal } from 'react-bootstrap';
import { FormProvider, useForm } from 'react-hook-form';

import {
  CourseInstancePermissionsForm,
  type PermissionsFormValues,
} from '../../../components/CourseInstancePermissionsForm.js';
import {
  CourseInstancePublishingForm,
  type PublishingFormValues,
} from '../../../components/CourseInstancePublishingForm.js';
import {
  CourseInstanceSelfEnrollmentForm,
  type SelfEnrollmentFormValues,
} from '../../../components/CourseInstanceSelfEnrollmentForm.js';
import type { StaffCourse } from '../../../lib/client/safe-db-types.js';
import { getCourseEditErrorUrl, getCourseInstanceSettingsUrl } from '../../../lib/client/url.js';

interface CreateFormValues
  extends PublishingFormValues,
    SelfEnrollmentFormValues,
    PermissionsFormValues {
  short_name: string;
  long_name: string;
}

export function CreateCourseInstanceModal({
  show,
  onHide,
  course,
  csrfToken,
  enrollmentManagementEnabled,
}: {
  show: boolean;
  onHide: () => void;
  course: StaffCourse;
  csrfToken: string;
  enrollmentManagementEnabled: boolean;
}) {
  const methods = useForm<CreateFormValues>({
    defaultValues: {
      short_name: '',
      long_name: '',
      start_date: '',
      end_date: '',
      self_enrollment_enabled: true,
      self_enrollment_use_enrollment_code: true,
      course_instance_permission: 'Student Data Editor',
    },
    mode: 'onSubmit',
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = methods;

  const createMutation = useMutation({
    mutationFn: async (data: CreateFormValues) => {
      const body = {
        __csrf_token: csrfToken,
        __action: 'add_course_instance',
        short_name: data.short_name.trim(),
        long_name: data.long_name.trim(),
        start_date: data.start_date,
        end_date: data.end_date,
        self_enrollment_enabled: data.self_enrollment_enabled,
        self_enrollment_use_enrollment_code: data.self_enrollment_use_enrollment_code,
        course_instance_permission: data.course_instance_permission,
      };

      const resp = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await resp.json();
      if (!resp.ok) {
        if (result.job_sequence_id) {
          // Redirect to the error page
          window.location.href = getCourseEditErrorUrl(course.id, result.job_sequence_id);
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

  const onFormSubmit = async (data: CreateFormValues, event?: React.FormEvent) => {
    event?.preventDefault();
    void createMutation.mutate(data);
  };

  return (
    <Modal
      show={show}
      backdrop="static"
      size="lg"
      onHide={() => {
        createMutation.reset();
        reset();
        onHide();
      }}
    >
      <Modal.Header closeButton>
        <Modal.Title>Create course instance</Modal.Title>
      </Modal.Header>
      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Modal.Body>
            {createMutation.isError && (
              <Alert variant="danger" dismissible onClose={() => createMutation.reset()}>
                {createMutation.error.message}
              </Alert>
            )}

            <div className="mb-3">
              <label className="form-label" for="create-long-name">
                Long name
              </label>
              <input
                id="create-long-name"
                type="text"
                className={clsx('form-control', errors.long_name && 'is-invalid')}
                aria-describedby="create-long-name-help"
                aria-invalid={!!errors.long_name}
                aria-errormessage={errors.long_name ? 'create-long-name-error' : undefined}
                {...register('long_name', {
                  required: 'Long name is required',
                })}
              />
              <small id="create-long-name-help" className="form-text text-muted">
                The full course instance name, such as &quot;Fall 2025&quot;. Users see it joined to
                the course name, e.g. &quot;
                {course.short_name} Fall 2025&quot;.
              </small>
              {errors.long_name && (
                <div className="invalid-feedback" id="create-long-name-error">
                  {errors.long_name.message}
                </div>
              )}
            </div>

            <div className="mb-3">
              <label className="form-label" for="create-short-name">
                Short name
              </label>
              <input
                id="create-short-name"
                type="text"
                className={clsx('form-control font-monospace', errors.short_name && 'is-invalid')}
                aria-describedby="create-short-name-help"
                aria-invalid={!!errors.short_name}
                aria-errormessage={errors.short_name ? 'create-short-name-error' : undefined}
                {...register('short_name', {
                  required: 'Short name is required',
                  pattern: {
                    value: /^[-A-Za-z0-9_/]+$/,
                    message: 'Use only letters, numbers, dashes, and underscores, with no spaces',
                  },
                })}
              />
              <small id="create-short-name-help" className="form-text text-muted">
                A short name, such as &quot;Fa25&quot; or &quot;W25b&quot;. This is used in menus
                and headers where a short description is required. Use only letters, numbers,
                dashes, and underscores, with no spaces.
              </small>
              {errors.short_name && (
                <div className="invalid-feedback" id="create-short-name-error">
                  {errors.short_name.message}
                </div>
              )}
            </div>

            <hr />

            <h3 className="h5">Publishing settings</h3>
            <p className="text-muted small">
              Choose the initial publishing status for your new course instance. This can be changed
              later.
            </p>

            <CourseInstancePublishingForm
              displayTimezone={course.display_timezone}
              canEdit={true}
              originalStartDate={null}
              originalEndDate={null}
              showButtons={false}
              formId="create-course-instance"
            />

            {enrollmentManagementEnabled && (
              <>
                <hr />

                <h3 className="h5">Self-enrollment settings</h3>
                <p className="text-muted small">
                  Configure self-enrollment for your new course instance. This can be changed later.
                </p>

                <CourseInstanceSelfEnrollmentForm formId="create-course-instance" />
              </>
            )}

            <hr />

            <h3 className="h5">Course instance permissions</h3>
            <p className="text-muted small">
              Choose your initial permissions for this course instance. This can be changed later.
            </p>

            <CourseInstancePermissionsForm formId="create-course-instance" />
          </Modal.Body>

          <Modal.Footer>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={createMutation.isPending}
              onClick={() => {
                createMutation.reset();
                reset();
                onHide();
              }}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </button>
          </Modal.Footer>
        </form>
      </FormProvider>
    </Modal>
  );
}
