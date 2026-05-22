import type ace from 'ace-builds';
import prettierBabelPlugin from 'prettier/plugins/babel';
import prettierEstreePlugin from 'prettier/plugins/estree';
import * as prettier from 'prettier/standalone';
import { type FormEvent, Fragment, useCallback, useRef, useState } from 'react';
import { Alert, Collapse, Modal } from 'react-bootstrap';

import { run } from '@prairielearn/run';

import { AceFileEditor, type AceFileEditorHandle } from '../../components/AceFileEditor.js';
import { b64DecodeUnicode, b64EncodeUnicode } from '../../lib/base64-util.js';
import { FileType } from '../../lib/editorUtil.shared.js';

import type { FileEditorData } from './instructorFileEditor.types.js';

interface BootstrapApi {
  Toast: {
    getOrCreateInstance: (target: Element | string) => { show: () => void };
  };
}

function getBootstrap() {
  return (window as typeof window & { bootstrap: BootstrapApi }).bootstrap;
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

function getSaveIssue(contents: string, editorData: FileEditorData) {
  if (!editorData.fileMetadata || editorData.fileMetadata.type === FileType.File) return null;

  try {
    const parsedContent: unknown = JSON.parse(contents);

    if (
      typeof parsedContent !== 'object' ||
      parsedContent == null ||
      Array.isArray(parsedContent)
    ) {
      return { errorCode: SaveErrorCode.INVALID_JSON };
    } else if (editorData.fileMetadata.uuid) {
      if ('uuid' in parsedContent) {
        if (typeof parsedContent.uuid !== 'string') {
          return {
            errorCode: SaveErrorCode.UUID_CHANGED,
            originalUuid: editorData.fileMetadata.uuid,
          };
        }
        if (parsedContent.uuid.toLowerCase() !== editorData.fileMetadata.uuid.toLowerCase()) {
          return {
            errorCode: SaveErrorCode.UUID_CHANGED,
            originalUuid: editorData.fileMetadata.uuid,
            newUuid: parsedContent.uuid,
          };
        }
      } else {
        return {
          errorCode: SaveErrorCode.UUID_REMOVED,
          originalUuid: editorData.fileMetadata.uuid,
        };
      }
    }
  } catch {
    return { errorCode: SaveErrorCode.INVALID_JSON };
  }

  return null;
}

function getContentsWithRestoredUuid(contents: string, editorData: FileEditorData) {
  if (!editorData.fileMetadata?.uuid) return contents;

  const parsedContent: unknown = JSON.parse(contents);
  if (typeof parsedContent !== 'object' || parsedContent == null || Array.isArray(parsedContent)) {
    return contents;
  }

  const parsedObject = parsedContent as Record<string, unknown>;
  const { uuid: _uuid, ...rest } = parsedObject;
  return JSON.stringify({ uuid: editorData.fileMetadata.uuid, ...rest });
}

export function InstructorFileEditorClient({
  editorData,
  draftContents,
  versionChoice,
  csrfToken,
  fileEditorUseGit,
  branch,
}: {
  editorData: FileEditorData;
  draftContents?: string;
  versionChoice: { hasRemoteChanges: boolean } | null;
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
  const [saveIssue, setSaveIssue] = useState<ReturnType<typeof getSaveIssue>>(null);
  const [saveModalShown, setSaveModalShown] = useState(false);
  const [helpExpanded, setHelpExpanded] = useState(false);
  const [buttonsExpanded, setButtonsExpanded] = useState(!hasVersionChoice);
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
      getBootstrap().Toast.getOrCreateInstance('#js-json-reformat-error').show();
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
    setReadOnly(false);
    setButtonsExpanded(true);
    editorRef.current?.setReadOnly(false);
    editorRef.current?.resize();
  };

  const discardDraft = () => window.location.reload();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (bypassSaveCheckRef.current) {
      bypassSaveCheckRef.current = false;
      return;
    }

    const issue = getSaveIssue(contents, editorData);
    if (issue) {
      event.preventDefault();
      setSaveIssue(issue);
      setSaveModalShown(true);
    }
  };

  const confirmSave = () => {
    // While the UUID modal is open, the hidden `file_edit_contents` input is
    // already rendered with the restored contents, so confirming just needs to
    // bypass re-validation and submit the form.
    bypassSaveCheckRef.current = true;
    formRef.current?.requestSubmit();
  };

  const cancelSave = () => setSaveModalShown(false);

  const hasUuidIssue = saveIssue != null && saveIssue.errorCode !== SaveErrorCode.INVALID_JSON;
  // When the UUID modal is open, the form submits with the original UUID
  // restored; otherwise it submits exactly what the editor contains.
  const contentsToSubmit = hasUuidIssue
    ? getContentsWithRestoredUuid(contents, editorData)
    : contents;
  const saveDisabled = readOnly || contents === diskContents;

  return (
    <>
      <Alert
        variant="danger"
        show={showVersionChoiceAlert}
        dismissible
        onClose={() => setShowVersionChoiceAlert(false)}
      >
        {versionChoice?.hasRemoteChanges
          ? 'Both you and another user made changes to this file.'
          : 'You were editing this file and made changes.'}{' '}
        You may choose either to continue editing your draft or to discard your changes. In
        particular, if you click <strong>Choose my version</strong> and then click{' '}
        <strong>Save and sync</strong>, you will overwrite the version of this file that is on disk.
        If you instead click <strong>Choose their version</strong>, any changes you have made to
        this file will be lost.
      </Alert>
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
                <div className="d-flex flex-wrap gap-2 col-auto" id="buttons">
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
            <div className="row">
              <div
                id="file-editor-draft"
                className="col"
                data-contents={draftContents ?? editorData.diskContents}
                data-ace-mode={editorData.aceMode}
                data-read-only={hasVersionChoice}
                data-file-metadata={
                  editorData.fileMetadata ? JSON.stringify(editorData.fileMetadata) : ''
                }
                data-lint-html-mustache={editorData.lintHtmlMustache}
              >
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
                <div
                  id="file-editor-disk"
                  className="col"
                  data-contents={editorData.diskContents}
                  data-ace-mode={editorData.aceMode}
                  data-file-metadata={
                    editorData.fileMetadata ? JSON.stringify(editorData.fileMetadata) : ''
                  }
                >
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
        onExited={() => setSaveIssue(null)}
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
            <button type="button" className="btn btn-primary" onClick={confirmSave}>
              Confirm save
            </button>
          )}
        </Modal.Footer>
      </Modal>
    </>
  );
}

InstructorFileEditorClient.displayName = 'InstructorFileEditorClient';
