import { useMemo, useState } from 'preact/compat';
import { Button, Form, InputGroup, Modal, OverlayTrigger, Tooltip } from 'react-bootstrap';

import { PageLayout } from '../../components/PageLayout.js';
import { DeleteCourseInstanceModal } from '../../components/DeleteCourseInstanceModal.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import type { StaffCourse, StaffCourseInstance } from '../../lib/client/safe-db-types.js';
import { Hydrate } from '../../lib/preact.js';
import { type Timezone, formatTimezone } from '../../lib/timezones.js';
import { encodePath } from '../../lib/uri-util.js';
import { useForm } from 'react-hook-form';
import QR from 'qrcode-svg';

export function InstructorInstanceAdminSettings({
  resLocals,
  shortNames,
  selfEnrollLink,
  studentLink,
  publicLink,
  infoCourseInstancePath,
  availableTimezones,
  origHash,
  instanceGHLink,
  canEdit,
  enrollmentCount,
  enrollmentManagementEnabled,
}: {
  resLocals: Record<string, any>;
  shortNames: string[];
  selfEnrollLink: string;
  studentLink: string;
  publicLink: string;
  infoCourseInstancePath: string;
  availableTimezones: Timezone[];
  origHash: string;
  instanceGHLink: string | undefined | null;
  canEdit: boolean;
  enrollmentCount: number;
  enrollmentManagementEnabled: boolean;
}) {
  const courseInstance = resLocals.course_instance as StaffCourseInstance;
  const course = resLocals.course as StaffCourse;

  return PageLayout({
    resLocals,
    pageTitle: 'Settings',
    navContext: {
      type: 'instructor',
      page: 'instance_admin',
      subPage: 'settings',
    },
    content: (
      <>
        <CourseInstanceSyncErrorsAndWarnings
          authzData={resLocals.authz_data}
          courseInstance={courseInstance}
          course={course}
          urlPrefix={resLocals.urlPrefix}
        />
        <Hydrate>
          <InstructorInstanceAdminSettingsPage
            csrfToken={resLocals.__csrf_token}
            urlPrefix={resLocals.urlPrefix}
            navPage={resLocals.navPage}
            hasEnhancedNavigation={resLocals.has_enhanced_navigation}
            canEdit={canEdit}
            courseInstance={courseInstance}
            shortNames={shortNames}
            availableTimezones={availableTimezones}
            origHash={origHash}
            instanceGHLink={instanceGHLink}
            studentLink={studentLink}
            publicLink={publicLink}
            selfEnrollLink={selfEnrollLink}
            enrollmentManagementEnabled={enrollmentManagementEnabled}
            infoCourseInstancePath={infoCourseInstancePath}
          />
        </Hydrate>
        <Hydrate>
          <DeleteCourseInstanceModal
            shortName={courseInstance.short_name ?? ''}
            enrolledCount={enrollmentCount}
            csrfToken={resLocals.__csrf_token}
          />
        </Hydrate>
      </>
    ),
  });
}

interface SettingsFormValues {
  ciid: string;
  long_name: string;
  display_timezone: string;
  group_assessments_by: 'Set' | 'Module';
  hide_in_enroll_page: boolean;
}

function GitHubButtonPreact({ gitHubLink }: { gitHubLink: string | null }) {
  if (!gitHubLink) return null;
  return (
    <Button
      as="a"
      size="sm"
      variant="light"
      href={gitHubLink}
      target="_blank"
      rel="noreferrer"
      aria-label="View on GitHub"
    >
      <i class="bi bi-github" /> <span class="d-none d-sm-inline">View on GitHub</span>
    </Button>
  );
}

function QRCodeModalPreact({
  id,
  title,
  content,
  show,
  onHide,
}: {
  id: string;
  title: string;
  content: string;
  show: boolean;
  onHide: () => void;
}) {
  const svg = useMemo(() => new QR({ content, container: 'svg-viewbox' }).svg(), [content]);
  return (
    <Modal show={show} onHide={onHide} aria-labelledby={`${id}-title`} backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title id={`${id}-title`}>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div class="d-flex" style="max-height: 80vh;">
          {/* eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml */}
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      </Modal.Body>
    </Modal>
  );
}

function copyToClipboard(text: string) {
  void (async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  })();
}

