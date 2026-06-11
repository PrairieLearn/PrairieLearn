import type ace from 'ace-builds';
import type * as bootstrap from 'bootstrap';
import prettierBabelPlugin from 'prettier/plugins/babel';
import prettierEstreePlugin from 'prettier/plugins/estree';
import * as prettier from 'prettier/standalone';
import { Fragment, type SubmitEvent, useCallback, useRef, useState } from 'react';
import { Alert, Collapse, Modal } from 'react-bootstrap';

import { run } from '@prairielearn/run';
import { assertNever } from '@prairielearn/utils';

import { AceFileEditor, type AceFileEditorHandle } from '../../components/AceFileEditor.js';
import { JobSequenceResults } from '../../components/JobSequenceResults.js';
import { b64DecodeUnicode, b64EncodeUnicode } from '../../lib/base64-util.js';
import { type FileMetadata, FileType } from '../../lib/editorUtil.shared.js';
import type { EditOutcome } from '../../lib/editors.js';
import type { StaffJobSequenceWithJobs } from '../../lib/server-jobs.types.js';

declare global {
  interface Window {
    bootstrap: typeof bootstrap;
  }
}

export interface FileEditorData {
  fileName: string;
  normalizedFileName: string;
  aceMode: string;
  diskContents: string;
  diskHash: string;
  fileMetadata?: FileMetadata;
  lintHtmlMustache: boolean;
}

enum SaveErrorCode {
  INVALID_JSON = 'INVALID_JSON',
  UUID_CHANGED = 'UUID_CHANGED',
  UUID_REMOVED = 'UUID_REMOVED',
}

function InvalidJsonModalContent() {
  return (
    <div className="alert alert-danger d-flex flex-column align-items-start mb-0">
      <div className="d-flex flex-row align-items-start gap-2 mb-1">
        <i className="bi bi-x-circle-fill fs-6" />
        <strong>Invalid JSON</strong>
      </div>
      <div>
        This file contains invalid JSON syntax and cannot be saved. Please fix the errors before
        saving.
      </div>
    </div>
  );
}

function UuidChangeModalContent({
  errorCode,
  originalUuid,
  newUuid,
}: {
  errorCode: SaveErrorCode.UUID_CHANGED | SaveErrorCode.UUID_REMOVED;
  originalUuid?: string;
  newUuid?: string;
}) {
  return (
    <>
      <div className="alert alert-warning d-flex flex-column mb-3">
        <div className="d-flex flex-row align-items-start gap-2 mb-1">
          <i className="bi bi-exclamation-triangle-fill fs-6" />
          <strong>UUID change</strong>
        </div>
        <div>
          {run(() => {
            if (errorCode === SaveErrorCode.UUID_CHANGED && originalUuid && newUuid) {
              return (
                <>
                  The UUID in this file was changed from <code>"{originalUuid}"</code> to{' '}
                  <code>"{newUuid}"</code>.
                </>
              );
            } else if (errorCode === SaveErrorCode.UUID_REMOVED) {
              return <>The UUID was removed from this file.</>;
            }
            return <>The UUID was modified.</>;
          })}
        </div>
      </div>
      <div>Clicking "Confirm save" will save this file with its original UUID.</div>
    </>
  );
}

function getCursorOffsetFromCursorPosition(position: ace.Ace.Point, lines: string[]): number {
  const cursorOffset = lines.slice(0, position.row).reduce((acc, line) => acc + line.length + 1, 0);
  return cursorOffset + position.column;
}

function getCursorPositionFromCursorOffset(cursorOffset: number, lines: string[]): ace.Ace.Point {
  let row = 0;
  let column = 0;
  let offset = 0;
  for (const line of lines) {
    if (offset + line.length >= cursorOffset) {
      column = cursorOffset - offset;
      break;
    }
    offset += line.length + 1;
    row += 1;
  }
  return { row, column };
}

type SaveIssue =
  | { errorCode: SaveErrorCode.INVALID_JSON }
  | {
      errorCode: SaveErrorCode.UUID_CHANGED | SaveErrorCode.UUID_REMOVED;
      originalUuid: string;
      newUuid?: string;
      /** The parsed file, reused to rebuild it with the original UUID restored. */
      parsedContent: Record<string, unknown>;
    };

