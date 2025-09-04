import { html } from '@prairielearn/html';

export function PublicLinkSharing({
  publicLink,
  sharingMessage,
  publicLinkMessage,
}: {
  publicLink: string;
  sharingMessage: string;
  publicLinkMessage: string;
}) {
  return html`
    <p>
      <span class="badge color-green3 me-1">Public source</span>
      ${sharingMessage}
    </p>
    <div class="mb-3">
      <label for="publicLink">Public link</label>
      <span class="input-group">
        <input
          type="text"
          class="form-control"
          id="publicLink"
          name="publicLink"
          value="${publicLink}"
          disabled
        />
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary btn-copy"
          data-clipboard-text="${publicLink}"
          aria-label="Copy public link"
        >
          <i class="far fa-clipboard"></i>
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          aria-label="Public Link QR Code"
          data-bs-toggle="modal"
          data-bs-target="#publicLinkModal"
        >
          <i class="fas fa-qrcode"></i>
        </button>
      </span>
      <small class="form-text text-muted"> ${publicLinkMessage} </small>
    </div>
  `;
}

export function StudentLinkSharing({
  studentLink,
  studentLinkMessage,
}: {
  studentLink: string;
  studentLinkMessage: string;
}) {
  return html`
    <div class="mb-3">
      <label class="form-label" for="student_link">Student Link</label>
      <span class="input-group">
        <input
          type="text"
          class="form-control"
          id="student_link"
          name="student_link"
          value="${studentLink}"
          disabled
        />
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary btn-copy"
          data-clipboard-text="${studentLink}"
          aria-label="Copy student link"
        >
          <i class="far fa-clipboard"></i>
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          aria-label="Student Link QR Code"
          data-bs-toggle="modal"
          data-bs-target="#studentLinkModal"
        >
          <i class="fas fa-qrcode"></i>
        </button>
      </span>
      <small class="form-text text-muted"> ${studentLinkMessage} </small>
    </div>
  `;
}