function StudentLinkSharingPreact({
  studentLink,
  studentLinkMessage,
}: {
  studentLink: string;
  studentLinkMessage: string;
}) {
  const [showQR, setShowQR] = useState(false);
  return (
    <div class="mb-3">
      <label class="form-label" for="student_link">
        Student Link
      </label>
      <InputGroup>
        <Form.Control id="student_link" value={studentLink} disabled />
        <OverlayTrigger overlay={<Tooltip>Copy</Tooltip>}>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() => copyToClipboard(studentLink)}
            aria-label="Copy student link"
          >
            <i class="bi bi-clipboard" />
          </Button>
        </OverlayTrigger>
        <OverlayTrigger overlay={<Tooltip>View QR Code</Tooltip>}>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() => setShowQR(true)}
            aria-label="Student Link QR Code"
          >
            <i class="bi bi-qr-code-scan" />
          </Button>
        </OverlayTrigger>
      </InputGroup>
      <small class="form-text text-muted">{studentLinkMessage}</small>
      <QRCodeModalPreact
        id="studentLinkModal"
        title="Student Link QR Code"
        content={studentLink}
        show={showQR}
        onHide={() => setShowQR(false)}
      />
    </div>
  );
}

function PublicLinkSharingPreact({
  publicLink,
  sharingMessage,
  publicLinkMessage,
}: {
  publicLink: string;
  sharingMessage: string;
  publicLinkMessage: string;
}) {
  const [showQR, setShowQR] = useState(false);
  return (
    <>
      <p>
        <span class="badge color-green3 me-1">Public source</span>
        {sharingMessage}
      </p>
      <div class="mb-3">
        <label htmlFor="publicLink">Public link</label>
        <InputGroup>
          <Form.Control id="publicLink" value={publicLink} disabled />
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() => copyToClipboard(publicLink)}
            aria-label="Copy public link"
          >
            <i class="far fa-clipboard" />
          </Button>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() => setShowQR(true)}
            aria-label="Public Link QR Code"
          >
            <i class="fas fa-qrcode" />
          </Button>
        </InputGroup>
        <small class="form-text text-muted">{publicLinkMessage}</small>
      </div>
      <QRCodeModalPreact
        id="publicLinkModal"
        title="Public Link QR Code"
        content={publicLink}
        show={showQR}
        onHide={() => setShowQR(false)}
      />
    </>
  );
}

function SelfEnrollmentSettingsPreact({
  selfEnrollLink,
  csrfToken,
}: {
  selfEnrollLink: string;
  csrfToken: string;
}) {
  const [showQR, setShowQR] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  return (
    <div class="mb-3">
      <label class="form-label" for="self_enrollment_link">
        Self-enrollment Link
      </label>
      <InputGroup>
        <Form.Control id="self_enrollment_link" value={selfEnrollLink} disabled />
        <OverlayTrigger overlay={<Tooltip>Copy</Tooltip>}>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() => copyToClipboard(selfEnrollLink)}
            aria-label="Copy self-enrollment link"
          >
            <i class="bi bi-clipboard" />
          </Button>
        </OverlayTrigger>
        <OverlayTrigger overlay={<Tooltip>View QR Code</Tooltip>}>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() => setShowQR(true)}
            aria-label="Self-enrollment Link QR Code"
          >
            <i class="bi bi-qr-code-scan" />
          </Button>
        </OverlayTrigger>
        <OverlayTrigger overlay={<Tooltip>Regenerate</Tooltip>}>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() => setShowConfirm(true)}
            aria-label="Generate new self-enrollment link"
          >
            <i class="bi-arrow-repeat" />
          </Button>
        </OverlayTrigger>
      </InputGroup>
      <small class="form-text text-muted">
        This is the link that students will use to enroll in the course if self-enrollment is
        enabled.
      </small>
      <QRCodeModalPreact
        id="selfEnrollmentLinkModal"
        title="Self-enrollment Link QR Code"
        content={selfEnrollLink}
        show={showQR}
        onHide={() => setShowQR(false)}
      />
      <Modal show={showConfirm} onHide={() => setShowConfirm(false)} backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title>Generate new self-enrollment link</Modal.Title>
        </Modal.Header>
        <form method="POST">
          <Modal.Body>
            <div>
              Are you sure you want to generate a new self-enrollment link?{' '}
              <strong>The current link will be deactivated.</strong> This action cannot be undone.
            </div>
          </Modal.Body>
          <Modal.Footer>
            <input type="hidden" name="__action" value="generate_enrollment_code" />
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <Button variant="secondary" type="button" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" type="submit">
              Generate new link
            </Button>
          </Modal.Footer>
        </form>
      </Modal>
    </div>
  );
}