function getSaveIssue(contents: string, editorData: FileEditorData): SaveIssue | null {
  if (!editorData.fileMetadata || editorData.fileMetadata.type === FileType.File) return null;

  let parsedContent: unknown;
  try {
    parsedContent = JSON.parse(contents);
  } catch {
    return { errorCode: SaveErrorCode.INVALID_JSON };
  }
  if (typeof parsedContent !== 'object' || parsedContent == null || Array.isArray(parsedContent)) {
    return { errorCode: SaveErrorCode.INVALID_JSON };
  }

  const originalUuid = editorData.fileMetadata.uuid;
  if (!originalUuid) return null;

  const content = parsedContent as Record<string, unknown>;
  if (!('uuid' in content)) {
    return { errorCode: SaveErrorCode.UUID_REMOVED, originalUuid, parsedContent: content };
  }
  if (typeof content.uuid !== 'string') {
    return { errorCode: SaveErrorCode.UUID_CHANGED, originalUuid, parsedContent: content };
  }
  if (content.uuid.toLowerCase() !== originalUuid.toLowerCase()) {
    return {
      errorCode: SaveErrorCode.UUID_CHANGED,
      originalUuid,
      newUuid: content.uuid,
      parsedContent: content,
    };
  }
  return null;
}

/**
 * Rebuilds a metadata file with its original UUID restored, reformatted with
 * Prettier so a confirmed UUID-restore save keeps the file's formatting instead
 * of collapsing it onto a single line.
 */
async function contentsWithRestoredUuid(
  parsedContent: Record<string, unknown>,
  originalUuid: string,
): Promise<string> {
  // Drop the existing `uuid` so the restored value is re-added as the first key.
  const { uuid: _uuid, ...rest } = parsedContent;
  return await prettier.format(JSON.stringify({ uuid: originalUuid, ...rest }), {
    parser: 'json',
    plugins: [prettierBabelPlugin, prettierEstreePlugin],
  });
}

/**
 * Determines the alert style and message for the save/sync result banner.
 *
 * For a `sync_json_errors` outcome the sync ran to completion but some entity
 * had invalid JSON. We use the edited file's own per-entity `sync_errors` to
 * tell whether THIS file caused the errors vs. some unrelated file, so we can
 * show a specific message instead of a blanket "sync failed" message.
 *
 * `outcome` is undefined when there is a draft but no associated edit job, in
 * which case nothing was saved to disk yet.
 */
function getSyncAlert(
  outcome: EditOutcome | undefined,
  fileMetadata?: FileMetadata,
): { variant: 'success' | 'danger' | 'warning'; message: string } {
  switch (outcome) {
    case undefined:
    case 'save_failed':
      return { variant: 'danger', message: 'Failed to save file.' };
    case 'sync_failed':
      return { variant: 'danger', message: 'File was saved, but the course failed to sync.' };
    case 'sync_json_errors':
      // The file's own entity has sync errors — the user's edit likely caused them.
      if (fileMetadata?.syncErrors) {
        return {
          variant: 'danger',
          message:
            'File was saved, but it contains errors that prevented it from syncing. See the details above.',
        };
      }
      // The sync completed, but some *other* entity has JSON errors. The user's
      // file synced fine — we show a warning so they're not alarmed.
      //
      // TODO: This can be misleading when the user's edit *caused* errors in other
      // entities (e.g., renaming a QID that an assessment references). We'd need to
      // snapshot sync_errors before the sync and diff afterward to distinguish
      // "pre-existing errors" from "errors caused by this edit."
      return {
        variant: 'warning',
        message:
          'File was saved and synced successfully. Other files in this course have sync errors.',
      };
    case 'success':
      return { variant: 'success', message: 'File was saved and synced successfully.' };
    default:
      assertNever(outcome);
  }
}

