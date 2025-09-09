function SelfEnrollmentSettings({ selfEnrollLink }: { selfEnrollLink: string }) {
  return (
    <div class="mb-3">
      <label class="form-label" for="self_enrollment_link">
        Self-enrollment Link
      </label>
      <span class="input-group">
        <input
          type="text"
          class="form-control"
          id="self_enrollment_link"
          name="self_enrollment_link"
          value={selfEnrollLink}
          disabled
        />
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary btn-copy"
          data-bs-toggle="tooltip"
          data-bs-placement="top"
          data-bs-title="Copy"
          data-clipboard-text={selfEnrollLink}
          aria-label="Copy self-enrollment link"
        >
          <i class="bi bi-clipboard" />
        </button>

        <button
          type="button"
          class="btn btn-sm btn-outline-secondary p-0"
          data-bs-toggle="modal"
          data-bs-target="#selfEnrollmentLinkModal"
          aria-label="Self-enrollment Link QR Code"
        >
          <span
            class="px-2 py-2"
            data-bs-toggle="tooltip"
            data-bs-placement="top"
            data-bs-title="View QR Code"
          >
            <i class="bi bi-qr-code-scan" />
          </span>
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary p-0"
          data-bs-toggle="modal"
          data-bs-target="#generateSelfEnrollmentLinkModal"
          aria-label="Generate new self-enrollment link"
        >
          <span
            class="px-2 py-2"
            data-bs-toggle="tooltip"
            data-bs-placement="top"
            data-bs-title="Regenerate"
          >
            <i class="bi-arrow-repeat" />
          </span>
        </button>
      </span>
      <small class="form-text text-muted">
        This is the link that students will use to enroll in the course if self-enrollment is
        enabled.
      </small>
    </div>
  );
}

export default SelfEnrollmentSettings;