export function InstructorInstanceAdminSettingsPage({
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
  navPage: string;
  hasEnhancedNavigation: boolean;
  canEdit: boolean;
  courseInstance: StaffCourseInstance;
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
    ciid: courseInstance.short_name ?? '',
    long_name: courseInstance.long_name ?? '',
    display_timezone: courseInstance.display_timezone,
    group_assessments_by: (courseInstance.assessments_group_by as 'Set' | 'Module') ?? 'Set',
    hide_in_enroll_page: Boolean(courseInstance.hide_in_enroll_page),
  };

  const {
    register,
    trigger,
    formState: { isDirty, errors },
  } = useForm<SettingsFormValues>({
    mode: 'onChange',
    defaultValues,
  });

  return (
    <div class="card mb-4">
      <div class="card-header bg-primary text-white d-flex align-items-center justify-content-between">
        <h1>
          {hasEnhancedNavigation ? 'General course instance settings' : 'Course instance settings'}
        </h1>
        <GitHubButtonPreact gitHubLink={instanceGHLink ?? null} />
      </div>
      <div class="card-body">
        <form
          method="POST"
          name="edit-course-instance-settings-form"
          onSubmit={async (e) => {
            const valid = await trigger();
            if (!valid) e.preventDefault();
          }}
        >
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <input type="hidden" name="orig_hash" value={origHash} />
          <div class="mb-3">
            <label class="form-label" for="ciid">
              CIID
            </label>
            <input
              type="text"
              class={'form-control font-monospace' + (errors.ciid ? ' is-invalid' : '')}
              id="ciid"
              aria-invalid={errors.ciid ? 'true' : 'false'}
              pattern="[-A-Za-z0-9_/]+"
              required
              disabled={!canEdit}
              {...register('ciid', {
                validate: (value) => {
                  if (!/^[-A-Za-z0-9_/]+$/.test(value))
                    return 'Use only letters, numbers, dashes, slashes, and underscores, with no spaces';
                  if (shortNames.includes(value) && value !== defaultValues.ciid)
                    return 'This ID is already in use';
                  return true;
                },
              })}
              name="ciid"
            />
            {errors.ciid?.message && <div class="invalid-feedback">{errors.ciid.message}</div>}
            <small class="form-text text-muted">
              Use only letters, numbers, dashes, and underscores, with no spaces. You may use
              forward slashes to separate directories. The recommended format is <code>Fa19</code>{' '}
              or <code>Fall2019</code>. Add suffixes if there are multiple versions, like{' '}
              <code>Fa19honors</code>.
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
              required
              disabled={!canEdit}
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
                <option value={tz.name} selected={tz.name === defaultValues.display_timezone}>
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
          <div class="mb-3 form-check">
            <input
              class="form-check-input"
              type="checkbox"
              id="hide_in_enroll_page"
              disabled={!canEdit}
              {...register('hide_in_enroll_page')}
              name="hide_in_enroll_page"
            />
            <label class="form-check-label" for="hide_in_enroll_page">
              Hide in enrollment page
            </label>
            <div class="small text-muted">
              If enabled, hides the course instance in the enrollment page, so that only direct
              links to the course can be used for enrollment.
            </div>
          </div>

          <StudentLinkSharingPreact
            studentLink={studentLink}
            studentLinkMessage="This is the link that students will use to access the course. You can copy this link to share with students."
          />

          {enrollmentManagementEnabled && (
            <SelfEnrollmentSettingsPreact selfEnrollLink={selfEnrollLink} csrfToken={csrfToken} />
          )}

          <h2 class="h4">Sharing</h2>
          {courseInstance.share_source_publicly ? (
            <PublicLinkSharingPreact
              publicLink={publicLink}
              sharingMessage={"This course instance's source is publicly shared."}
              publicLinkMessage="The link that other instructors can use to view this course instance."
            />
          ) : (
            <p>This course instance is not being shared.</p>
          )}

          {!canEdit && !courseInstance ? null : (
            <>
              {canEdit ? (
                <>
                  <button
                    id="save-button"
                    type="submit"
                    class="btn btn-primary mb-2"
                    name="__action"
                    value="update_configuration"
                    disabled={!isDirty}
                  >
                    Save
                  </button>
                  <button
                    id="cancel-button"
                    type="button"
                    class="btn btn-secondary mb-2 ms-2"
                    onClick={() => window.location.reload()}
                  >
                    Cancel
                  </button>
                  <p class="mb-0">
                    <a
                      data-testid="edit-course-instance-configuration-link"
                      href={encodePath(
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
            </>
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
InstructorInstanceAdminSettingsPage.displayName = 'InstructorInstanceAdminSettingsPage';
