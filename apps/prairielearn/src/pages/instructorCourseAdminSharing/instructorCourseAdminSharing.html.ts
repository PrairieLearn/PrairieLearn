import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

const addSharingSetPopover = (resLocals) => {
  return html`
    <form name="sharing-set-create" method="POST">
      <input type="hidden" name="__action" value="sharing_set_create">
      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}">

      <div class="form-group mb-4">
        <p class=form-text>
          Enter the name of the sharing set you would like to create.
        </p>
      </div>
      <div class=form-group>
        <input class="form-control form-control-sm" type="text" name="sharing_set_name" required/>
      <div>
      <div class="text-right mt-4">
        <button type="button" class="btn btn-secondary" onclick="$('#courseSharingSetAdd').popover('hide')">Cancel</button>
        <button type="submit" class="btn btn-primary">Create Sharing Set</button>
      </div>
    </form>
  `.toString();
};

const addCourseToSharingSetPopover = (resLocals, sharing_set) => {
  return html`
    <form name="sharing-set-access-add-${sharing_set.id}" method="POST">
      <input type="hidden" name="__action" value="course_sharing_set_add" />
      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
      <input type="hidden" name="unsafe_sharing_set_id" value="${sharing_set.id}" />
      <div class="form-group mb-4">
        <div class="form-text text-wrap">
          <p>
            To allow another course to access questions in the sharing set "${sharing_set.name}",
            enter their course sharing token below.
          </p>
        </div>
      </div>
      <div class="form-group">
        <input
          class="form-control form-control-sm"
          type="text"
          name="unsafe_course_sharing_token"
          required
        />
      </div>
      <div>
        <button
          type="button"
          class="btn btn-sm btn-secondary"
          onclick="$('#addCourseToSS-${sharing_set.id}').popover('hide')"
        >
          Cancel
        </button>
        <button class="btn btn-sm btn-primary" type="Submit">Add Course</button>
      </div>
    </form>
  `.toString();
};

const chooseSharingNameModal = (resLocals) => {
  return html`
  <div
    class="modal fade"
    id="chooseSharingNameModal"
    tabindex="-1"
    role="dialog"
    aria-hidden="true"
  >
    <div
      class="modal-dialog modal-dialog-centered"
      role="document"
    >
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            Choose Sharing Name
          </h5>
          <button
            type="button"
            class="close"
            data-dismiss="modal"
            aria-label="Close"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body">
          <p class=form-text>
            Enter the sharing name you would like for your course.
          </p>
          <p><strong>Once you choose your course's sharing name, you will not be able to change it</strong>,
            because doing so would break the assessments of other courses that have imported your questions.
            It is recommended that you choose something short but descriptive. For example, if you're teaching
            a calculus course at a university that goes by the abbreviation 'XYZ', then you could choose the sharing
            name 'xyz-calculus'. Then other courses will import questions from your course with the syntax '@xyz-calculus/qid'.
          </p>
        </div>
        <div class="modal-footer">
          <form name="choose-sharing-name" method="POST">
            <input type="hidden" name="__action" value="choose_sharing_name">
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}">
            <div class=form-group>
              <input class="form-control form-control-sm" type="text" name="course_sharing_name" required/>
            <div>
            <div class="text-right mt-4">
              <button type="submit" class="btn btn-primary">Choose Sharing Name</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
};

export const InstructorSharing = ({
  sharingName,
  sharingToken,
  sharingSets,
  publicSharingLink,
  resLocals,
}: {
  sharingName: string | null;
  sharingToken: string;
  sharingSets: { name: string; id: string; shared_with: string[] }[];
  publicSharingLink: string;
  resLocals: Record<string, any>;
}) => {
  const isCourseOwner = resLocals.authz_data.has_course_permission_own;
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../pages/partials/head') %>", resLocals)}
      </head>
      <body>
        <script>
          $(function () {
            $('[data-toggle="popover"]').popover({ sanitize: false });
          });
        </script>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", resLocals)}
        <main id="content" class="container-fluid">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex">Course Sharing Info</div>
            <table class="table table-sm table-hover two-column-description">
              <tbody>
                <tr>
                  <th>Sharing Name</th>
                  <td data-testid="sharing-name">
                    ${sharingName !== null ? sharingName : ''}
                    ${!sharingName && isCourseOwner
                      ? html`
                          <button
                            type="button"
                            class="btn btn-xs btn-secondary mx-2"
                            id="chooseSharingName"
                            title="Choose Sharing Name"
                            data-toggle="modal"
                            data-target="#chooseSharingNameModal"
                            data-trigger="manual"
                          >
                            <i class="fas fa-share-nodes" aria-hidden="true"></i>
                            <span class="d-none d-sm-inline">Choose Sharing Name</span>
                          </button>
                          ${chooseSharingNameModal(resLocals)}
                        `
                      : ''}
                  </td>
                </tr>
                <tr>
                  <th>Sharing Token</th>
                  <td>
                    ${sharingToken}
                    <button
                      class="btn btn-xs btn-secondary mx-2"
                      onclick="navigator.clipboard.writeText('${sharingToken}');"
                    >
                      <i class="fa fa-copy"></i>
                      <span>Copy</span>
                    </button>
                    <form name="sharing-id-regenerate" method="POST" class="d-inline">
                      <input type="hidden" name="__action" value="sharing_token_regenerate" />
                      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                      <button role="button" type="submit" class="btn btn-xs btn-secondary">
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

          <div class="card mb-4">
            <div class="card-header bg-primary">
              <div class="row align-items-center justify-content-between">
                <div class="col-auto">
                  <span class="text-white">Sharing Sets</span>
                </div>
                ${isCourseOwner
                  ? html`<div class="col-auto">
                      <button
                        type="button"
                        class="btn btn-light btn-sm ml-auto"
                        id="courseSharingSetAdd"
                        data-toggle="popover"
                        data-container="body"
                        data-html="true"
                        data-placement="auto"
                        title="Create Sharing Set"
                        data-content="${addSharingSetPopover(resLocals)}"
                      >
                        <i class="fas fa-plus" aria-hidden="true"></i>
                        <span class="d-none d-sm-inline">Create Sharing Set</span>
                      </button>
                    </div>`
                  : ''}
              </div>
            </div>
            <table class="table table-sm table-hover table-striped">
              <thead>
                <th>Sharing Set Name</th>
                <th>Shared With</th>
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
                          ? html` <div class="btn-group btn-group-sm" role="group">
                              <button
                                type="button"
                                class="btn btn-sm btn-outline-dark"
                                id="addCourseToSS-${sharing_set.id}"
                                data-toggle="popover"
                                data-container="body"
                                data-html="true"
                                data-placement="auto"
                                title="Add Course to Sharing Set"
                                data-content="${addCourseToSharingSetPopover(
                                  resLocals,
                                  sharing_set,
                                )}"
                              >
                                Add...
                                <i class="fas fa-plus" aria-hidden="true"></i>
                              </button>
                            </div>`
                          : ''}
                      </td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
        </main>
      </body>
    </html>
  `.toString();
};
