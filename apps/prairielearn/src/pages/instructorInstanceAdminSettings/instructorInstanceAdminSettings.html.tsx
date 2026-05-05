import { Temporal } from '@js-temporal/polyfill';
import { QueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { StickySaveBar } from '@prairielearn/ui';

import { GitHubButton } from '../../components/GitHubButton.js';
import { PublicLinkSharing } from '../../components/LinkSharing.js';
import { CourseInstanceShortNameDescription } from '../../components/ShortNameDescriptions.js';
import type { PageContext } from '../../lib/client/page-context.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import { validateShortName } from '../../lib/short-name.js';
import { type Timezone, formatTimezone } from '../../lib/timezone.shared.js';
import { createCourseInstanceTrpcClient } from '../../trpc/courseInstance/client.js';
import { TRPCProvider } from '../../trpc/courseInstance/context.js';

import { CopyCourseInstanceModal } from './components/CopyCourseInstanceModal.js';
import { SelfEnrollmentSettings } from './components/SelfEnrollmentSettings.js';
import type { SettingsFormValues } from './instructorInstanceAdminSettings.types.js';

export function InstructorInstanceAdminSettings({
  csrfToken,
  trpcCsrfToken,
  canEdit,
  course,
  courseInstance,
  institution,
  names,
  availableTimezones,
  origHash,
  instanceGHLink,
  studentLink,
  publicLink,
  selfEnrollLink,
  isDevMode,
  isAdministrator,
  enhancedAccessControlEnabled,
}: {
  csrfToken: string;
  trpcCsrfToken: string;
  canEdit: boolean;
  course: PageContext<'courseInstance', 'instructor'>['course'];
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  institution: PageContext<'courseInstance', 'instructor'>['institution'];
  names: { short_name: string; long_name: string | null }[];
  availableTimezones: Timezone[];
  origHash: string;
  instanceGHLink: string | undefined | null;
  studentLink: string;
  publicLink: string;
  selfEnrollLink: string;
  isDevMode: boolean;
  isAdministrator: boolean;
  enhancedAccessControlEnabled: boolean;
}) {
  const [queryClient] = useState(() => new QueryClient());

  const [showCopyModal, setShowCopyModal] = useState(false);

  const [trpcClient] = useState(() =>
    createCourseInstanceTrpcClient({
      csrfToken: trpcCsrfToken,
      courseInstanceId: courseInstance.id,
    }),
  );

  const shortNames = new Set(names.map((name) => name.short_name));

  const defaultValues: SettingsFormValues = {
    ciid: courseInstance.short_name,
    long_name: courseInstance.long_name ?? '',
    display_timezone: courseInstance.display_timezone,
    group_assessments_by: courseInstance.assessments_group_by,
    self_enrollment_enabled: courseInstance.self_enrollment_enabled,
    self_enrollment_use_enrollment_code: courseInstance.self_enrollment_use_enrollment_code,
    self_enrollment_restrict_to_institution: courseInstance.self_enrollment_restrict_to_institution,
    self_enrollment_enabled_before_date_enabled:
      !!courseInstance.self_enrollment_enabled_before_date,
    self_enrollment_enabled_before_date: courseInstance.self_enrollment_enabled_before_date
      ? Temporal.Instant.fromEpochMilliseconds(
          courseInstance.self_enrollment_enabled_before_date.getTime(),
        )
          .toZonedDateTimeISO(courseInstance.display_timezone)
          .toPlainDateTime()
          .toString()
      : '',
  };

  const {
    register,
    reset,
    control,
    trigger,
    formState: { isDirty, errors, isValid, isSubmitting },
  } = useForm<SettingsFormValues>({
    mode: 'onChange',
    defaultValues,
  });

  return (
    <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
      <form
        method="POST"
        name="edit-course-instance-settings-form"
        onSubmit={async (e) => {
          if (!isValid) {
            await trigger();
            e.preventDefault();
            return;
          }
        }}
      >
        <input type="hidden" name="__csrf_token" value={csrfToken} />
        <input type="hidden" name="orig_hash" value={origHash} />
        <input type="hidden" name="__action" value="update_configuration" />

        <div className="container d-flex flex-column gap-3 py-3">
          <div className="card">
            <div className="card-body">
              <h2 className="h5 card-title mb-3">General</h2>
              <div className="mb-3">
                <label className="form-label" htmlFor="ciid">
                  Short name
                </label>
                <input
                  type="text"
                  className={clsx('form-control font-monospace', errors.ciid && 'is-invalid')}
                  id="ciid"
                  aria-invalid={errors.ciid ? 'true' : 'false'}
                  {...(errors.ciid ? { 'aria-errormessage': 'ciid-error' } : {})}
                  disabled={!canEdit}
                  defaultValue={defaultValues.ciid}
                  required
                  {...register('ciid', {
                    required: 'Short name is required',
                    validate: {
                      shortName: (value) => {
                        const result = validateShortName(value, defaultValues.ciid);
                        return result.valid || result.message;
                      },
                      duplicate: (value) => {
                        if (shortNames.has(value) && value !== defaultValues.ciid) {
                          return 'This ID is already in use';
                        }
                        return true;
                      },
                    },
                  })}
                />
                {errors.ciid && (
                  <div id="ciid-error" className="invalid-feedback">
                    {errors.ciid.message}
                  </div>
                )}
                <small className="form-text text-muted">
                  <CourseInstanceShortNameDescription />
                </small>
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="long_name">
                  Long name
                </label>
                <input
                  type="text"
                  className="form-control"
                  id="long_name"
                  disabled={!canEdit}
                  aria-describedby="long_name-help"
                  defaultValue={defaultValues.long_name}
                  required
                  {...register('long_name')}
                  name="long_name"
                />
                <small id="long_name-help" className="form-text text-muted">
                  The long name of this course instance (e.g., 'Spring 2015').
                </small>
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="display_timezone">
                  Timezone
                </label>
                <Form.Select
                  id="display_timezone"
                  aria-describedby="display_timezone-help"
                  disabled={!canEdit}
                  defaultValue={defaultValues.display_timezone}
                  {...register('display_timezone')}
                  name="display_timezone"
                >
                  {availableTimezones.map((tz) => (
                    <option key={tz.name} value={tz.name}>
                      {formatTimezone(tz)}
                    </option>
                  ))}
                </Form.Select>
                <small id="display_timezone-help" className="form-text text-muted">
                  The allowable timezones are from the{' '}
                  <a
                    href="https://en.wikipedia.org/wiki/List_of_tz_database_time_zones"
                    target="_blank"
                    rel="noreferrer"
                  >
                    tz database
                  </a>
                  . It's best to use a city-based timezone that has the same times as you.
                </small>
              </div>
              <div>
                <label className="form-label" htmlFor="group_assessments_by">
                  Group assessments by
                </label>
                <Form.Select
                  id="group_assessments_by"
                  aria-describedby="group_assessments_by-help"
                  disabled={!canEdit}
                  defaultValue={defaultValues.group_assessments_by}
                  {...register('group_assessments_by')}
                  name="group_assessments_by"
                >
                  <option value="Set">Set</option>
                  <option value="Module">Module</option>
                </Form.Select>
                <small id="group_assessments_by-help" className="form-text text-muted">
                  Determines how assessments will be grouped on the student assessments page.
                </small>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h2 className="h5 card-title mb-3">Self-enrollment</h2>
              <SelfEnrollmentSettings
                canEdit={canEdit}
                hasModernPublishing={courseInstance.modern_publishing}
                control={control}
                trigger={trigger}
                studentLink={studentLink}
                selfEnrollLink={selfEnrollLink}
                enrollmentCode={courseInstance.enrollment_code}
                csrfToken={csrfToken}
                institution={institution}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h2 className="h5 card-title mb-3">Sharing</h2>
              {courseInstance.share_source_publicly ? (
                <PublicLinkSharing
                  publicLink={publicLink}
                  sharingMessage="This course instance's source is publicly shared."
                  publicLinkMessage="The link that other instructors can use to view this course instance."
                />
              ) : (
                <p className="form-text text-muted mb-0">
                  This course instance is not being shared.
                </p>
              )}
            </div>
          </div>

          {(instanceGHLink || canEdit) && (
            <div className="card">
              <div className="card-body">
                <h2 className="h5 card-title mb-3">Manage course instance</h2>
                <div className="d-flex flex-column gap-3">
                  {instanceGHLink && (
                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
                      <div>
                        <div className="fw-semibold">View source on GitHub</div>
                        <div className="small text-muted">
                          Open this course instance's source files in the course's repository.
                        </div>
                      </div>
                      <GitHubButton gitHubLink={instanceGHLink} variant="outline-secondary" />
                    </div>
                  )}
                  {canEdit && (
                    <>
                      <div
                        className={clsx(
                          'd-flex flex-wrap align-items-center justify-content-between gap-3',
                          instanceGHLink && 'border-top pt-3',
                        )}
                      >
                        <div>
                          <div className="fw-semibold">Make a copy of this course instance</div>
                          <div className="small text-muted">
                            Create a duplicate of this course instance to use as a starting point.
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline-primary"
                          onClick={() => setShowCopyModal(true)}
                        >
                          <i className="bi bi-copy me-1" aria-hidden="true" />
                          Make a copy
                        </Button>
                      </div>
                      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 border-top pt-3">
                        <div>
                          <div className="fw-semibold">Delete this course instance</div>
                          <div className="small text-muted">
                            Permanently remove this course instance and all associated student data.
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline-danger"
                          data-bs-toggle="modal"
                          data-bs-target="#deleteCourseInstanceModal"
                        >
                          <i className="bi bi-trash me-1" aria-hidden="true" />
                          Delete
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {canEdit && (
          <StickySaveBar visible={isDirty} isSaving={isSubmitting} onCancel={() => reset()} />
        )}

        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <CopyCourseInstanceModal
            show={showCopyModal}
            csrfToken={csrfToken}
            courseShortName={course.short_name}
            courseInstance={courseInstance}
            isAdministrator={isAdministrator}
            enhancedAccessControlEnabled={enhancedAccessControlEnabled}
            onHide={() => setShowCopyModal(false)}
          />
        </TRPCProvider>
      </form>
    </QueryClientProviderDebug>
  );
}

InstructorInstanceAdminSettings.displayName = 'InstructorInstanceAdminSettings';