export function FileEditor({
  editorData,
  draftContents,
  versionChoice,
  draftEditResult,
  timeZone,
  csrfToken,
  fileEditorUseGit,
  branch,
}: {
  editorData: FileEditorData;
  draftContents?: string;
  versionChoice: { hasRemoteChanges: boolean } | null;
  draftEditResult: {
    outcome: EditOutcome | undefined;
    jobSequence: StaffJobSequenceWithJobs | null;
  } | null;
  timeZone: string;
  csrfToken: string;
  fileEditorUseGit: boolean;
  branch: { name: string; path: string; href: string | null }[];
}) {
  const hasVersionChoice = versionChoice != null;
  const diskContents = b64DecodeUnicode(editorData.diskContents);
  const [contents, setContents] = useState(
    b64DecodeUnicode(draftContents ?? editorData.diskContents),
  );
  const [readOnly, setReadOnly] = useState(hasVersionChoice);
  const [showVersionChoice, setShowVersionChoice] = useState(hasVersionChoice);
  const [showVersionChoiceAlert, setShowVersionChoiceAlert] = useState(hasVersionChoice);
  const [saveIssue, setSaveIssue] = useState<SaveIssue | null>(null);
  // The reformatted, UUID-restored contents for a confirmed save; `null` until
  // it has been computed for the current UUID issue.
  const [restoredContents, setRestoredContents] = useState<string | null>(null);
  const [saveModalShown, setSaveModalShown] = useState(false);
  const [helpExpanded, setHelpExpanded] = useState(false);
  const [buttonsExpanded, setButtonsExpanded] = useState(!hasVersionChoice);
  const [showStatusAlert, setShowStatusAlert] = useState(draftEditResult != null);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const editorRef = useRef<AceFileEditorHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const bypassSaveCheckRef = useRef(false);

  const isJson = editorData.aceMode === 'ace/mode/json';

  const reformatJsonFile = useCallback(async () => {
    const editor = editorRef.current?.editor;
    if (!editor) return;

    try {
      const { formatted, cursorOffset } = await prettier.formatWithCursor(editor.getValue(), {
        cursorOffset: getCursorOffsetFromCursorPosition(
          editor.getCursorPosition(),
          editor.getSession().getDocument().getAllLines(),
        ),
        parser: 'json',
        plugins: [prettierBabelPlugin, prettierEstreePlugin],
      });

      editor.setValue(formatted, -1);
      editor.moveCursorToPosition(
        getCursorPositionFromCursorOffset(
          cursorOffset,
          editor.getSession().getDocument().getAllLines(),
        ),
      );
      editor.focus();
    } catch (err) {
      console.error(err);
      window.bootstrap.Toast.getOrCreateInstance('#js-json-reformat-error').show();
    }
  }, []);

  const handleEditorReady = useCallback(
    (editor: ace.Ace.Editor) => {
      if (isJson) {
        editor.getSession().setTabSize(2);
      }

      editor.commands.addCommand({
        name: 'saveAndSync',
        bindKey: { win: 'Ctrl-s', mac: 'Command-s' },
        exec: () => saveButtonRef.current?.click(),
      });

      if (editorData.lintHtmlMustache) {
        document.dispatchEvent(
          new CustomEvent('pl:html-mustache-linter-attach', {
            detail: { editor },
          }),
        );
      }
    },
    [isJson, editorData.lintHtmlMustache],
  );

  const takeOverDraft = () => {
    setShowVersionChoice(false);
    setShowVersionChoiceAlert(false);
    // Clearing `readOnly` re-renders and the `AceFileEditor` prop-sync effect
    // propagates it to Ace; only the resize needs to be imperative.
    setReadOnly(false);
    setButtonsExpanded(true);
    editorRef.current?.resize();
  };

  const discardDraft = () => window.location.reload();

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    if (bypassSaveCheckRef.current) {
      bypassSaveCheckRef.current = false;
      return;
    }

    const issue = getSaveIssue(contents, editorData);
    if (!issue) return;

    event.preventDefault();
    setSaveIssue(issue);
    setSaveModalShown(true);

    // Format the UUID-restored contents while the user reads the modal so they
    // are ready by the time "Confirm save" is clicked.
    if (issue.errorCode !== SaveErrorCode.INVALID_JSON) {
      void contentsWithRestoredUuid(issue.parsedContent, issue.originalUuid).then(
        setRestoredContents,
      );
    }
  };

  const confirmSave = () => {
    // "Confirm save" is enabled only once the UUID-restored contents are ready,
    // so the hidden `file_edit_contents` input already carries them — confirming
    // just needs to bypass re-validation and submit the form.
    bypassSaveCheckRef.current = true;
    formRef.current?.requestSubmit();
  };

  const cancelSave = () => setSaveModalShown(false);

  // The hidden field normally carries the editor contents; for a confirmed
  // UUID-restore save it carries the contents with the original UUID re-inserted
  // and reformatted.
  const contentsToSubmit = restoredContents ?? contents;
  const saveDisabled = readOnly || contents === diskContents;

  return (
    <>
      <form ref={formRef} name="editor-form" method="POST" onSubmit={handleSubmit}>
        <input type="hidden" name="__csrf_token" value={csrfToken} />
        <input type="hidden" name="__action" value="save_and_sync" />
        <div className="card mb-4">
          <div className="card-header bg-primary">
            <div className="row align-items-center justify-content-between">
              <div className="col-auto">
                <span className="font-monospace text-white d-flex">
                  {branch.map((dir, index) => (
                    <Fragment key={dir.path}>
                      {index > 0 ? <span className="mx-2">/</span> : null}
                      {dir.href ? (
                        <a className="text-white" href={dir.href}>
                          {dir.name}
                        </a>
                      ) : (
                        <span>{dir.name}</span>
                      )}
                    </Fragment>
                  ))}
                </span>
              </div>
              <Collapse in={buttonsExpanded}>
                <div className="d-flex flex-wrap gap-2 col-auto">
                  <button
                    type="button"
                    id="help-button"
                    className="btn btn-light btn-sm"
                    aria-expanded={helpExpanded}
                    aria-controls="help"
                    onClick={() => setHelpExpanded((expanded) => !expanded)}
                  >
                    <i className="far fa-question-circle" aria-hidden="true" />{' '}
                    <span>{helpExpanded ? 'Hide help' : 'Show help'}</span>
                  </button>
                  {isJson ? (
                    <button
                      type="button"
                      className="btn btn-light btn-sm"
                      onClick={() => void reformatJsonFile()}
                    >
                      <i className="fas fa-paintbrush" aria-hidden="true" /> Reformat
                    </button>
                  ) : null}
                  {editorData.lintHtmlMustache ? (
                    <button
                      type="button"
                      className="btn btn-light btn-sm js-reformat-html-mustache"
                    >
                      <i className="fas fa-paintbrush" aria-hidden="true" /> Reformat
                    </button>
                  ) : null}
                  <button
                    ref={saveButtonRef}
                    type="submit"
                    className="btn btn-light btn-sm"
                    disabled={saveDisabled}
                  >
                    <i className="fas fa-save" aria-hidden="true" /> Save and sync
                  </button>
                </div>
              </Collapse>
            </div>
          </div>
          <Collapse in={helpExpanded}>
            <div id="help">
              <div className="card-body">
                You are editing the file <code>{editorData.normalizedFileName}</code>. To save
                changes, click <strong>Save and sync</strong> or use <strong>Ctrl-S</strong>{' '}
                (Windows/Linux) or <strong>Cmd-S</strong> (Mac).{' '}
                {fileEditorUseGit
                  ? 'Doing so will write your changes to disk, will push them to the remote GitHub repository, and will sync them to the database.'
                  : 'Doing so will write your changes to disk and will sync them to your local database. You will need to push these changes to the GitHub repository manually (i.e., not in PrairieLearn), if desired.'}{' '}
                If you reload or navigate away from this page, any unsaved changes will be lost.
              </div>
            </div>
          </Collapse>
          <div className="card-body p-0">
            <div className="container-fluid">
              {draftEditResult != null ? (
                <Alert
                  variant={getSyncAlert(draftEditResult.outcome, editorData.fileMetadata).variant}
                  className="m-2"
                  data-testid="save-sync-alert"
                  show={showStatusAlert}
                  dismissible
                  onClose={() => setShowStatusAlert(false)}
                >
                  <div className="row align-items-center">
                    <div className="col-auto">
                      {getSyncAlert(draftEditResult.outcome, editorData.fileMetadata).message}
                    </div>
                    {draftEditResult.jobSequence != null ? (
                      <div className="col-auto">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          aria-expanded={detailExpanded}
                          aria-controls="job-sequence-results"
                          onClick={() => setDetailExpanded((expanded) => !expanded)}
                        >
                          {detailExpanded ? 'Hide detail' : 'Show detail'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {draftEditResult.jobSequence != null ? (
                    <Collapse in={detailExpanded}>
                      <div id="job-sequence-results" className="mt-4">
                        <JobSequenceResults
                          jobSequence={draftEditResult.jobSequence}
                          timeZone={timeZone}
                        />
                      </div>
                    </Collapse>
                  ) : null}
                </Alert>
              ) : null}
              {versionChoice != null ? (
                <Alert
                  variant="danger"
                  className="m-2"
                  show={showVersionChoiceAlert}
                  dismissible
                  onClose={() => setShowVersionChoiceAlert(false)}
                >
                  {versionChoice.hasRemoteChanges
                    ? 'Both you and another user made changes to this file.'
                    : 'You were editing this file and made changes.'}{' '}
                  You may choose either to continue editing your draft or to discard your changes.
                  In particular, if you click <strong>Choose my version</strong> and then click{' '}
                  <strong>Save and sync</strong>, you will overwrite the version of this file that
                  is on disk. If you instead click <strong>Choose their version</strong>, any
                  changes you have made to this file will be lost.
                </Alert>
              ) : null}
            </div>
            <div className="row">
              <div id="file-editor-draft" className="col">
                <div className="card p-0">
                  {showVersionChoice ? (
                    <div className="card-header text-center">
                      <h4 className="mb-4">My version</h4>
                      <button className="btn btn-primary" type="button" onClick={takeOverDraft}>
                        Choose my version (continue editing)
                      </button>
                    </div>
                  ) : null}
                  <div className="card-body p-0 position-relative">
                    <input type="hidden" name="file_edit_orig_hash" value={editorData.diskHash} />
                    <input
                      type="hidden"
                      name="file_edit_contents"
                      value={b64EncodeUnicode(contentsToSubmit)}
                    />
                    <AceFileEditor
                      ref={editorRef}
                      value={contents}
                      mode={editorData.aceMode}
                      readOnly={readOnly}
                      className="editor"
                      options={{
                        autoScrollEditorIntoView: true,
                        maxLines: Infinity,
                        minLines: 10,
                        wrap: true,
                      }}
                      focusOnMount
                      onChange={setContents}
                      onReady={handleEditorReady}
                    />
                    <div
                      aria-live="polite"
                      aria-atomic="true"
                      className="position-absolute m-3"
                      style={{ top: 0, right: 0, zIndex: 10 }}
                    >
                      <div
                        id="js-json-reformat-error"
                        className="toast hide text-bg-danger border-0"
                        role="alert"
                        aria-live="assertive"
                        aria-atomic="true"
                        data-bs-delay="5000"
                      >
                        <div className="d-flex">
                          <div className="toast-body">
                            Error formatting JSON. Please check your JSON syntax.
                          </div>
                          <button
                            type="button"
                            className="btn-close"
                            data-bs-dismiss="toast"
                            aria-label="Close"
                          />
                        </div>
                      </div>
                      {editorData.lintHtmlMustache ? (
                        <div
                          id="js-html-mustache-reformat-error"
                          className="toast hide text-bg-danger border-0"
                          role="alert"
                          aria-live="assertive"
                          aria-atomic="true"
                        >
                          <div className="d-flex">
                            <div className="toast-body">
                              Error reformatting file. Please check the syntax.
                            </div>
                            <button
                              type="button"
                              className="btn-close"
                              data-bs-dismiss="toast"
                              aria-label="Close"
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
              {showVersionChoice ? (
                <div className="col">
                  <div className="card p-0">
                    <div className="card-header text-center">
                      <h4 className="mb-4">Their version</h4>
                      <button className="btn btn-primary" type="button" onClick={discardDraft}>
                        Choose their version (discard my changes)
                      </button>
                    </div>
                    <div className="card-body p-0">
                      <AceFileEditor
                        value={diskContents}
                        mode={editorData.aceMode}
                        className="editor"
                        options={{
                          autoScrollEditorIntoView: true,
                          maxLines: Infinity,
                          minLines: 10,
                          wrap: true,
                        }}
                        readOnly
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </form>

      <Modal
        show={saveModalShown}
        aria-labelledby="save-confirmation-modal-title"
        onHide={cancelSave}
        onExited={() => {
          setSaveIssue(null);
          setRestoredContents(null);
        }}
      >
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="h4" id="save-confirmation-modal-title">
            {saveIssue?.errorCode === SaveErrorCode.INVALID_JSON ? 'Cannot save' : 'Confirm save'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {saveIssue?.errorCode === SaveErrorCode.INVALID_JSON ? (
            <InvalidJsonModalContent />
          ) : saveIssue ? (
            <UuidChangeModalContent
              errorCode={saveIssue.errorCode}
              originalUuid={saveIssue.originalUuid}
              newUuid={saveIssue.newUuid}
            />
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className={
              saveIssue?.errorCode === SaveErrorCode.INVALID_JSON
                ? 'btn btn-primary'
                : 'btn btn-secondary'
            }
            onClick={cancelSave}
          >
            {saveIssue?.errorCode === SaveErrorCode.INVALID_JSON ? 'OK' : 'Cancel'}
          </button>
          {saveIssue?.errorCode === SaveErrorCode.INVALID_JSON ? null : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={restoredContents == null}
              onClick={confirmSave}
            >
              Confirm save
            </button>
          )}
        </Modal.Footer>
      </Modal>
    </>
  );
}

FileEditor.displayName = 'FileEditor';
