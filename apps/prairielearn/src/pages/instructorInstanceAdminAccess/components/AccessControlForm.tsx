import { Temporal } from '@js-temporal/polyfill';
import clsx from 'clsx';
import { useState } from 'preact/compat';
import { useForm } from 'react-hook-form';

import type {
  CourseInstance,
  CourseInstanceAccessControlExtension,
} from '../../../lib/db-types.js';

import { AccessControlOverrides } from './AccessControlOverrides.js';

interface AccessControlFormValues {
  published: boolean;
  publishedStartDateEnabled: boolean;
  publishedStartDate: string;
  publishedEndDate: string;
}

interface AccessControlFormProps {
  courseInstance: CourseInstance;
  hasAccessRules: boolean;
  canEdit: boolean;
  csrfToken: string;
  origHash: string;
  accessControlExtensions: CourseInstanceAccessControlExtension[];
}

export function AccessControlForm({
  courseInstance,
  hasAccessRules,
  canEdit,
  csrfToken,
  origHash,
  accessControlExtensions,
}: AccessControlFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [newArchiveDate, setNewArchiveDate] = useState('');

  // Check if legacy allowAccess rules exist
  const hasLegacyAccessRules = hasAccessRules;

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
      ? Temporal.Instant.fromEpochMilliseconds(
          courseInstance.access_control_published_start_date.getTime(),
        )
          .toZonedDateTimeISO(courseInstance.display_timezone)
          .toPlainDateTime()
          .toString()
      : '',
    publishedEndDate: courseInstance.access_control_published_end_date
      ? Temporal.Instant.fromEpochMilliseconds(
          courseInstance.access_control_published_end_date.getTime(),
        )
          .toZonedDateTimeISO(courseInstance.display_timezone)
          .toPlainDateTime()
          .toString()
      : '',
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<AccessControlFormValues>({
    mode: 'onChange',
    defaultValues,
  });

  const published = watch('published');
  const publishedStartDateEnabled = watch('publishedStartDateEnabled');
  const publishedStartDate = watch('publishedStartDate');
  const publishedEndDate = watch('publishedEndDate');

  // Determine current state
  const isPublished = published;
  const isArchived = publishedEndDate && new Date(publishedEndDate) <= new Date();
  const isUnpublished = !published;

  const onSubmit = async (data: AccessControlFormValues) => {
    if (!canEdit) return;

    setIsSubmitting(true);
    try {
      const requestBody = {
        __csrf_token: csrfToken,
        __action: 'update_access_control',
        accessControl: {
          published: data.published,
          publishedStartDateEnabled: data.publishedStartDateEnabled,
          publishedStartDate: data.publishedStartDate
            ? Temporal.PlainDateTime.from(data.publishedStartDate).toString()
            : undefined,
          publishedEndDate: data.publishedEndDate
            ? Temporal.PlainDateTime.from(data.publishedEndDate).toString()
            : undefined,
        },
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

  const handleUnpublish = () => {
    setValue('published', false);
    void handleSubmit(onSubmit)();
  };

  const handlePublishNow = () => {
    setValue('published', true);
    void handleSubmit(onSubmit)();
  };

  const handleArchiveNow = () => {
    const now = new Date();
    const isoString = now.toISOString().slice(0, 16);
    setValue('publishedEndDate', isoString);
    void handleSubmit(onSubmit)();
  };

  const handleExtend = () => {
    setShowExtendModal(true);
  };

  const handleExtendSubmit = () => {
    if (newArchiveDate) {
      setValue('publishedEndDate', newArchiveDate);
      void handleSubmit(onSubmit)();
    }
    setShowExtendModal(false);
  };

  const handleQuickExtend = (days: number) => {
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + days);
    const isoString = newDate.toISOString().slice(0, 16);
    setValue('publishedEndDate', isoString);
    void handleSubmit(onSubmit)();
  };

  // Show warning if both systems are configured
  const showConflictWarning = hasLegacyAccessRules && hasNewAccessControl;

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <>
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>Access Control Settings</h1>
        </div>
        <div class="card-body">
          {showConflictWarning && (
            <div class="alert alert-warning" role="alert">
              <strong>Configuration Conflict:</strong> Both legacy allowAccess rules and new access
              control settings are configured. Only one system can be active at a time. Please
              choose which system to use.
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
              <strong>New Access Control Active:</strong> This course instance is using the new
              access control system. Legacy allowAccess rules cannot be used when the new system is
              configured.
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)}>
            <input type="hidden" name="__csrf_token" value={csrfToken} />

            {/* Published State */}
            {isPublished && !isArchived && (
              <div class="mb-4">
                <div class="d-flex justify-content-between align-items-center mb-3">
                  <h5 class="mb-0">
                    Current Status: <span class="text-success">Published</span>
                  </h5>
                  {canEdit && !hasLegacyAccessRules && (
                    <button
                      type="button"
                      class="btn btn-outline-danger"
                      disabled={isSubmitting}
                      onClick={handleUnpublish}
                    >
                      Unpublish
                    </button>
                  )}
                </div>

                <div class="mb-3">
                  <label class="form-label" for="publishedEndDate">
                    <strong>Archive Date</strong>
                  </label>
                  <div class="d-flex gap-2 align-items-center">
                    <input
                      type="datetime-local"
                      class={clsx('form-control', errors.publishedEndDate && 'is-invalid')}
                      id="publishedEndDate"
                      disabled={!canEdit || hasLegacyAccessRules}
                      {...register('publishedEndDate')}
                    />
                    {canEdit && !hasLegacyAccessRules && (
                      <button
                        type="button"
                        class="btn btn-outline-danger"
                        disabled={isSubmitting}
                        onClick={handleArchiveNow}
                      >
                        Archive Now
                      </button>
                    )}
                  </div>
                  {errors.publishedEndDate && (
                    <div class="invalid-feedback">{errors.publishedEndDate.message}</div>
                  )}
                  {publishedEndDate && (
                    <div class="form-text">
                      Course will be archived on {formatDate(publishedEndDate)}.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Unpublished State */}
            {isUnpublished && (
              <div class="mb-4">
                <div class="d-flex justify-content-between align-items-center mb-3">
                  <h5 class="mb-0">
                    Current Status: <span class="text-warning">Unpublished</span>
                  </h5>
                  {canEdit && !hasLegacyAccessRules && (
                    <button
                      type="button"
                      class="btn btn-primary"
                      disabled={isSubmitting}
                      onClick={handlePublishNow}
                    >
                      Publish now
                    </button>
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
                      <strong>Schedule publish for</strong>
                    </label>
                  </div>

                  {publishedStartDateEnabled && (
                    <div class="mt-2">
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
                      {publishedStartDate && (
                        <div class="form-text">
                          Course will be published on {formatDate(publishedStartDate)}.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Archived State */}
            {isArchived && (
              <div class="mb-4">
                <div class="d-flex justify-content-between align-items-center mb-3">
                  <h5 class="mb-0">
                    Current Status: <span class="text-danger">Archived</span>
                  </h5>
                  {canEdit && !hasLegacyAccessRules && (
                    <button
                      type="button"
                      class="btn btn-primary"
                      disabled={isSubmitting}
                      onClick={handleExtend}
                    >
                      Extend
                    </button>
                  )}
                </div>
                <p class="text-muted">Course was archived on {formatDate(publishedEndDate)}.</p>
              </div>
            )}

            {/* Legacy form fields for compatibility */}
            <div class="d-none">
              <input type="checkbox" {...register('published')} />
            </div>

            {canEdit && !hasLegacyAccessRules && isDirty && (
              <div class="d-flex gap-2">
                <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
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

          {/* Access Control Extensions Section */}
          <hr class="my-4" />
          <AccessControlOverrides
            courseInstance={courseInstance}
            overrides={accessControlExtensions}
            canEdit={canEdit}
            csrfToken={csrfToken}
          />
        </div>
      </div>

      {/* Extend Modal */}
      {showExtendModal && (
        <div class="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">When would you like to set the archival date to?</h5>
                <button type="button" class="btn-close" onClick={() => setShowExtendModal(false)} />
              </div>
              <div class="modal-body">
                <div class="mb-3">
                  <label class="form-label" for="customArchiveDate">
                    Custom Date
                  </label>
                  <input
                    type="datetime-local"
                    class="form-control"
                    id="customArchiveDate"
                    value={newArchiveDate}
                    onChange={(e) => setNewArchiveDate((e.target as HTMLInputElement).value)}
                  />
                </div>
                <div class="mb-3">
                  <label class="form-label" for="quickOptions">
                    Quick Options
                  </label>
                  <div class="d-flex gap-2">
                    <button
                      type="button"
                      class="btn btn-outline-primary"
                      onClick={() => handleQuickExtend(7)}
                    >
                      Now + 1 week
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline-primary"
                      onClick={() => handleQuickExtend(30)}
                    >
                      Now + 1 month
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline-primary"
                      onClick={() => handleQuickExtend(90)}
                    >
                      Now + 3 months
                    </button>
                  </div>
                </div>
              </div>
              <div class="modal-footer">
                <button
                  type="button"
                  class="btn btn-secondary"
                  onClick={() => setShowExtendModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="btn btn-success"
                  disabled={!newArchiveDate}
                  onClick={handleExtendSubmit}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

AccessControlForm.displayName = 'AccessControlForm';
