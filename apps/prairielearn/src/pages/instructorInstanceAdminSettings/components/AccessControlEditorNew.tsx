import clsx from 'clsx';
import { useState } from 'preact/compat';
import { Alert, Button, Form } from 'react-bootstrap';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import type { CourseInstance } from '../../../lib/db-types.js';

const AccessControlFormSchema = z
  .object({
    published: z.boolean(),
    publishedStartDateEnabled: z.boolean(),
    publishedStartDate: z.string().optional(),
    publishedEndDate: z.string().optional(),
  })
  .refine(
    (data) => {
      // If published is true, publishedEndDate is required
      if (data.published && (!data.publishedEndDate || data.publishedEndDate.trim() === '')) {
        return false;
      }
      return true;
    },
    {
      message: 'Published end date is required when course is published',
      path: ['publishedEndDate'],
    },
  )
  .refine(
    (data) => {
      // If publishedStartDateEnabled is true, publishedStartDate is required
      if (
        data.publishedStartDateEnabled &&
        (!data.publishedStartDate || data.publishedStartDate.trim() === '')
      ) {
        return false;
      }
      return true;
    },
    {
      message: 'Published start date is required when enabled',
      path: ['publishedStartDate'],
    },
  )
  .refine(
    (data) => {
      // publishedStartDate must be before publishedEndDate if both are provided
      if (
        data.publishedStartDate &&
        data.publishedEndDate &&
        data.publishedStartDate.trim() !== '' &&
        data.publishedEndDate.trim() !== ''
      ) {
        const startDate = new Date(data.publishedStartDate);
        const endDate = new Date(data.publishedEndDate);
        return startDate < endDate;
      }
      return true;
    },
    {
      message: 'Published start date must be before published end date',
      path: ['publishedStartDate'],
    },
  );

type AccessControlFormValues = z.infer<typeof AccessControlFormSchema>;

interface AccessControlEditorProps {
  courseInstance: CourseInstance;
  canEdit: boolean;
  timezone: string;
  csrfToken: string;
  origHash: string;
  hasAllowAccessRules: boolean;
}

