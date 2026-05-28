import { type HtmlValue, html, unsafeHtml } from '@prairielearn/html';

import { COURSE_REQUEST_MESSAGE_MAX_LENGTH } from '../../models/institution-settings.js';

/**
 * Renders the "Course request message" editor section (heading, description,
 * Markdown textarea, save button, and optional preview).
 *
 * The description text differs between the global-admin and institution-admin
 * views, so it is passed in by the caller.
 */
export function CourseRequestMessageSection({
  csrfToken,
  description,
  courseRequestMessage,
  courseRequestMessageHtml,
}: {
  csrfToken: string;
  description: HtmlValue;
  courseRequestMessage: string | null;
  courseRequestMessageHtml: string;
}): HtmlValue {
  return html`
    <h2 class="h4">Course request message</h2>
    <p>${description}</p>
    <form method="POST" class="mb-4">
      <div class="mb-3">
        <label class="form-label" for="course_request_message">Message (Markdown)</label>
        ${CourseRequestMessageTextarea({ courseRequestMessage })}
        <small id="course_request_message_help" class="form-text text-muted">
          Leave blank to avoid showing a message on the course request page. Maximum
          ${COURSE_REQUEST_MESSAGE_MAX_LENGTH.toLocaleString()} characters.
        </small>
      </div>
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button
        type="submit"
        name="__action"
        value="update_course_request_message"
        class="btn btn-primary"
      >
        Save
      </button>
    </form>
    ${courseRequestMessageHtml
      ? html`
          <h3 class="h5">Preview</h3>
          <div class="card mb-3">
            <div class="card-body">${unsafeHtml(courseRequestMessageHtml)}</div>
          </div>
        `
      : ''}
  `;
}

function CourseRequestMessageTextarea({
  courseRequestMessage,
}: {
  courseRequestMessage: string | null;
}): HtmlValue {
  // prettier-ignore
  return html`<textarea class="form-control font-monospace" id="course_request_message" name="course_request_message" rows="10" maxlength="${COURSE_REQUEST_MESSAGE_MAX_LENGTH}" aria-describedby="course_request_message_help">${courseRequestMessage ?? ''}</textarea>`;
}
