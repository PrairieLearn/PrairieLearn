import { type HtmlValue, html, unsafeHtml } from '@prairielearn/html';

import { PageLayout } from '../../../components/PageLayout.js';
import { type Institution } from '../../../lib/db-types.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';
import { COURSE_REQUEST_MESSAGE_MAX_LENGTH } from '../../../models/institution-settings.js';

export function InstitutionAdminGeneral({
  institution,
  courseRequestMessage,
  courseRequestMessageHtml,
  resLocals,
}: {
  institution: Institution;
  courseRequestMessage: string | null;
  courseRequestMessageHtml: string;
  resLocals: ResLocalsForPage<'plain'>;
}) {
  return PageLayout({
    resLocals: {
      ...resLocals,
      institution,
    },
    pageTitle: `General — ${institution.short_name}`,
    navContext: {
      type: 'institution',
      page: 'institution_admin',
      subPage: 'general',
    },
    content: html`
      <h2 class="h4">Course request message</h2>
      <p>
        This message is shown to users from your institution on the
        <a href="/pl/request_course">course request page</a>. Use it to share institution-specific
        information such as licensing, costs, training resources, or contacts. Markdown formatting
        is supported; HTML tags are not rendered.
      </p>
      <form method="POST" class="mb-4">
        <div class="mb-3">
          <label class="form-label" for="course_request_message"> Message (Markdown) </label>
          ${CourseRequestMessageTextarea({ courseRequestMessage })}
          <small id="course_request_message_help" class="form-text text-muted">
            Leave blank to avoid showing a message on the course request page. Maximum
            ${COURSE_REQUEST_MESSAGE_MAX_LENGTH.toLocaleString()} characters.
          </small>
        </div>
        <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
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
    `,
  });
}

function CourseRequestMessageTextarea({
  courseRequestMessage,
}: {
  courseRequestMessage: string | null;
}): HtmlValue {
  // prettier-ignore
  return html`<textarea class="form-control font-monospace" id="course_request_message" name="course_request_message" rows="10" maxlength="${COURSE_REQUEST_MESSAGE_MAX_LENGTH}" aria-describedby="course_request_message_help">${courseRequestMessage ?? ''}</textarea>`;
}
