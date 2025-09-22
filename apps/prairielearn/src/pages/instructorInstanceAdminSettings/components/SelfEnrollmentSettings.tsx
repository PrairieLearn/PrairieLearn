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
              <i class="bi-arrow-repeat" />
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

  const {
    invalid: selfEnrollmentEnabledBeforeDateInvalid,
    error: selfEnrollmentEnabledBeforeDateError,
  } = control.getFieldState('self_enrollment_enabled_before_date');

  return (
    <>
      <h2 class="h4">Self-enrollment</h2>

      <div class="mb-3 form-check">
        <input
          class="form-check-input"
          type="checkbox"
          id="self_enrollment_enabled"
          disabled={!enrollmentManagementEnabled}
          {...control.register('self_enrollment_enabled')}
          name="self_enrollment_enabled"
        />
        <label class="form-check-label" for="self_enrollment_enabled">
          Enable self-enrollment
        </label>
        <div class="small text-muted">
          Allow students to enroll themselves in this course instance.
        </div>
      </div>

      <div class="mb-3 form-check">
        <input
          class="form-check-input"
          type="checkbox"
          id="show_in_enroll_page"
          {...control.register('show_in_enroll_page')}
          name="show_in_enroll_page"
        />
        <label class="form-check-label" for="show_in_enroll_page">
          Show on enrollment page
        </label>
        <div class="small text-muted">
          If enabled, students can discover the course instance on the enrollment page. If disabled,
          they will need a direct link to the course instance to enroll.
        </div>
      </div>

      <div class="mb-3 form-check">
        <input
          class="form-check-input"
          type="checkbox"
          id="self_enrollment_use_enrollment_code"
          disabled={!canEdit || !selfEnrollmentEnabled || !enrollmentManagementEnabled}
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
          If enabled, self-enrollment requires an enrollment code to enroll. If disabled, any link
          to the course instance will allow self-enrollment.
        </div>
      </div>

      <div class="mb-3 form-check">
        <input
          class="form-check-input"
          type="checkbox"
          id="disable_self_enrollment_after_date"
          disabled={!canEdit || !selfEnrollmentEnabled || !enrollmentManagementEnabled}
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
          If enabled, self-enrollment will be disabled after the specified date.
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
              disabled={!canEdit || !selfEnrollmentEnabled || !enrollmentManagementEnabled}
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
              After this date, self-enrollment will be disabled.
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

      {selfEnrollmentEnabled && (
        <>
          {selfEnrollmentUseEnrollmentCode ? (
            <SelfEnrollmentLink selfEnrollLink={selfEnrollLink} csrfToken={csrfToken} />
          ) : (
            <StudentLinkSharing
              studentLink={studentLink}
              studentLinkMessage="This is the link that students will use to access the course. You can copy this link to share with students."
            />
          )}
        </>
      )}
    </>
  );
}
