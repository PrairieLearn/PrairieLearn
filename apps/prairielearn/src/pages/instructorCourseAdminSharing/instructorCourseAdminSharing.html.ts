import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

const addSharingSetPopover = (resLocals) => {
  return html`
    <form name="sharing-set-create" method="POST">
      <input type="hidden" name="__action" value="unsafe_sharing_set_create">
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

const chooseSharingNamePopover = (resLocals) => {
  return html`
    <form name="choose-sharing-name" method="POST">
      <input type="hidden" name="__action" value="unsafe_choose_sharing_name">
      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}">

      <div class="form-group mb-4">
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
      <div class=form-group>
        <input class="form-control form-control-sm" type="text" name="course_sharing_name" required/>
      <div>
      <div class="text-right mt-4">
        <button type="button" class="btn btn-secondary" onclick="$('#chooseSharingName').popover('hide')">Cancel</button>
        <button type="submit" class="btn btn-primary">Choose Sharing Name</button>
      </div>
    </form>
  `.toString();
};

export const InstructorSharing = ({ sharing_name, sharing_token, sharing_sets, resLocals }) => {
  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../pages/partials/head') %>", resLocals)}
      </head>
      <body>
        <script>
          $(function () {
            $('[data-toggle="popover"]').popover({
              sanitize: false,
            });
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
                  <td>
                    ${sharing_name !== null
                      ? sharing_name
                      : html`
                          <button
                            type="button"
                            class="btn btn-xs btn-secondary mx-2"
                            id="chooseSharingName"
                            data-toggle="popover"
                            data-container="body"
                            data-html="true"
                            data-placement="auto"
                            title="Choose Sharing Name"
                            data-content="${chooseSharingNamePopover(resLocals)}"
                            data-trigger="manual"
                            onclick="$(this).popover('show')"
                          >
                            <i class="fas fa-share-nodes" aria-hidden="true"></i>
                            <span class="d-none d-sm-inline">Choose Sharing Name</span>
                          </button>
                        `}
                  </td>
                </tr>
                <tr>
                  <th>Sharing ID</th>
                  <td>
                    ${sharing_token}
                    <button
                      class="btn btn-xs btn-secondary mx-2"
                      onclick="navigator.clipboard.writeText('${sharing_token}');"
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
              </tbody>
            </table>
          </div>

          <div class="card mb-4">
            <div class="card-header bg-primary">
              <div class="row align-items-center justify-content-between">
                <div class="col-auto">
                  <span class="text-white">Sharing Sets</span>
                </div>
                <div class="col-auto">
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
                    data-trigger="manual"
                    onclick="$(this).popover('show')"
                  >
                    <i class="fas fa-plus" aria-hidden="true"></i>
                    <span class="d-none d-sm-inline">Create Sharing Set</span>
                  </button>
                </div>
              </div>
            </div>
            <table class="table table-sm table-hover table-striped">
              <thead>
                <th>Sharing Set Name</th>
                <th>Shared With</th>
              </thead>
              <tbody>
                ${sharing_sets.map(
                  (sharing_set) => html`
                    <tr>
                      <td class="align-middle">${sharing_set.name}</td>
                      <td class="align-middle">
                        ${sharing_set.shared_with.map((course_shared_with) =>
                          course_shared_with.course_id === null
                            ? ''
                            : html`
                                <span class="badge color-gray1  ">
                                  ${course_shared_with.short_name}
                                </span>
                              `
                        )}
                        <form
                          name="sharing-set-access-add-${sharing_set.id}"
                          method="POST"
                          class="d-inline"
                        >
                          <input
                            type="hidden"
                            name="__action"
                            value="unsafe_course_sharing_set_add"
                          />
                          <input
                            type="hidden"
                            name="__csrf_token"
                            value="${resLocals.__csrf_token}"
                          />
                          <input type="hidden" name="sharing_set_id" value="${sharing_set.id}" />
                          <div class="btn-group btn-group-sm" role="group">
                            <button
                              id="addSSPDrop-${sharing_set.id}"
                              type="button"
                              class="btn btn-sm btn-outline-dark dropdown-toggle"
                              data-toggle="dropdown"
                              aria-haspopup="true"
                              aria-expanded="false"
                            >
                              Add...
                            </button>
                            <div
                              class="dropdown-menu"
                              aria-labelledby="addSSPDrop-${sharing_set.id}"
                            >
                              <div class="dropdown-header text-wrap">
                                <p>
                                  To allow another course to access questions in the sharing set
                                  "${sharing_set.name}", enter their course sharing id below.
                                </p>
                              </div>
                              <div class="" style="padding:1em;">
                                <input
                                  class="form-control form-control-sm"
                                  type="text"
                                  name="course_sharing_token"
                                  required
                                />
                                <button class="btn-sm btn-primary" type="Submit">Add Course</button>
                              </div>
                            </div>
                          </div>
                        </form>
                      </td>
                    </tr>
                  `
                )}
              </tbody>
            </table>
          </div>
        </main>
      </body>
    </html>
  `.toString();
};
