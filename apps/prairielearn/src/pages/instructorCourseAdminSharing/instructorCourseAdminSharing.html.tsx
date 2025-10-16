import { z } from 'zod';

import { type HtmlSafeString, escapeHtml, html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';

import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';

export const SharingSetRowSchema = z.object({
  name: z.string(),
  id: z.string(),
  shared_with: z.string().array(),
});
type SharingSetRow = z.infer<typeof SharingSetRowSchema>;

function AddCourseToSharingSetPopover({
  sharing_set,
  resLocals,
}: {
  sharing_set: SharingSetRow;
  resLocals: Record<string, any>;
}) {
  return html`
    <form name="sharing-set-access-add-${sharing_set.id}" method="POST">
      <input type="hidden" name="__action" value="course_sharing_set_add" />
      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
      <input type="hidden" name="unsafe_sharing_set_id" value="${sharing_set.id}" />
      <div class="mb-3">
        <div class="form-text text-wrap">
          <p>
            To allow another course to access questions in the sharing set "${sharing_set.name}",
            enter their course sharing token below.
          </p>
        </div>
      </div>
      <div class="mb-3">
        <label class="form-label" for="course_sharing_token">Course sharing token</label>
        <input
          class="form-control form-control-sm"
          type="text"
          id="course_sharing_token"
          name="unsafe_course_sharing_token"
          required
        />
      </div>
      <div>
        <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="popover">
          Cancel
        </button>
        <button type="submit" class="btn btn-sm btn-primary">Add Course</button>
      </div>
    </form>
  `;
}

function ChooseSharingNameModal({
  canChooseSharingName,
  csrfToken,
}: {
  canChooseSharingName: boolean;
  csrfToken: string;
}) {
  let body: HtmlSafeString;
  let footer: HtmlSafeString;
  if (canChooseSharingName) {
    body = html`
      <p class="form-text">Enter the sharing name you would like for your course.</p>
      <div class="mb-3">
        <label class="form-label" for="course_sharing_name">Sharing name</label>
        <input
          class="form-control"
          type="text"
          id="course_sharing_name"
          name="course_sharing_name"
          required
        />
      </div>
      <p>
        <strong>
          Once you have shared a question either publicly or with another course, you will no longer
          be able to change your sharing name.
        </strong>
        Doing so would break the assessments of other courses that have imported your questions. It
        is recommended that you choose something short but descriptive. For example, if you're
        teaching a calculus course at a university that goes by the abbreviation 'XYZ', then you
        could choose the sharing name 'xyz-calculus'. Then other courses will import questions from
        your course with the syntax '@xyz-calculus/qid'.
      </p>
    `;
    footer = html`
      <input type="hidden" name="__action" value="choose_sharing_name" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="submit" class="btn btn-primary">Choose Sharing Name</button>
    `;
  } else {
    body = html`
      <strong>Unable to change your course's sharing name.</strong>
      <p>
        Your course's sharing name cannot be changed because at least one question has been shared.
        Doing so would break the assessments of other courses that have imported your questions.
      </p>
    `;
    footer = html`
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
    `;
  }
  return Modal({
    title: 'Choose Sharing Name',
    id: 'chooseSharingNameModal',
    form: canChooseSharingName,
    body,
    footer,
  });
}

export function InstructorCourseAdminSharing({
  sharingName,
  sharingToken,
  sharingSets,
  publicSharingLink,
  canChooseSharingName,
  resLocals,
}: {
  sharingName: string | null;
  sharingToken: string;
  sharingSets: SharingSetRow[];
  publicSharingLink: string;
  canChooseSharingName: boolean;
  resLocals: Record<string, any>;
}) {
  const isCourseOwner = resLocals.authz_data.has_course_permission_own;

  return PageLayout({
    resLocals,
    pageTitle: 'Course sharing',
    navContext: {
      type: 'instructor',
      page: 'course_admin',
      subPage: 'sharing',
    },
    options: {
      fullWidth: true,
    },
    content: html`
      ${renderHtml(
        <CourseSyncErrorsAndWarnings
          authzData={resLocals.authz_data}
          course={resLocals.course}
          urlPrefix={resLocals.urlPrefix}
        />,
      )}
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex">
          <h1>Course sharing details</h1>
        </div>
        <div class="table-responsive">
          <table
            class="table table-sm table-hover two-column-description"
            aria-label="Course sharing details"
          >
            <tbody>
              <tr>
                <th>Sharing name</th>
                <td data-testid="sharing-name">
                  ${sharingName !== null ? sharingName : ''}
                  ${isCourseOwner
                    ? html`
                        <button
                          type="button"
                          class="btn btn-xs btn-secondary mx-2"
                          aria-label="Choose Sharing Name"
                          data-bs-toggle="modal"
                          data-bs-target="#chooseSharingNameModal"
                        >
                          <i class="fas fa-share-nodes" aria-hidden="true"></i>
                          <span class="d-none d-sm-inline">Choose Sharing Name</span>
                        </button>
                        ${ChooseSharingNameModal({
                          canChooseSharingName,
                          csrfToken: resLocals.__csrf_token,
                        })}
                      `
                    : ''}
                </td>
              </tr>
              <tr>
                <th>Sharing Token</th>
                <td>
                  ${sharingToken}
                  <button
                    type="button"
                    class="btn btn-xs btn-secondary mx-2"
                    onclick="navigator.clipboard.writeText('${sharingToken}');"
                  >
                    <i class="fa fa-copy"></i>
                    <span>Copy</span>
                  </button>
                  ${isCourseOwner
                    ? html`
                        <form name="sharing-id-regenerate" method="POST" class="d-inline">
                          <input type="hidden" name="__action" value="sharing_token_regenerate" />
                          <input
                            type="hidden"
                            name="__csrf_token"
                            value="${resLocals.__csrf_token}"
                          />
                          <button type="submit" class="btn btn-xs btn-secondary">
                            <i class="fa fa-rotate"></i>
                            <span>Regenerate</span>
                          </button>
                        </form>
                      `
                    : ''}
                </td>
              </tr>
              <tr>
                <th>Public Questions Page</th>
                <td class="align-middle">
                  <a href="${publicSharingLink}" target="_blank">${publicSharingLink}</a>
                  <button
                    type="button"
                    class="btn btn-xs btn-secondary mx-2"
                    onclick="navigator.clipboard.writeText('${publicSharingLink}');"
                  >
                    <i class="fa fa-copy"></i>
                    <span>Copy</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h2>Sharing Sets</h2>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped" aria-label="Sharing sets">
            <thead>
              <tr>
                <th>Sharing Set Name</th>
                <th>Shared With</th>
              </tr>
            </thead>
            <tbody>
              ${sharingSets.map(
                (sharing_set) => html`
                  <tr>
                    <td class="align-middle">${sharing_set.name}</td>
                    <td class="align-middle" data-testid="shared-with">
                      ${sharing_set.shared_with.map(
                        (course_shared_with) => html`
                          <span class="badge color-gray1"> ${course_shared_with} </span>
                        `,
                      )}${isCourseOwner
                        ? html`
                            <div class="btn-group btn-group-sm" role="group">
                              <button
                                type="button"
                                class="btn btn-sm btn-outline-dark"
                                aria-label="Add course to sharing set"
                                data-bs-toggle="popover"
                                data-bs-container="body"
                                data-bs-html="true"
                                data-bs-placement="auto"
                                data-bs-title="Add Course to Sharing Set"
                                data-bs-content="${escapeHtml(
                                  AddCourseToSharingSetPopover({
                                    resLocals,
                                    sharing_set,
                                  }),
                                )}"
                              >
                                Add...
                                <i class="fas fa-plus" aria-hidden="true"></i>
                              </button>
                            </div>
                          `
                        : ''}
                    </td>
                  </tr>
                `,
              )}
            </tbody>
          </table>
        </div>
      </div>
    `,
  });
}
