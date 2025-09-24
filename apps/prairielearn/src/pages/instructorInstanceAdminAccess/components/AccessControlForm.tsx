import clsx from 'clsx';
import { useState } from 'preact/compat';
import { useForm } from 'react-hook-form';

import type { CourseInstance, CourseInstanceAccessRule } from '../../../lib/db-types.js';

interface AccessControlFormValues {
  published: boolean;
  publishedStartDateEnabled: boolean;
  publishedStartDate: string;
  publishedEndDate: string;
}

interface AccessControlFormProps {
  courseInstance: CourseInstance;
  accessRules: CourseInstanceAccessRule[];
  canEdit: boolean;
  csrfToken: string;
  timeZone: string;
  origHash: string;
}

export function AccessControlForm({
  courseInstance,
  accessRules,
  canEdit,
  csrfToken,
  timeZone,
  origHash,
}: AccessControlFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if legacy allowAccess rules exist
  const hasLegacyAccessRules = accessRules.length > 0;

  // Check if new access control is configured
  const hasNewAccessControl =
    courseInstance.access_control_published !== null ||
    courseInstance.access_control_published_start_date_enabled !== null ||
    courseInstance.access_control_published_start_date !== null ||
    courseInstance.access_control_published_end_date !== null;

  const defaultValues: AccessControlFormValues = {
    published: courseInstance.access_control_published ?? true,
    publishedStartDateEnabled: courseInstance.access_control_published_start_date_enabled ?? false,
    publishedStartDate: courseInstance.access_control_published_start_date
      ? new Date(courseInstance.access_control_published_start_date).toISOString().slice(0, 16)
      : '',
    publishedEndDate: courseInstance.access_control_published_end_date
      ? new Date(courseInstance.access_control_published_end_date).toISOString().slice(0, 16)
      : '',
  };

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
  } = useForm<AccessControlFormValues>({
    mode: 'onChange',
    defaultValues,
  });

  const publishedStartDateEnabled = watch('publishedStartDateEnabled');

  const onSubmit = async (data: AccessControlFormValues) => {
    if (!canEdit) return;

    setIsSubmitting(true);
    try {
      const requestBody = {
        __csrf_token: csrfToken,
        __action: 'update_access_control',
        published: data.published,
        publishedStartDateEnabled: data.publishedStartDateEnabled,
        publishedStartDate: data.publishedStartDate || null,
        publishedEndDate: data.publishedEndDate || null,
        orig_hash: origHash,
      };

      const response = await fetch(window.location.pathname, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        window.location.reload();
      } else {
        throw new Error('Failed to update access control');
      }
    } catch (error) {
      console.error('Error updating access control:', error);
      // eslint-disable-next-line no-alert
      alert('Failed to update access control. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show warning if both systems are configured
  const showConflictWarning = hasLegacyAccessRules && hasNewAccessControl;

  return (
    <div class="card mb-4">
      <div class="card-header bg-primary text-white d-flex align-items-center">
        <h1>Access Control Settings</h1>
      </div>
      <div class="card-body">
        {showConflictWarning && (
          <div class="alert alert-warning" role="alert">
            <strong>Configuration Conflict:</strong> Both legacy allowAccess rules and new access
            control settings are configured. Only one system can be active at a time. Please choose
            which system to use.
          </div>
        )}

        {hasLegacyAccessRules && !hasNewAccessControl && (
          <div class="alert alert-info" role="alert">
            <strong>Legacy Access Rules Active:</strong> This course instance is using the legacy
            allowAccess system. To use the new access control system, you must first remove all
            allowAccess rules from the course configuration.
          </div>
        )}

        {!hasLegacyAccessRules && hasNewAccessControl && (
          <div class="alert alert-info" role="alert">
            <strong>New Access Control Active:</strong> This course instance is using the new access
            control system. Legacy allowAccess rules cannot be used when the new system is
            configured.
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <input type="hidden" name="__csrf_token" value={csrfToken} />

          <div class="mb-3">
            <div class="form-check">
              <input
                class="form-check-input"
                type="checkbox"
                id="published"
                disabled={!canEdit || hasLegacyAccessRules}
                {...register('published')}
              />
              <label class="form-check-label" for="published">
                <strong>Published</strong>
                <div class="form-text">
                  If unchecked, enrolled students will not be able to access the course instance,
                  and unenrolled students will not be able to enroll.
                </div>
              </label>
            </div>
            {hasLegacyAccessRules && (
              <div class="form-text text-muted">
                <em>Cannot be edited while legacy allowAccess rules are active.</em>
              </div>
            )}
          </div>

          <div class="mb-3">
            <div class="form-check">
              <input
                class="form-check-input"
                type="checkbox"
                id="publishedStartDateEnabled"
                disabled={!canEdit || hasLegacyAccessRules}
                {...register('publishedStartDateEnabled')}
              />
              <label class="form-check-label" for="publishedStartDateEnabled">
                <strong>Enable Start Date</strong>
                <div class="form-text">
                  If enabled, the course instance will not be accessible before the start date.
                </div>
              </label>
            </div>
            {hasLegacyAccessRules && (
              <div class="form-text text-muted">
                <em>Cannot be edited while legacy allowAccess rules are active.</em>
              </div>
            )}
          </div>

          {publishedStartDateEnabled && (
            <div class="mb-3">
              <label class="form-label" for="publishedStartDate">
                <strong>Start Date</strong>
              </label>
              <input
                type="datetime-local"
                class={clsx('form-control', errors.publishedStartDate && 'is-invalid')}
                id="publishedStartDate"
                disabled={!canEdit || hasLegacyAccessRules}
                {...register('publishedStartDate', {
                  required: publishedStartDateEnabled
                    ? 'Start date is required when enabled'
                    : false,
                })}
              />
              {errors.publishedStartDate && (
                <div class="invalid-feedback">{errors.publishedStartDate.message}</div>
              )}
              <div class="form-text">
                Course instance will be published at this date and time ({timeZone}).
              </div>
            </div>
          )}

          <div class="mb-3">
            <label class="form-label" for="publishedEndDate">
              <strong>End Date</strong>
            </label>
            <input
              type="datetime-local"
              class={clsx('form-control', errors.publishedEndDate && 'is-invalid')}
              id="publishedEndDate"
              disabled={!canEdit || hasLegacyAccessRules}
              {...register('publishedEndDate')}
            />
            {errors.publishedEndDate && (
              <div class="invalid-feedback">{errors.publishedEndDate.message}</div>
            )}
            <div class="form-text">
              Course instance will be archived at this date and time ({timeZone}). Leave empty for
              no end date.
            </div>
          </div>

          {canEdit && !hasLegacyAccessRules && (
            <div class="d-flex gap-2">
              <button type="submit" class="btn btn-primary" disabled={!isDirty || isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                class="btn btn-secondary"
                disabled={isSubmitting}
                onClick={() => window.location.reload()}
              >
                Cancel
              </button>
            </div>
          )}

          {!canEdit && (
            <div class="alert alert-info" role="alert">
              You do not have permission to edit access control settings.
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
