import { html } from '@prairielearn/html';

export function PublicLinkSharing({
  publicLink,
  linkType,
}: {
  publicLink: string;
  linkType: string;
}) {
  return html`
    <p>
      <span class="badge color-green3 me-1">Public source</span>
      This ${linkType}'s source is publicly shared.
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
      <small class="form-text text-muted">
        The link that other instructors can use to view this ${linkType}.
      </small>
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
