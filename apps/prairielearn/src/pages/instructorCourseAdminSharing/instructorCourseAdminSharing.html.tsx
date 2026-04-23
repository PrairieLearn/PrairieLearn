import { z } from 'zod';

import { type HtmlSafeString, escapeHtml, html } from '@prairielearn/html';

import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { compiledScriptTag } from '../../lib/assets.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

export const SharingSetRowSchema = z.object({
  name: z.string(),
  id: z.string(),
  description: z.string().nullable(),
  shared_with: z.string().array(),
  question_count: z.number(),
});
type SharingSetRow = z.infer<typeof SharingSetRowSchema>;

function AddCourseToSharingSetPopover({
  sharing_set,
  resLocals,
}: {
  sharing_set: SharingSetRow;
  resLocals: ResLocalsForPage<'course'>;
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

function EditSharingSetDescriptionPopover({
  sharing_set,
  resLocals,
  origHash,
}: {
  sharing_set: SharingSetRow;
  resLocals: ResLocalsForPage<'course'>;
  origHash: string;
}) {
  return html`
    <form name="sharing-set-edit-description-${sharing_set.id}" method="POST">
      <input type="hidden" name="__action" value="sharing_set_update_description" />
      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
      <input type="hidden" name="orig_hash" value="${origHash}" />
      <input type="hidden" name="name" value="${sharing_set.name}" />
      <div class="mb-3">
        <label class="form-label" for="sharing_set_description_${sharing_set.id}">
          Description for "${sharing_set.name}"
        </label>
        <textarea
          class="form-control form-control-sm"
          id="sharing_set_description_${sharing_set.id}"
          name="description"
          rows="3"
        >
${sharing_set.description ?? ''}</textarea
        >
        <small class="form-text text-muted">Leave blank to remove the description.</small>
      </div>
      <div>
        <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="popover">
          Cancel
        </button>
        <button type="submit" class="btn btn-sm btn-primary">Save</button>
      </div>
    </form>
  `;
}

function DeleteSharingSetPopover({
  sharing_set,
  resLocals,
  origHash,
}: {
  sharing_set: SharingSetRow;
  resLocals: ResLocalsForPage<'course'>;
  origHash: string;
}) {
  return html`
    <form name="sharing-set-delete-${sharing_set.id}" method="POST">
      <input type="hidden" name="__action" value="sharing_set_delete" />
      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
      <input type="hidden" name="orig_hash" value="${origHash}" />
      <input type="hidden" name="name" value="${sharing_set.name}" />
      <div class="mb-3">
        <div class="form-text text-wrap">
          <p>Delete the sharing set "${sharing_set.name}"? This cannot be undone.</p>
        </div>
      </div>
      <div>
        <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="popover">
          Cancel
        </button>
        <button type="submit" class="btn btn-sm btn-danger">Delete</button>
      </div>
    </form>
  `;
}

function AddSharingSetModal({ csrfToken, origHash }: { csrfToken: string; origHash: string }) {
  return Modal({
    title: 'Add sharing set',
    id: 'addSharingSetModal',
    form: true,
    body: html`
      <input type="hidden" name="__action" value="sharing_set_create" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="orig_hash" value="${origHash}" />
      <p class="small text-muted">
        A
        <a
          href="https://docs.prairielearn.com/contentSharing/#sharing-sets"
          target="_blank"
          rel="noopener noreferrer"
        >
          sharing set
        </a>
        is a named set of questions which you can share to another course. This lets you share
        different sets of your questions &mdash; for example, share some questions only with other
        courses in your department, and other questions with anyone using PrairieLearn. See the
        <a
          href="https://docs.prairielearn.com/contentSharing/"
          target="_blank"
          rel="noopener noreferrer"
        >
          content sharing docs
        </a>
        for details.
      </p>
      <div class="mb-3">
        <label class="form-label" for="new_sharing_set_name">Name</label>
        <input
          type="text"
          class="form-control"
          id="new_sharing_set_name"
          name="name"
          required
          pattern="[^/@]+"
          title="Sharing set names cannot contain '/' or '@'."
        />
        <small class="form-text text-muted">
          A short identifier, e.g. <code>exam-questions</code>. Cannot contain "/" or "@".
        </small>
      </div>
      <div class="mb-3">
        <label class="form-label" for="new_sharing_set_description">Description (optional)</label>
        <textarea
          class="form-control"
          id="new_sharing_set_description"
          name="description"
          rows="2"
        ></textarea>
      </div>
    `,
    footer: html`
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Add sharing set</button>
    `,
  });
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
  canEdit,
  origHash,
  resLocals,
}: {
  sharingName: string | null;
  sharingToken: string;
  sharingSets: SharingSetRow[];
  publicSharingLink: string;
  canChooseSharingName: boolean;
  canEdit: boolean;
  origHash: string;
  resLocals: ResLocalsForPage<'course'>;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Course sharing',
    navContext: {
      type: 'instructor',
      page: 'course_admin',
      subPage: 'sharing',
    },
    headContent: html`${compiledScriptTag('instructorCourseAdminSharingClient.ts')}`,
    content: html`
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
                </td>
              </tr>
              <tr>
                <th>Sharing Token</th>
                <td>
                  ${sharingToken}
                  <button
                    type="button"
                    class="btn btn-copy btn-xs btn-secondary mx-2"
                    data-clipboard-text="${sharingToken}"
                    aria-label="Copy"
                  >
                    <i class="fa fa-copy"></i>
                    <span>Copy</span>
                  </button>
                  <form name="sharing-id-regenerate" method="POST" class="d-inline">
                    <input type="hidden" name="__action" value="sharing_token_regenerate" />
                    <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                    <button type="submit" class="btn btn-xs btn-secondary">
                      <i class="fa fa-rotate"></i>
                      <span>Regenerate</span>
                    </button>
                  </form>
                </td>
              </tr>
              <tr>
                <th>Public Questions Page</th>
                <td class="align-middle">
                  <a href="${publicSharingLink}" target="_blank">${publicSharingLink}</a>
                  <button
                    type="button"
                    class="btn btn-copy btn-xs btn-secondary mx-2"
                    data-clipboard-text="${publicSharingLink}"
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
        <div
          class="card-header bg-primary text-white d-flex align-items-center justify-content-between"
        >
          <h2>Sharing Sets</h2>
          ${canEdit
            ? html`
                <button
                  type="button"
                  class="btn btn-sm btn-light"
                  data-bs-toggle="modal"
                  data-bs-target="#addSharingSetModal"
                >
                  <i class="fas fa-plus" aria-hidden="true"></i>
                  Add sharing set
                </button>
              `
            : ''}
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped" aria-label="Sharing sets">
            <thead>
              <tr>
                <th>Sharing Set Name</th>
                <th>Description</th>
                <th>Shared With</th>
                ${canEdit ? html`<th class="text-end">Actions</th>` : ''}
              </tr>
            </thead>
            <tbody>
              ${sharingSets.length === 0
                ? html`
                    <tr>
                      <td
                        colspan="${canEdit ? 4 : 3}"
                        class="text-center text-muted align-middle py-3"
                      >
                        No sharing sets defined yet.
                      </td>
                    </tr>
                  `
                : sharingSets.map((sharing_set) => {
                    const inUse =
                      sharing_set.question_count > 0 || sharing_set.shared_with.length > 0;
                    return html`
                      <tr>
                        <td class="align-middle">${sharing_set.name}</td>
                        <td class="align-middle text-muted">${sharing_set.description ?? ''}</td>
                        <td class="align-middle" data-testid="shared-with">
                          ${sharing_set.shared_with.map(
                            (course_shared_with) => html`
                              <span class="badge color-gray1"> ${course_shared_with} </span>
                            `,
                          )}
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
                        </td>
                        ${canEdit
                          ? html`
                              <td class="align-middle">
                                <div class="d-flex justify-content-end gap-2">
                                  <button
                                    type="button"
                                    class="btn btn-sm btn-outline-secondary"
                                    aria-label="Edit description for ${sharing_set.name}"
                                    data-bs-toggle="popover"
                                    data-bs-container="body"
                                    data-bs-html="true"
                                    data-bs-placement="auto"
                                    data-bs-title="Edit description"
                                    data-bs-content="${escapeHtml(
                                      EditSharingSetDescriptionPopover({
                                        sharing_set,
                                        resLocals,
                                        origHash,
                                      }),
                                    )}"
                                  >
                                    <i class="fas fa-pen" aria-hidden="true"></i>
                                    Edit
                                  </button>
                                  ${inUse
                                    ? html`
                                        <span
                                          class="d-inline-block"
                                          tabindex="0"
                                          data-bs-toggle="tooltip"
                                          data-bs-placement="auto"
                                          data-bs-title="Cannot delete: sharing set contains questions or has been shared with other courses."
                                        >
                                          <button
                                            type="button"
                                            class="btn btn-sm btn-outline-danger"
                                            aria-label="Delete sharing set ${sharing_set.name}"
                                            disabled
                                          >
                                            <i class="fas fa-trash" aria-hidden="true"></i>
                                            Delete
                                          </button>
                                        </span>
                                      `
                                    : html`
                                        <button
                                          type="button"
                                          class="btn btn-sm btn-outline-danger"
                                          aria-label="Delete sharing set ${sharing_set.name}"
                                          data-bs-toggle="popover"
                                          data-bs-container="body"
                                          data-bs-html="true"
                                          data-bs-placement="auto"
                                          data-bs-title="Delete sharing set"
                                          data-bs-content="${escapeHtml(
                                            DeleteSharingSetPopover({
                                              sharing_set,
                                              resLocals,
                                              origHash,
                                            }),
                                          )}"
                                        >
                                          <i class="fas fa-trash" aria-hidden="true"></i>
                                          Delete
                                        </button>
                                      `}
                                </div>
                              </td>
                            `
                          : ''}
                      </tr>
                    `;
                  })}
            </tbody>
          </table>
        </div>
      </div>
      ${canEdit ? AddSharingSetModal({ csrfToken: resLocals.__csrf_token, origHash }) : ''}
    `,
  });
}
