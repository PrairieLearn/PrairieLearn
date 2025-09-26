import clsx from 'clsx';
import { useState } from 'preact/compat';
import { Button, Form, InputGroup, Modal, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { type Control, useWatch } from 'react-hook-form';

import { StudentLinkSharing } from '../../../components/LinkSharing.js';
import { QRCodeModal } from '../../../components/QRCodeModal.js';
import type { SettingsFormValues } from '../instructorInstanceAdminSettings.types.js';

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

function SelfEnrollmentLink({
  selfEnrollLink,
  csrfToken,
}: {
  selfEnrollLink: string;
  csrfToken: string;
}) {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  return (
    <>
      <div class="mb-3">
        <label class="form-label" for="self_enrollment_link">
          Self-enrollment Link
        </label>
        <InputGroup>
          <Form.Control id="self_enrollment_link" value={selfEnrollLink} disabled />
          <OverlayTrigger overlay={<Tooltip>{copied ? 'Copied!' : 'Copy'}</Tooltip>}>
            <Button
              size="sm"
              variant="outline-secondary"
              aria-label="Copy self-enrollment link"
              onClick={async () => {
                await copyToClipboard(selfEnrollLink);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              <i class="bi bi-clipboard" />
            </Button>
          </OverlayTrigger>
          <OverlayTrigger overlay={<Tooltip>View QR Code</Tooltip>}>
            <Button
              size="sm"
              variant="outline-secondary"
              aria-label="Self-enrollment Link QR Code"
              onClick={() => setShowQR(true)}
            >
              <i class="bi bi-qr-code-scan" />
            </Button>
          </OverlayTrigger>
          <OverlayTrigger overlay={<Tooltip>Regenerate</Tooltip>}>
            <Button
              size="sm"
              variant="outline-secondary"
              aria-label="Generate new self-enrollment link"
              onClick={() => setShowConfirm(true)}
            >
              <i class="bi bi-arrow-repeat" />
            </Button>
          </OverlayTrigger>
        </InputGroup>
        <small class="form-text text-muted">
          Students can use this link to immediately enroll in the course. Students can also enroll
          by entering the enrollment code on any link to the course instance.
        </small>
      </div>

      <QRCodeModal
        id="selfEnrollmentLinkModal"
        title="Self-enrollment Link QR Code"
        content={selfEnrollLink}
        show={showQR}
        onHide={() => setShowQR(false)}
      />
      <Modal show={showConfirm} backdrop="static" onHide={() => setShowConfirm(false)}>
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
    </>
  );
}

export function SelfEnrollmentSettings({
  control,
  canEdit,
  enrollmentManagementEnabled,
  studentLink,
  selfEnrollLink,
  csrfToken,
}: {
  control: Control<SettingsFormValues>;
  canEdit: boolean;
  enrollmentManagementEnabled: boolean;
  studentLink: string;
  selfEnrollLink: string;
  csrfToken: string;
}) {
  const selfEnrollmentEnabled = useWatch({ control, name: 'self_enrollment_enabled' });
  const selfEnrollmentUseEnrollmentCode = useWatch({
    control,
    name: 'self_enrollment_use_enrollment_code',
  });
  const selfEnrollmentEnabledBeforeDateEnabled = useWatch({
    control,
    name: 'self_enrollment_enabled_before_date_enabled',
  });

  const selfEnrollmentEnabledBeforeDate = useWatch({
    control,
    name: 'self_enrollment_enabled_before_date',
  });

  const showInEnrollPage = useWatch({
    control,
    name: 'show_in_enroll_page',
  });

  const { invalid: showInEnrollPageInvalid, error: showInEnrollPageError } =
    control.getFieldState('show_in_enroll_page');

  console.log(
    'showInEnrollPageInvalid',
    showInEnrollPageInvalid,
    'showInEnrollPageError',
    showInEnrollPageError,
  );

  const {
    invalid: selfEnrollmentEnabledBeforeDateInvalid,
    error: selfEnrollmentEnabledBeforeDateError,
  } = control.getFieldState('self_enrollment_enabled_before_date');

  return (
    <>
      <h2 class="h4">Self-enrollment</h2>

      {enrollmentManagementEnabled && (
        <div class="mb-3 form-check">
          <input
            class="form-check-input"
            type="checkbox"
            id="self_enrollment_enabled"
            {...control.register('self_enrollment_enabled', {
              // Re-run validation when self-enrollment is enabled or disabled
              deps: ['show_in_enroll_page'],
            })}
            name="self_enrollment_enabled"
          />
          <label class="form-check-label" for="self_enrollment_enabled">
            Allow self-enrollment
          </label>
          <div class="small text-muted">
            Allow students to enroll themselves in this course instance.
          </div>
        </div>
      )}

      <div class="mb-3 form-check">
        <input
          class={clsx('form-check-input', showInEnrollPageInvalid && 'is-invalid')}
          type="checkbox"
          id="show_in_enroll_page"
          {...control.register('show_in_enroll_page', {
            validate: (value, { self_enrollment_enabled }) => {
              if (!self_enrollment_enabled && value) {
                return 'Self-enrollment must be enabled to show the course instance on the enrollment page.';
              }
              return true;
            },
            // deps: ['self_enrollment_enabled'],
          })}
          name="show_in_enroll_page"
        />
        <label class="form-check-label" for="show_in_enroll_page">
          Show on enrollment page
        </label>
        {showInEnrollPageError ? (
          <div class="invalid-feedback">{showInEnrollPageError.message}</div>
        ) : (
          <div class="small text-muted">
            {showInEnrollPage
              ? 'Students can discover the course instance on the enrollment page.'
              : 'Students will need a direct link to the course instance to enroll.'}
          </div>
        )}
      </div>

      {enrollmentManagementEnabled && (
        <>
          <div class="mb-3 form-check">
            <input
              class="form-check-input"
              type="checkbox"
              id="self_enrollment_use_enrollment_code"
              disabled={!canEdit || !selfEnrollmentEnabled}
              {...control.register('self_enrollment_use_enrollment_code')}
              name="self_enrollment_use_enrollment_code"
            />
            {!selfEnrollmentEnabled && (
              <input
                type="hidden"
                name="self_enrollment_use_enrollment_code"
                value={selfEnrollmentUseEnrollmentCode ? 'on' : ''}
              />
            )}
            <label class="form-check-label" for="self_enrollment_use_enrollment_code">
              Use enrollment code for self-enrollment
            </label>
            <div class="small text-muted">
              {selfEnrollmentUseEnrollmentCode
                ? 'Self-enrollment requires an enrollment code.'
                : 'Any link to the course instance will allow self-enrollment.'}
            </div>
          </div>

          <div class="mb-3 form-check">
            <input
              class="form-check-input"
              type="checkbox"
              id="disable_self_enrollment_after_date"
              disabled={!canEdit || !selfEnrollmentEnabled}
              {...control.register('self_enrollment_enabled_before_date_enabled')}
              name="self_enrollment_enabled_before_date_enabled"
            />
            {!selfEnrollmentEnabled && (
              <input
                type="hidden"
                name="self_enrollment_enabled_before_date_enabled"
                value={selfEnrollmentEnabledBeforeDateEnabled ? 'on' : ''}
              />
            )}
            <label class="form-check-label" for="disable_self_enrollment_after_date">
              Forbid self-enrollment after specified date
            </label>
            <div class="small text-muted">
              If checked, self-enrollment will be forbidden after the specified date.
            </div>
            {selfEnrollmentEnabledBeforeDateEnabled ? (
              <>
                <input
                  type="datetime-local"
                  aria-label="Self-enrollment enabled before date"
                  class={clsx(
                    'form-control mt-2',
                    selfEnrollmentEnabledBeforeDateInvalid && 'is-invalid',
                  )}
                  disabled={!canEdit || !selfEnrollmentEnabled}
                  {...control.register('self_enrollment_enabled_before_date', {
                    validate: (value, { self_enrollment_enabled_before_date_enabled }) => {
                      if (self_enrollment_enabled_before_date_enabled && !value) {
                        return 'Date is required';
                      }
                      return true;
                    },
                  })}
                />
                {!selfEnrollmentEnabled && (
                  <input
                    type="hidden"
                    name="self_enrollment_enabled_before_date"
                    value={selfEnrollmentEnabledBeforeDate}
                  />
                )}
                {selfEnrollmentEnabledBeforeDateError && (
                  <div class="invalid-feedback">{selfEnrollmentEnabledBeforeDateError.message}</div>
                )}
                <small class="form-text text-muted">
                  After this date, self-enrollment will be forbidden.
                </small>
              </>
            ) : (
              <input
                type="hidden"
                name="self_enrollment_enabled_before_date"
                value={selfEnrollmentEnabledBeforeDate}
              />
            )}
          </div>
        </>
      )}

      {selfEnrollmentEnabled && enrollmentManagementEnabled && selfEnrollmentUseEnrollmentCode ? (
        <SelfEnrollmentLink selfEnrollLink={selfEnrollLink} csrfToken={csrfToken} />
      ) : (
        <StudentLinkSharing
          studentLink={studentLink}
          studentLinkMessage={`This is the link that students will use to ${selfEnrollmentEnabled ? 'access the course' : 'accept invitations'}. You can copy this link to share with students.`}
        />
      )}
    </>
  );
}