export function AccessControlEditor({
  courseInstance,
  canEdit,
  timezone,
  csrfToken,
  origHash,
  hasAllowAccessRules,
}: AccessControlEditorProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if we have accessControl rules (new system)
  const hasAccessControlRules =
    courseInstance.access_control_published !== null ||
    courseInstance.access_control_published_start_date_enabled !== null ||
    courseInstance.access_control_published_start_date !== null ||
    courseInstance.access_control_published_end_date !== null;

  const defaultValues: AccessControlFormValues = {
    published: courseInstance.access_control_published ?? true,
    publishedStartDateEnabled: courseInstance.access_control_published_start_date_enabled ?? false,
    publishedStartDate: courseInstance.access_control_published_start_date
      ? new Date(courseInstance.access_control_published_start_date).toISOString().slice(0, 16) // Remove seconds and timezone info for datetime-local input
      : '',
    publishedEndDate: courseInstance.access_control_published_end_date
      ? new Date(courseInstance.access_control_published_end_date).toISOString().slice(0, 16) // Remove seconds and timezone info for datetime-local input
      : '',
  };

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isDirty, isValid },
    reset,
  } = useForm<AccessControlFormValues>({
    mode: 'onChange',
    resolver: zodResolver(AccessControlFormSchema),
    defaultValues,
  });

  const publishedStartDateEnabled = useWatch({
    control,
    name: 'publishedStartDateEnabled',
  });

  const published = useWatch({
    control,
    name: 'published',
  });

  const onSubmit = async (values: AccessControlFormValues) => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Create a form and submit it
      const form = document.createElement('form');
      form.method = 'POST';
      form.style.display = 'none';

      // Add CSRF token
      const csrfInput = document.createElement('input');
      csrfInput.type = 'hidden';
      csrfInput.name = '__csrf_token';
      csrfInput.value = csrfToken;
      form.appendChild(csrfInput);

      // Add action
      const actionInput = document.createElement('input');
      actionInput.type = 'hidden';
      actionInput.name = '__action';
      actionInput.value = 'update_access_control';
      form.appendChild(actionInput);

      // Add orig hash
      const hashInput = document.createElement('input');
      hashInput.type = 'hidden';
      hashInput.name = 'orig_hash';
      hashInput.value = origHash;
      form.appendChild(hashInput);

      // Add form values
      const publishedInput = document.createElement('input');
      publishedInput.type = 'hidden';
      publishedInput.name = 'published';
      publishedInput.value = values.published.toString();
      form.appendChild(publishedInput);

      const publishedStartDateEnabledInput = document.createElement('input');
      publishedStartDateEnabledInput.type = 'hidden';
      publishedStartDateEnabledInput.name = 'publishedStartDateEnabled';
      publishedStartDateEnabledInput.value = values.publishedStartDateEnabled.toString();
      form.appendChild(publishedStartDateEnabledInput);

      if (values.publishedStartDate) {
        const publishedStartDateInput = document.createElement('input');
        publishedStartDateInput.type = 'hidden';
        publishedStartDateInput.name = 'publishedStartDate';
        publishedStartDateInput.value = values.publishedStartDate;
        form.appendChild(publishedStartDateInput);
      }

      if (values.publishedEndDate) {
        const publishedEndDateInput = document.createElement('input');
        publishedEndDateInput.type = 'hidden';
        publishedEndDateInput.name = 'publishedEndDate';
        publishedEndDateInput.value = values.publishedEndDate;
        form.appendChild(publishedEndDateInput);
      }

      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while saving');
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    reset();
  };

  // If we have allowAccess rules, show a message and disable editing
  if (hasAllowAccessRules) {
    return (
      <div class="card mb-4">
        <div class="card-header bg-primary text-white">
          <h2 class="h4 mb-0">Access Control</h2>
        </div>
        <div class="card-body">
          <Alert variant="info">
            <strong>Legacy Access Control Detected</strong>
            <br />
            This course instance is using the legacy <code>allowAccess</code> system for access
            control. To use the new access control system, you must first remove all{' '}
            <code>allowAccess</code> rules from the <code>infoCourseInstance.json</code> file.
            <br />
            <br />
            <strong>Note:</strong> You cannot use both <code>allowAccess</code> and{' '}
            <code>accessControl</code>
            systems simultaneously.
          </Alert>
          <p class="text-muted">
            Edit the course instance configuration file to migrate to the new access control system.
          </p>
        </div>
      </div>
    );
  }

  // Determine current status
  const isPublished = courseInstance.access_control_published ?? true;
  const hasEndDate = courseInstance.access_control_published_end_date !== null;
  const hasStartDate = courseInstance.access_control_published_start_date !== null;
  const isArchived =
    hasEndDate && new Date(courseInstance.access_control_published_end_date) < new Date();
  const isScheduled =
    hasStartDate && new Date(courseInstance.access_control_published_start_date) > new Date();

  let currentStatus = 'Published';
  if (isArchived) {
    currentStatus = 'Archived';
  } else if (!isPublished) {
    currentStatus = 'Unpublished';
  } else if (isScheduled) {
    currentStatus = 'Scheduled';
  }

  const submitForm = (
    publishedValue: boolean,
    endDate?: string,
    startDateEnabled?: boolean,
    startDate?: string,
  ) => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.style.display = 'none';

    const csrfInput = document.createElement('input');
    csrfInput.type = 'hidden';
    csrfInput.name = '__csrf_token';
    csrfInput.value = csrfToken;
    form.appendChild(csrfInput);

    const actionInput = document.createElement('input');
    actionInput.type = 'hidden';
    actionInput.name = '__action';
    actionInput.value = 'update_access_control';
    form.appendChild(actionInput);

    const hashInput = document.createElement('input');
    hashInput.type = 'hidden';
    hashInput.name = 'orig_hash';
    hashInput.value = origHash;
    form.appendChild(hashInput);

    const publishedInput = document.createElement('input');
    publishedInput.type = 'hidden';
    publishedInput.name = 'published';
    publishedInput.value = publishedValue.toString();
    form.appendChild(publishedInput);

    const publishedStartDateEnabledInput = document.createElement('input');
    publishedStartDateEnabledInput.type = 'hidden';
    publishedStartDateEnabledInput.name = 'publishedStartDateEnabled';
    publishedStartDateEnabledInput.value = (startDateEnabled ?? false).toString();
    form.appendChild(publishedStartDateEnabledInput);

    if (startDate) {
      const publishedStartDateInput = document.createElement('input');
      publishedStartDateInput.type = 'hidden';
      publishedStartDateInput.name = 'publishedStartDate';
      publishedStartDateInput.value = startDate;
      form.appendChild(publishedStartDateInput);
    }

    if (endDate) {
      const publishedEndDateInput = document.createElement('input');
      publishedEndDateInput.type = 'hidden';
      publishedEndDateInput.name = 'publishedEndDate';
      publishedEndDateInput.value = endDate;
      form.appendChild(publishedEndDateInput);
    }

    document.body.appendChild(form);
    form.submit();
  };

  return (
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">
        <h2 class="h4 mb-0">Access Control</h2>
      </div>
      <div class="card-body">
        {error && (
          <Alert variant="danger" dismissible onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Current Status Header */}
          <div class="d-flex align-items-center justify-content-between mb-4">
            <h3 class="h5 mb-0">Current Status: {currentStatus}</h3>
            <div class="d-flex gap-2">
              {currentStatus === 'Published' && canEdit && (
                <>
                  <Button
                    type="button"
                    variant="outline-danger"
                    size="sm"
                    onClick={() => submitForm(false, defaultValues.publishedEndDate)}
                  >
                    Unpublish
                  </Button>
                  <Button
                    type="button"
                    variant="outline-danger"
                    size="sm"
                    onClick={() => {
                      const now = new Date();
                      const nowString = now.toISOString().slice(0, 16);
                      submitForm(
                        true,
                        nowString,
                        defaultValues.publishedStartDateEnabled,
                        defaultValues.publishedStartDate,
                      );
                    }}
                  >
                    Archive Now
                  </Button>
                </>
              )}
              {currentStatus === 'Unpublished' && canEdit && (
                <Button
                  type="button"
                  variant="outline-primary"
                  size="sm"
                  onClick={() => {
                    const oneYearFromNow = new Date();
                    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
                    const endDateString = oneYearFromNow.toISOString().slice(0, 16);
                    submitForm(true, endDateString, false);
                  }}
                >
                  Publish Now
                </Button>
              )}
              {currentStatus === 'Archived' && canEdit && (
                <Button
                  type="button"
                  variant="outline-primary"
                  size="sm"
                  onClick={() => {
                    const oneWeekFromNow = new Date();
                    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
                    const endDateString = oneWeekFromNow.toISOString().slice(0, 16);
                    submitForm(
                      true,
                      endDateString,
                      defaultValues.publishedStartDateEnabled,
                      defaultValues.publishedStartDate,
                    );
                  }}
                >
                  Extend
                </Button>
              )}
            </div>
          </div>

          {/* Status Information */}
          {currentStatus === 'Archived' && hasEndDate && (
            <p class="text-muted mb-3">
              Course was archived on{' '}
              {new Date(courseInstance.access_control_published_end_date).toLocaleDateString()}.
            </p>
          )}

          {/* Archive Date Section */}
          {currentStatus === 'Published' && (
            <div class="mb-4">
              <label class="form-label fw-bold">Archive Date</label>
              <div class="input-group date-picker">
                <input
                  class={clsx('form-control date-picker', errors.publishedEndDate && 'is-invalid')}
                  type="datetime-local"
                  id="publishedEndDate"
                  disabled={!canEdit}
                  {...register('publishedEndDate')}
                />
                <span class="input-group-text date-picker">{timezone}</span>
              </div>
              {errors.publishedEndDate && (
                <div class="invalid-feedback">{errors.publishedEndDate.message}</div>
              )}
              {defaultValues.publishedEndDate && (
                <p class="text-muted mt-2 mb-0">
                  Course will be archived on{' '}
                  {new Date(defaultValues.publishedEndDate).toLocaleDateString()}.
                </p>
              )}
            </div>
          )}

          {/* Schedule Publish Section */}
          {currentStatus === 'Unpublished' && (
            <div class="mb-4">
              <div class="form-check mb-3">
                <input
                  class="form-check-input"
                  type="checkbox"
                  id="publishedStartDateEnabled"
                  disabled={!canEdit}
                  {...register('publishedStartDateEnabled')}
                />
                <label class="form-check-label fw-bold" for="publishedStartDateEnabled">
                  Schedule publish for
                </label>
              </div>

              {publishedStartDateEnabled && (
                <div class="input-group date-picker">
                  <input
                    class={clsx(
                      'form-control date-picker',
                      errors.publishedStartDate && 'is-invalid',
                    )}
                    type="datetime-local"
                    id="publishedStartDate"
                    disabled={!canEdit}
                    {...register('publishedStartDate')}
                  />
                  <span class="input-group-text date-picker">{timezone}</span>
                </div>
              )}
              {errors.publishedStartDate && (
                <div class="invalid-feedback">{errors.publishedStartDate.message}</div>
              )}
              {publishedStartDateEnabled && defaultValues.publishedStartDate && (
                <p class="text-muted mt-2 mb-0">
                  Course will be published on{' '}
                  {new Date(defaultValues.publishedStartDate).toLocaleDateString()}.
                </p>
              )}
            </div>
          )}

          {/* Advanced Settings */}
          {canEdit && (
            <div class="mt-4">
              <details>
                <summary class="btn btn-link p-0 text-decoration-none">Advanced Settings</summary>
                <div class="mt-3">
                  <div class="form-check mb-3">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      id="published"
                      disabled={!canEdit}
                      {...register('published')}
                    />
                    <label class="form-check-label" for="published">
                      Course instance is published
                    </label>
                    <div class="small text-muted">
                      If unchecked, enrolled students will not be able to access the course
                      instance, and unenrolled students will not be able to enroll.
                    </div>
                  </div>

                  <div class="form-check mb-3">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      id="publishedStartDateEnabled"
                      disabled={!canEdit}
                      {...register('publishedStartDateEnabled')}
                    />
                    <label class="form-check-label" for="publishedStartDateEnabled">
                      Enable published start date
                    </label>
                    <div class="small text-muted">
                      If enabled, the course instance will only be available after the published
                      start date.
                    </div>
                  </div>

                  {publishedStartDateEnabled && (
                    <div class="mb-3">
                      <label class="form-label" for="publishedStartDate">
                        Published start date
                      </label>
                      <div class="input-group date-picker">
                        <input
                          class={clsx(
                            'form-control date-picker',
                            errors.publishedStartDate && 'is-invalid',
                          )}
                          type="datetime-local"
                          id="publishedStartDate"
                          disabled={!canEdit}
                          {...register('publishedStartDate')}
                        />
                        <span class="input-group-text date-picker">{timezone}</span>
                      </div>
                      {errors.publishedStartDate && (
                        <div class="invalid-feedback">{errors.publishedStartDate.message}</div>
                      )}
                      <small class="form-text text-muted">
                        The date and time when the course instance becomes available to students.
                      </small>
                    </div>
                  )}

                  <div class="mb-3">
                    <label class="form-label" for="publishedEndDate">
                      Published end date
                    </label>
                    <div class="input-group date-picker">
                      <input
                        class={clsx(
                          'form-control date-picker',
                          errors.publishedEndDate && 'is-invalid',
                        )}
                        type="datetime-local"
                        id="publishedEndDate"
                        disabled={!canEdit}
                        {...register('publishedEndDate')}
                      />
                      <span class="input-group-text date-picker">{timezone}</span>
                    </div>
                    {errors.publishedEndDate && (
                      <div class="invalid-feedback">{errors.publishedEndDate.message}</div>
                    )}
                    <small class="form-text text-muted">
                      The date and time when the course instance is archived and becomes unavailable
                      to students.
                      {published && ' Required when course is published.'}
                    </small>
                  </div>

                  <div class="d-flex gap-2">
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={!isDirty || !isValid || isSubmitting}
                    >
                      {isSubmitting ? 'Saving...' : 'Save'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleCancel}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </details>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
