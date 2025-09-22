import clsx from 'clsx';
import { useState } from 'preact/compat';
import { Button, Form, InputGroup, Modal, OverlayTrigger, Tooltip } from 'react-bootstrap';
import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';

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
  studentLink,
  selfEnrollLink,
  csrfToken,
  formMeta,
}: {
  studentLink: string;
  selfEnrollLink: string;
  csrfToken: string;
  formMeta: {
    enrollmentManagementEnabled: boolean;
    register: UseFormRegister<SettingsFormValues>;
    watch: UseFormWatch<SettingsFormValues>;
    setValue: UseFormSetValue<SettingsFormValues>;
    errors: FieldErrors<SettingsFormValues>;
    canEdit: boolean;
  };
}) {
  const { register, watch, setValue, errors, canEdit, enrollmentManagementEnabled } = formMeta;

  const selfEnrollmentEnabled = watch('self_enrollment_enabled');
  const selfEnrollmentUseEnrollmentCode = watch('self_enrollment_use_enrollment_code');
  const selfEnrollmentEnabledBeforeDate = watch('self_enrollment_enabled_before_date');

  const [showDateInput, setShowDateInput] = useState(!!selfEnrollmentEnabledBeforeDate);

  return (
    <>
      <h2 class="h4">Self-enrollment</h2>

      <div class="mb-3 form-check">
        <input
          class="form-check-input"
          type="checkbox"
          id="self_enrollment_enabled"
          disabled={!canEdit || !enrollmentManagementEnabled}
          {...register('self_enrollment_enabled')}
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
          disabled={!canEdit || !selfEnrollmentEnabled || selfEnrollmentUseEnrollmentCode}
          {...register('show_in_enroll_page')}
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
          {...register('self_enrollment_use_enrollment_code')}
          name="self_enrollment_use_enrollment_code"
        />
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
          checked={showDateInput}
          onChange={(e) => {
            const target = e.target as HTMLInputElement;
            setShowDateInput(target.checked);

            // Clear the date when unchecking
            if (!target.checked) {
              setValue('self_enrollment_enabled_before_date', '');
            }
          }}
        />
        <label class="form-check-label" for="disable_self_enrollment_after_date">
          Forbid self-enrollment after specified date
        </label>
        <div class="small text-muted">
          If enabled, self-enrollment will be disabled after the specified date.
        </div>
        {showDateInput && (
          <>
            <input
              type="datetime-local"
              aria-label="Self-enrollment enabled before date"
              class={clsx(
                'form-control mt-2',
                errors.self_enrollment_enabled_before_date && 'is-invalid',
              )}
              disabled={!canEdit || !selfEnrollmentEnabled || !enrollmentManagementEnabled}
              {...register('self_enrollment_enabled_before_date', {
                required: showDateInput ? 'Date is required' : false,
              })}
              // If no date is set, don't include the name in the form data.
              {...(selfEnrollmentEnabledBeforeDate.length > 0
                ? { name: 'self_enrollment_enabled_before_date' }
                : {})}
            />
            {errors.self_enrollment_enabled_before_date && (
              <div class="invalid-feedback">
                {errors.self_enrollment_enabled_before_date.message}
              </div>
            )}
            <small class="form-text text-muted">
              After this date, self-enrollment will be disabled.
            </small>
          </>
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
