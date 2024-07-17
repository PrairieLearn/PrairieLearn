import { html, joinHtml, unsafeHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { compiledScriptTag, nodeModulesAssetPath } from '../../lib/assets.js';
import { config } from '../../lib/config.js';
import { encodePath } from '../../lib/uri-util.js';

export function InstructorFileEditor({ resLocals }: { resLocals: Record<string, any> }) {
  const { fileEdit, authz_data, course_owners, course, __csrf_token } = resLocals;
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        <meta
          name="ace-base-path"
          content="${nodeModulesAssetPath('ace-builds/src-min-noconflict/')}"
        />
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", {
          ...resLocals,
          pageTitle: `Edit ${fileEdit?.fileName}`,
        })}
        ${compiledScriptTag('instructorFileEditorClient.ts')}
      </head>

      <body>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", resLocals)}

        <main id="content" class="container-fluid">
          ${!authz_data.has_course_permission_edit
            ? html`
                <div class="card mb-4">
                  <div class="card-header bg-danger text-white">File editor</div>
                  <div class="card-body">
                    <h2>Insufficient permissions</h2>
                    <p>You must have at least &quot;Editor&quot; permissions for this course.</p>
                    ${course_owners.length > 0
                      ? html`
                          <p>Contact one of the below course owners to request access.</p>
                          <ul>
                            ${course_owners.map(
                              (owner) => html`
                                <li>${owner.uid} ${owner.name ? `(${owner.name})` : ''}</li>
                              `,
                            )}
                          </ul>
                        `
                      : ''}
                  </div>
                </div>
              `
            : course.example_course
              ? html`
                  <div class="card mb-4">
                    <div class="card-header bg-danger text-white">File editor</div>
                    <div class="card-body">
                      <h2>Insufficient permissions</h2>
                      <p>No one is allowed to edit the example course.</p>
                    </div>
                  </div>
                `
              : html`
                  ${fileEdit.sync_errors
                    ? html`
                        <div class="alert alert-danger" role="alert">
                          <h2 class="h5 alert-heading">Sync error</h2>
                          <p>
                            There were one or more errors in this file the last time you tried to
                            sync. This file will not be able to be synced until the errors are
                            corrected. The errors are listed below.
                          </p>
                          <pre
                            class="text-white rounded p-3 mb-0"
                            style="background-color: black;"
                          ><code>${unsafeHtml(fileEdit.sync_errors_ansified)}</code></pre>
                        </div>
                      `
                    : ''}
                  ${fileEdit.sync_warnings
                    ? html`
                        <div class="alert alert-warning" role="alert">
                          <h2 class="h5 alert-heading">Sync warning</h2>
                          <p>
                            There were one or more warnings in this file the last time you tried to
                            sync. These warnings do not prevent this file from being synced, but
                            they should still be fixed. The warnings are listed below.
                          </p>
                          <pre
                            class="text-white rounded p-3 mb-0"
                            style="background-color: black;"
                          ><code>${unsafeHtml(fileEdit.sync_warnings_ansified)}</code></pre>
                        </div>
                      `
                    : ''}

                  <form name="editor-form" method="POST">
                    <input type="hidden" name="__csrf_token" value="${__csrf_token}" />

                    <div class="card mb-4">
                      <div class="card-header bg-primary">
                        <div class="row align-items-center justify-content-between">
                          <div class="col-auto">
                            <span class="text-monospace text-white d-flex">
                              ${joinHtml(
                                fileEdit.paths.branch.map((dir) =>
                                  dir.canView
                                    ? html`
                                        <a
                                          class="text-white"
                                          href="${fileEdit.paths.urlPrefix}/file_view/${encodePath(
                                            dir.path,
                                          )}"
                                        >
                                          ${dir.name}
                                        </a>
                                      `
                                    : html`<span>${dir.name}</span>`,
                                ),
                                html`<span class="mx-2">/</span>`,
                              )}
                            </span>
                          </div>
                          <div
                            class="col-auto collapse ${!fileEdit.failedPush && !fileEdit.alertChoice
                              ? 'show'
                              : ''}"
                            id="buttons"
                          >
                            <button
                              type="button"
                              id="help-button"
                              class="btn btn-light btn-sm"
                              data-toggle="collapse"
                              data-target="#help"
                              aria-expanded="false"
                            >
                              <i class="far fa-question-circle" aria-hidden="true"></i>
                              <span id="help-button-label">Show help</span>
                            </button>
                            <button
                              id="file-editor-save-button"
                              name="__action"
                              value="save_and_sync"
                              class="btn btn-light btn-sm"
                              disabled
                            >
                              <i class="fas fa-save" aria-hidden="true"></i>
                              Save and sync
                            </button>
                          </div>
                        </div>
                      </div>
                      <div class="collapse" id="help">
                        <div class="card-body">
                          You are editing the file <code>${fileEdit.fileNameForDisplay}</code>. To
                          save changes, click <strong>Save and sync</strong> or use
                          <strong>Ctrl-S</strong> (Windows/Linux) or <strong>Cmd-S</strong> (Mac).
                          ${config.fileEditorUseGit
                            ? html`
                                Doing so will write your changes to disk, will push them to the
                                remote GitHub repository, and will sync them to the database.
                              `
                            : html`
                                Doing so will write your changes to disk and will sync them to your
                                local database. You will need to push these changes to the GitHub
                                respository manually (i.e., not in PrairieLearn), if desired.
                              `}
                          If you reload or navigate away from this page, any unsaved changes will be
                          lost.
                        </div>
                      </div>
                      <div class="card-body p-0 row">
                        <div class="container-fluid">
                          ${fileEdit.alertResults
                            ? html`
                                <div
                                  class="alert ${fileEdit.didSave && fileEdit.didSync
                                    ? 'alert-success'
                                    : 'alert-danger'} alert-dismissible fade show m-2"
                                  role="alert"
                                >
                                  <div class="row align-items-center">
                                    <div class="col-auto">
                                      ${fileEdit.didSave
                                        ? fileEdit.didSync
                                          ? 'File was both saved and synced successfully.'
                                          : 'File was saved, but failed to sync.'
                                        : 'Failed to save and sync file.'}
                                    </div>
                                    ${fileEdit.jobSequenceId != null
                                      ? html`
                                          <div class="col-auto">
                                            <button
                                              type="button"
                                              class="btn btn-secondary btn-sm"
                                              data-toggle="collapse"
                                              data-target="#job-sequence-results"
                                              id="job-sequence-results-button"
                                            >
                                              Show detail
                                            </button>
                                          </div>
                                        `
                                      : ''}
                                    <button
                                      type="button"
                                      class="close"
                                      data-dismiss="alert"
                                      aria-label="Close"
                                    >
                                      <span aria-hidden="true">&times;</span>
                                    </button>
                                  </div>
                                  ${fileEdit.jobSequenceId != null
                                    ? html`
                                        <div class="row collapse mt-4" id="job-sequence-results">
                                          <div class="card card-body">
                                            ${renderEjs(
                                              import.meta.url,
                                              "<%- include('../partials/jobSequenceResults'); %>",
                                              {
                                                ...resLocals,
                                                job_sequence: fileEdit.jobSequence,
                                                job_sequence_enable_live_update: false,
                                              },
                                            )}
                                          </div>
                                        </div>
                                      `
                                    : ''}
                                </div>
                              `
                            : ''}
                          ${fileEdit.alertChoice
                            ? html`
                                <div
                                  class="alert alert-danger alert-dismissible fade show m-2 js-version-choice-content"
                                  role="alert"
                                >
                                  ${fileEdit.hasSameHash
                                    ? 'You were editing this file and made changes.'
                                    : 'Both you and another user made changes to this file.'}
                                  You may choose either to continue editing your draft or to discard
                                  your changes. In particular, if you click
                                  <strong>Choose my version</strong> and then click
                                  <strong>Save and sync</strong>, you will overwrite the version of
                                  this file that is on disk. If you instead click
                                  <strong>Choose their version</strong>, any changes you have made
                                  to this file will be lost.
                                  <button
                                    type="button"
                                    class="close"
                                    data-dismiss="alert"
                                    aria-label="Close"
                                  >
                                    <span aria-hidden="true">&times;</span>
                                  </button>
                                </div>
                              `
                            : ''}
                        </div>

                        <div
                          id="file-editor-draft"
                          class="col"
                          data-contents="${fileEdit.editContents}"
                          data-ace-mode="${fileEdit.aceMode}"
                          data-read-only="${fileEdit.alertChoice}"
                        >
                          <div class="card p-0">
                            ${fileEdit.alertChoice
                              ? html`
                                  <div class="card-header text-center js-version-choice-content">
                                    <h4 class="mb-4">My version</h4>
                                    <button
                                      id="choose-my-version-button"
                                      class="btn btn-primary"
                                      type="button"
                                    >
                                      Choose my version (continue editing)
                                    </button>
                                  </div>
                                `
                              : ''}
                            <div class="card-body p-0">
                              <input
                                type="hidden"
                                name="file_edit_user_id"
                                value="${fileEdit.userID}"
                              />
                              <input
                                type="hidden"
                                name="file_edit_course_id"
                                value="${fileEdit.courseID}"
                              />
                              <input
                                type="hidden"
                                name="file_edit_orig_hash"
                                value="${fileEdit.diskHash}"
                              />
                              <input type="hidden" name="file_edit_contents" />
                              <div class="editor"></div>
                            </div>
                          </div>
                        </div>
                        ${fileEdit.alertChoice
                          ? html`
                              <div
                                id="file-editor-disk"
                                class="col js-version-choice-content"
                                data-contents="${fileEdit.diskContents}"
                                data-ace-mode="${fileEdit.aceMode}"
                              >
                                <div class="card p-0">
                                  <div class="card-header text-center">
                                    <h4 class="mb-4">Their version</h4>
                                    <button
                                      class="btn btn-primary"
                                      type="button"
                                      onClick="window.location.reload()"
                                    >
                                      Choose their version (discard my changes)
                                    </button>
                                  </div>
                                  <div class="card-body p-0">
                                    <div class="editor"></div>
                                  </div>
                                </div>
                              </div>
                            `
                          : ''}
                      </div>
                    </div>
                  </form>
                `}
        </main>
      </body>
    </html>
  `.toString();
}
