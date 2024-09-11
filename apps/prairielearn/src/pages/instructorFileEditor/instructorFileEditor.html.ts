import { AnsiUp } from 'ansi_up';

import { html, joinHtml, unsafeHtml } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { JobSequenceResults } from '../../components/JobSequenceResults.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { compiledScriptTag, nodeModulesAssetPath } from '../../lib/assets.js';
import { config } from '../../lib/config.js';
import type { FileEdit } from '../../lib/db-types.js';
import type { InstructorFilePaths } from '../../lib/instructorFiles.js';
import type { JobSequenceWithTokens } from '../../lib/server-jobs.types.js';
import { encodePath } from '../../lib/uri-util.js';

export interface FileEditorData {
  fileName: string;
  normalizedFileName: string;
  aceMode: string;
  diskContents: string;
  diskHash: string;
  sync_errors: string | null;
  sync_warnings: string | null;
}

export interface DraftEdit {
  fileEdit: FileEdit;
  contents: string | undefined;
  hash: string | undefined;
  jobSequence?: JobSequenceWithTokens;
  alertChoice?: boolean;
  didSave?: boolean;
  didSync?: boolean;
}

export function InstructorFileEditor({
  resLocals,
  editorData,
  paths,
  draftEdit,
}: {
  resLocals: Record<string, any>;
  editorData: FileEditorData;
  paths: InstructorFilePaths;
  draftEdit: DraftEdit | null;
}) {
  const { course, __csrf_token } = resLocals;
  const ansiUp = new AnsiUp();

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        <meta
          name="ace-base-path"
          content="${nodeModulesAssetPath('ace-builds/src-min-noconflict/')}"
        />
        ${HeadContents({ resLocals, pageTitle: `Edit ${editorData.fileName}` })}
        ${compiledScriptTag('instructorFileEditorClient.ts')}
      </head>

      <body>
        ${Navbar({ resLocals })}

        <main id="content" class="container-fluid">
          ${editorData.sync_errors
            ? html`
                <div class="alert alert-danger" role="alert">
                  <h2 class="h5 alert-heading">Sync error</h2>
                  <p>
                    There were one or more errors in this file the last time you tried to sync. This
                    file will not be able to be synced until the errors are corrected. The errors
                    are listed below.
                  </p>
                  <pre
                    class="text-white rounded p-3 mb-0"
                    style="background-color: black;"
                  ><code>${unsafeHtml(ansiUp.ansi_to_html(editorData.sync_errors))}</code></pre>
                </div>
              `
            : ''}
          ${editorData.sync_warnings
            ? html`
                <div class="alert alert-warning" role="alert">
                  <h2 class="h5 alert-heading">Sync warning</h2>
                  <p>
                    There were one or more warnings in this file the last time you tried to sync.
                    These warnings do not prevent this file from being synced, but they should still
                    be fixed. The warnings are listed below.
                  </p>
                  <pre
                    class="text-white rounded p-3 mb-0"
                    style="background-color: black;"
                  ><code>${unsafeHtml(ansiUp.ansi_to_html(editorData.sync_warnings))}</code></pre>
                </div>
              `
            : ''}
          <h1 class="sr-only">File editor</h1>

          <form name="editor-form" method="POST">
            <input type="hidden" name="__csrf_token" value="${__csrf_token}" />

            <div class="card mb-4">
              <div class="card-header bg-primary">
                <div class="row align-items-center justify-content-between">
                  <div class="col-auto">
                    <span class="text-monospace text-white d-flex">
                      ${joinHtml(
                        paths.branch.map((dir) =>
                          dir.canView
                            ? html`
                                <a
                                  class="text-white"
                                  href="${paths.urlPrefix}/file_view/${encodePath(dir.path)}"
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
                    class="col-auto collapse ${!draftEdit?.alertChoice ? 'show' : ''}"
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
                    ${editorData.aceMode === 'ace/mode/json'
                      ? html`
                          <button type="button" class="btn btn-light btn-sm js-reformat-file">
                            <i class="fas fa-paintbrush" aria-hidden="true"></i>
                            Reformat
                          </button>
                        `
                      : ''}
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
                  You are editing the file <code>${editorData.normalizedFileName}</code>. To save
                  changes, click <strong>Save and sync</strong> or use
                  <strong>Ctrl-S</strong> (Windows/Linux) or <strong>Cmd-S</strong> (Mac).
                  ${config.fileEditorUseGit
                    ? html`
                        Doing so will write your changes to disk, will push them to the remote
                        GitHub repository, and will sync them to the database.
                      `
                    : html`
                        Doing so will write your changes to disk and will sync them to your local
                        database. You will need to push these changes to the GitHub respository
                        manually (i.e., not in PrairieLearn), if desired.
                      `}
                  If you reload or navigate away from this page, any unsaved changes will be lost.
                </div>
              </div>
              <div class="card-body p-0 row">
                <div class="container-fluid">
                  ${draftEdit != null
                    ? html`
                        <div
                          class="alert ${draftEdit.didSave && draftEdit.didSync
                            ? 'alert-success'
                            : 'alert-danger'} alert-dismissible fade show m-2"
                          role="alert"
                        >
                          <div class="row align-items-center">
                            <div class="col-auto">
                              ${draftEdit.didSave
                                ? draftEdit.didSync
                                  ? 'File was both saved and synced successfully.'
                                  : 'File was saved, but failed to sync.'
                                : 'Failed to save and sync file.'}
                            </div>
                            ${draftEdit.jobSequence != null
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
                          ${draftEdit.jobSequence != null
                            ? html`
                                <div class="row collapse mt-4" id="job-sequence-results">
                                  <div class="card card-body">
                                    ${JobSequenceResults({
                                      course,
                                      jobSequence: draftEdit.jobSequence,
                                    })}
                                  </div>
                                </div>
                              `
                            : ''}
                        </div>
                      `
                    : ''}
                  ${draftEdit?.alertChoice
                    ? html`
                        <div
                          class="alert alert-danger alert-dismissible fade show m-2 js-version-choice-content"
                          role="alert"
                        >
                          ${draftEdit.fileEdit.orig_hash === editorData.diskHash
                            ? 'You were editing this file and made changes.'
                            : 'Both you and another user made changes to this file.'}
                          You may choose either to continue editing your draft or to discard your
                          changes. In particular, if you click
                          <strong>Choose my version</strong> and then click
                          <strong>Save and sync</strong>, you will overwrite the version of this
                          file that is on disk. If you instead click
                          <strong>Choose their version</strong>, any changes you have made to this
                          file will be lost.
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
                  data-contents="${draftEdit?.contents ?? editorData.diskContents}"
                  data-ace-mode="${editorData.aceMode}"
                  data-read-only="${!!draftEdit?.alertChoice}"
                >
                  <div class="card p-0">
                    ${draftEdit?.alertChoice
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
                    <div class="card-body p-0 position-relative">
                      <input
                        type="hidden"
                        name="file_edit_orig_hash"
                        value="${editorData.diskHash}"
                      />
                      <input type="hidden" name="file_edit_contents" />
                      <div class="editor"></div>
                      <div
                        aria-live="polite"
                        aria-atomic="true"
                        class="position-absolute m-3"
                        style="top: 0; right: 0; z-index: 10;"
                      >
                        <div
                          id="js-json-reformat-error"
                          class="toast hide text-bg-danger border-0"
                          role="alert"
                          aria-live="assertive"
                          aria-atomic="true"
                        >
                          <div class="d-flex">
                            <div class="toast-body">
                              Error formatting JSON. Please check your JSON syntax.
                            </div>
                            <button
                              type="button"
                              class="mr-2 m-auto btn-close-white close"
                              data-dismiss="toast"
                              aria-label="Close"
                            >
                              <span aria-hidden="true">&times;</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                ${draftEdit?.alertChoice
                  ? html`
                      <div
                        id="file-editor-disk"
                        class="col js-version-choice-content"
                        data-contents="${editorData.diskContents}"
                        data-ace-mode="${editorData.aceMode}"
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
        </main>
      </body>
    </html>
  `.toString();
}
