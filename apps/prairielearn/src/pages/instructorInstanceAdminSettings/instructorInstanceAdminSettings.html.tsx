import { Temporal } from '@js-temporal/polyfill';
import clsx from 'clsx';
import { Form } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { GitHubButton } from '../../components/GitHubButton.js';
import { PublicLinkSharing } from '../../components/LinkSharing.js';
import type { NavPage } from '../../components/Navbar.types.js';
import type { StaffCourseInstanceContext } from '../../lib/client/page-context.js';
import { type Timezone, formatTimezone } from '../../lib/timezone.shared.js';
import { encodePathNoNormalize } from '../../lib/uri-util.shared.js';

import { SelfEnrollmentSettings } from './components/SelfEnrollmentSettings.js';
import type { SettingsFormValues } from './instructorInstanceAdminSettings.types.js';

export function InstructorInstanceAdminSettings({
  csrfToken,
  urlPrefix,
  navPage,
  hasEnhancedNavigation,
  canEdit,
  courseInstance,
  shortNames,
  availableTimezones,
  origHash,
  instanceGHLink,
  studentLink,
  publicLink,
  selfEnrollLink,
  enrollmentManagementEnabled,
  infoCourseInstancePath,
}: {
  csrfToken: string;
  urlPrefix: string;
  navPage: NavPage;
  hasEnhancedNavigation: boolean;
  canEdit: boolean;
  courseInstance: StaffCourseInstanceContext['course_instance'];
  shortNames: string[];
  availableTimezones: Timezone[];
  origHash: string;
  instanceGHLink: string | undefined | null;
  studentLink: string;
  publicLink: string;
  selfEnrollLink: string;
  enrollmentManagementEnabled: boolean;
  infoCourseInstancePath: string;
}) {
  const defaultValues: SettingsFormValues = {
    ciid: courseInstance.short_name,
    long_name: courseInstance.long_name ?? '',
    display_timezone: courseInstance.display_timezone,
    group_assessments_by: courseInstance.assessments_group_by,
    show_in_enroll_page:
      courseInstance.hide_in_enroll_page == null ? true : !courseInstance.hide_in_enroll_page,
    self_enrollment_enabled: courseInstance.self_enrollment_enabled,
    self_enrollment_use_enrollment_code: courseInstance.self_enrollment_use_enrollment_code,
    self_enrollment_enabled_before_date_enabled:
      courseInstance.self_enrollment_enabled_before_date_enabled,
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
    formState: { isDirty, errors, isValid },
  } = useForm<SettingsFormValues>({
    mode: 'onChange',
    defaultValues,
  });

  console.log('errors', errors, isValid, isDirty, '!isDirty || !isValid', !isDirty || !isValid);

  return (
    <div class="card mb-4">
      <div class="card-header bg-primary text-white d-flex align-items-center justify-content-between">
        <h1>
          {hasEnhancedNavigation ? 'General course instance settings' : 'Course instance settings'}
        </h1>
        <GitHubButton gitHubLink={instanceGHLink ?? null} />
      </div>
      <div class="card-body">
        <form method="POST" name="edit-course-instance-settings-form">
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <input type="hidden" name="orig_hash" value={origHash} />
          <div class="mb-3">
            <label class="form-label" for="ciid">
              CIID
            </label>
            <input
              type="text"
              class={clsx('form-control font-monospace', errors.ciid && 'is-invalid')}
              id="ciid"
              aria-invalid={errors.ciid ? 'true' : 'false'}
              pattern="[\-A-Za-z0-9_\/]+"
              disabled={!canEdit}
              required
              {...register('ciid', {
                required: 'CIID is required',
                pattern: /^[-A-Za-z0-9_/]+$/,
                validate: {
                  duplicate: (value) => {
                    if (shortNames.includes(value) && value !== defaultValues.ciid) {
                      return 'This ID is already in use';
                    }
                    return true;
                  },
                },
              })}
            />
            {errors.ciid?.type !== 'pattern' && (
              <div class="invalid-feedback">{errors.ciid?.message}</div>
            )}
            <small class="form-text text-muted">
              <span class={clsx(errors.ciid && errors.ciid.type === 'pattern' && 'text-danger')}>
                Use only letters, numbers, dashes, and underscores, with no spaces.
              </span>{' '}
              You may use forward slashes to separate directories. The recommended format is{' '}
              <code>Fa19</code> or <code>Fall2019</code>. Add suffixes if there are multiple
              versions, like <code>Fa19honors</code>.
            </small>
          </div>
          <div class="mb-3">
            <label class="form-label" for="long_name">
              Long Name
            </label>
            <input
              type="text"
              class="form-control"
              id="long_name"
              disabled={!canEdit}
              required
              {...register('long_name')}
              name="long_name"
            />
            <small class="form-text text-muted">
              The long name of this course instance (e.g., 'Spring 2015').
            </small>
          </div>
          <div class="mb-3">
            <label class="form-label" for="display_timezone">
              Timezone
            </label>
            <Form.Select
              id="display_timezone"
              disabled={!canEdit}
              {...register('display_timezone')}
              name="display_timezone"
            >
              {availableTimezones.map((tz) => (
                <option
                  key={tz.name}
                  value={tz.name}
                  selected={tz.name === defaultValues.display_timezone}
                >
                  {formatTimezone(tz)}
                </option>
              ))}
            </Form.Select>
            <small class="form-text text-muted">
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
          <div class="mb-3">
            <label class="form-label" for="group_assessments_by">
              Group assessments by
            </label>
            <Form.Select
              id="group_assessments_by"
              disabled={!canEdit}
              {...register('group_assessments_by')}
              name="group_assessments_by"
            >
              <option value="Set" selected={defaultValues.group_assessments_by === 'Set'}>
                Set
              </option>
              <option value="Module" selected={defaultValues.group_assessments_by === 'Module'}>
                Module
              </option>
            </Form.Select>
            <small class="form-text text-muted">
              Determines how assessments will be grouped on the student assessments page.
            </small>
          </div>

          <SelfEnrollmentSettings
            canEdit={canEdit}
            control={control}
            enrollmentManagementEnabled={enrollmentManagementEnabled}
            studentLink={studentLink}
            selfEnrollLink={selfEnrollLink}
            csrfToken={csrfToken}
          />

          <h2 class="h4">Sharing</h2>
          {courseInstance.share_source_publicly ? (
            <PublicLinkSharing
              publicLink={publicLink}
              sharingMessage={"This course instance's source is publicly shared."}
              publicLinkMessage="The link that other instructors can use to view this course instance."
            />
          ) : (
            <p>This course instance is not being shared.</p>
          )}

          {canEdit ? (
            <>
              <button
                id="save-button"
                type="submit"
                class="btn btn-primary mb-2"
                name="__action"
                value="update_configuration"
                disabled={!isDirty || !isValid}
              >
                Save
              </button>
              <button
                id="cancel-button"
                type="button"
                class="btn btn-secondary mb-2 ms-2"
                onClick={() => reset()}
              >
                Cancel
              </button>
              <p class="mb-0">
                <a
                  data-testid="edit-course-instance-configuration-link"
                  href={encodePathNoNormalize(
                    `${urlPrefix}/${navPage}/file_edit/${infoCourseInstancePath}`,
                  )}
                >
                  Edit course instance configuration
                </a>{' '}
                in <code>infoCourseInstance.json</code>
              </p>
            </>
          ) : (
            <p class="mb-0">
              <a href={`${urlPrefix}/${navPage}/file_view/${infoCourseInstancePath}`}>
                View course instance configuration
              </a>{' '}
              in <code>infoCourseInstance.json</code>
            </p>
          )}
        </form>
      </div>
      <div class="card-footer d-flex flex-wrap align-items-center">
        <form name="copy-course-instance-form" class="me-2" method="POST">
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <button
            type="submit"
            name="__action"
            value="copy_course_instance"
            class="btn btn-sm btn-primary"
          >
            <i class="fa fa-clone" /> Make a copy of this course instance
          </button>
        </form>
        <button
          type="button"
          class="btn btn-sm btn-primary"
          data-bs-toggle="modal"
          data-bs-target="#deleteCourseInstanceModal"
        >
          <i class="fa fa-times" aria-hidden="true" /> Delete this course instance
        </button>
      </div>
    </div>
  );
}
InstructorInstanceAdminSettings.displayName = 'InstructorInstanceAdminSettings';
