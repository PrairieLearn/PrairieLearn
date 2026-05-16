import ace from 'ace-builds';
import prettierBabelPlugin from 'prettier/plugins/babel';
import prettierEstreePlugin from 'prettier/plugins/estree';
import * as prettier from 'prettier/standalone';
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { run } from '@prairielearn/run';

import { AceFileEditor, type AceFileEditorHandle } from '../../components/AceFileEditor.js';
import { b64DecodeUnicode, b64EncodeUnicode } from '../../lib/base64-util.js';
import { FileType } from '../../lib/editorUtil.shared.js';

import type { FileEditorData } from './instructorFileEditor.types.js';

type BootstrapComponent = {
  show: () => void;
  hide: () => void;
};

type BootstrapApi = {
  Collapse: {
    getOrCreateInstance: (target: Element | string) => BootstrapComponent;
  };
  Modal: {
    getOrCreateInstance: (target: Element | string) => BootstrapComponent;
  };
  Toast: {
    getOrCreateInstance: (
      target: Element | string,
      options?: { delay?: number },
    ) => Pick<BootstrapComponent, 'show'>;
  };
};

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
  hasVersionChoice,
}: {
  editorData: FileEditorData;
  draftContents?: string;
  hasVersionChoice: boolean;
}) {
  const diskContents = b64DecodeUnicode(editorData.diskContents);
  const [contents, setContents] = useState(
    b64DecodeUnicode(draftContents ?? editorData.diskContents),
  );
  const [readOnly, setReadOnly] = useState(hasVersionChoice);
  const [showVersionChoice, setShowVersionChoice] = useState(hasVersionChoice);
  const [saveIssue, setSaveIssue] = useState<ReturnType<typeof getSaveIssue>>(null);
  const editorRef = useRef<AceFileEditorHandle>(null);
  const bypassNextSaveCheckRef = useRef(false);

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

  const updateHiddenInput = useCallback((nextContents: string) => {
    const inputContentsElement = document.querySelector<HTMLInputElement>(
      'input[name=file_edit_contents]',
    );
    if (inputContentsElement) {
      inputContentsElement.value = b64EncodeUnicode(nextContents);
    }
  }, []);

  useEffect(() => {
    updateHiddenInput(contents);
  }, [contents, updateHiddenInput]);

  // External page controls are still server-rendered, so this effect wires them to React state.
  useEffect(() => {
    const saveElement = document.querySelector<HTMLButtonElement>('#file-editor-save-button');
    if (!saveElement) return;

    saveElement.disabled = readOnly || contents === diskContents;

    const handleSaveClick = (event: MouseEvent) => {
      if (bypassNextSaveCheckRef.current) {
        bypassNextSaveCheckRef.current = false;
        return;
      }

      const issue = getSaveIssue(contents, editorData);
      if (issue) {
        event.preventDefault();
        setSaveIssue(issue);
      }
    };

    saveElement.addEventListener('click', handleSaveClick);
    return () => saveElement.removeEventListener('click', handleSaveClick);
  }, [contents, diskContents, editorData, readOnly]);

  // Bootstrap owns modal visibility, so React updates content and asks Bootstrap to show it.
  useEffect(() => {
    if (!saveIssue) return;

    const modalElement = document.getElementById('save-confirmation-modal');
    if (!modalElement) return;

    getBootstrap().Modal.getOrCreateInstance(modalElement).show();
  }, [saveIssue]);

  useEffect(() => {
    const modalElement = document.getElementById('save-confirmation-modal');
    if (!modalElement) return;

    const handleHidden = () => setSaveIssue(null);
    modalElement.addEventListener('hidden.bs.modal', handleHidden);
    return () => modalElement.removeEventListener('hidden.bs.modal', handleHidden);
  }, []);

  // These controls live outside the hydrated component in the legacy page shell.
  useEffect(() => {
    const showDetail = document.getElementById('job-sequence-results');
    const showDetailButton = document.getElementById('job-sequence-results-button');
    if (showDetail && showDetailButton) {
      const handleHide = () => {
        showDetailButton.textContent = 'Show detail';
        showDetailButton.ariaExpanded = 'false';
      };
      const handleShow = () => {
        showDetailButton.textContent = 'Hide detail';
        showDetailButton.ariaExpanded = 'true';
      };
      showDetail.addEventListener('hide.bs.collapse', handleHide);
      showDetail.addEventListener('show.bs.collapse', handleShow);

      return () => {
        showDetail.removeEventListener('hide.bs.collapse', handleHide);
        showDetail.removeEventListener('show.bs.collapse', handleShow);
      };
    }
  }, []);

  useEffect(() => {
    const helpBox = document.getElementById('help');
    const helpButton = document.getElementById('help-button');
    const helpButtonLabel = document.getElementById('help-button-label');
    if (helpBox && helpButton && helpButtonLabel) {
      const handleHide = () => {
        helpButtonLabel.textContent = 'Show help';
        helpButton.ariaExpanded = 'false';
      };
      const handleShow = () => {
        helpButtonLabel.textContent = 'Hide help';
        helpButton.ariaExpanded = 'true';
      };
      helpBox.addEventListener('hide.bs.collapse', handleHide);
      helpBox.addEventListener('show.bs.collapse', handleShow);

      return () => {
        helpBox.removeEventListener('hide.bs.collapse', handleHide);
        helpBox.removeEventListener('show.bs.collapse', handleShow);
      };
    }
  }, []);

  useEffect(() => {
    if (editorData.aceMode !== 'ace/mode/json') return;

    getBootstrap().Toast.getOrCreateInstance('#js-json-reformat-error', { delay: 5000 });
    const reformatButton = document.querySelector<HTMLButtonElement>('.js-reformat-file');
    if (!reformatButton) return;

    const handleClick = () => void reformatJsonFile();
    reformatButton.addEventListener('click', handleClick);
    return () => reformatButton.removeEventListener('click', handleClick);
  }, [editorData.aceMode, reformatJsonFile]);

  const handleEditorReady = useCallback(
    (editor: ace.Ace.Editor) => {
      if (editorData.aceMode === 'ace/mode/json') {
        editor.getSession().setTabSize(2);
      }

      editor.commands.addCommand({
        name: 'saveAndSync',
        bindKey: { win: 'Ctrl-s', mac: 'Command-s' },
        exec: () => {
          document.querySelector<HTMLButtonElement>('#file-editor-save-button')?.click();
        },
      });

      if (editorData.lintHtmlMustache) {
        document.dispatchEvent(
          new CustomEvent('pl:html-mustache-linter-attach', {
            detail: { editor },
          }),
        );
      }
    },
    [editorData.aceMode, editorData.lintHtmlMustache],
  );

  const takeOverDraft = () => {
    setShowVersionChoice(false);
    setReadOnly(false);
    getBootstrap().Collapse.getOrCreateInstance('#buttons').show();
    editorRef.current?.setReadOnly(false);
    editorRef.current?.resize();
  };

  const discardDraft = () => window.location.reload();

  const confirmSave = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const restoredContents = getContentsWithRestoredUuid(contents, editorData);
    const modalElement = document.getElementById('save-confirmation-modal');
    if (modalElement) getBootstrap().Modal.getOrCreateInstance(modalElement).hide();
    bypassNextSaveCheckRef.current = true;
    setContents(restoredContents);
    updateHiddenInput(restoredContents);
    document.querySelector<HTMLButtonElement>('#file-editor-save-button')?.click();
  };

  const cancelSave = () => setSaveIssue(null);

  return (
    <>
      <div
        id="file-editor-draft"
        className="col"
        data-contents={draftContents ?? editorData.diskContents}
        data-ace-mode={editorData.aceMode}
        data-read-only={hasVersionChoice}
        data-file-metadata={editorData.fileMetadata ? JSON.stringify(editorData.fileMetadata) : ''}
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
            <input type="hidden" name="file_edit_contents" value={b64EncodeUnicode(contents)} />
            <AceFileEditor
              ref={editorRef}
              value={contents}
              mode={editorData.aceMode}
              readOnly={readOnly}
              focusOnMount
              className="editor"
              options={{
                autoScrollEditorIntoView: true,
                maxLines: Infinity,
                minLines: 10,
                wrap: true,
              }}
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
                readOnly
                className="editor"
                options={{
                  autoScrollEditorIntoView: true,
                  maxLines: Infinity,
                  minLines: 10,
                  wrap: true,
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div
        className="modal fade"
        tabIndex={-1}
        role="dialog"
        id="save-confirmation-modal"
        aria-labelledby="save-confirmation-modal-title"
      >
        <div className="modal-dialog" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title h4" id="save-confirmation-modal-title">
                {saveIssue?.errorCode === SaveErrorCode.INVALID_JSON
                  ? 'Cannot save'
                  : 'Confirm save'}
              </h2>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              />
            </div>
            <div className="modal-body">
              {saveIssue?.errorCode === SaveErrorCode.INVALID_JSON ? (
                <InvalidJsonModalContent />
              ) : saveIssue ? (
                <UuidChangeModalContent
                  errorCode={saveIssue.errorCode}
                  originalUuid={saveIssue.originalUuid}
                  newUuid={saveIssue.newUuid}
                />
              ) : null}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className={
                  saveIssue?.errorCode === SaveErrorCode.INVALID_JSON
                    ? 'btn btn-primary'
                    : 'btn btn-secondary'
                }
                data-bs-dismiss="modal"
                id="cancel-save-button"
                onClick={cancelSave}
              >
                {saveIssue?.errorCode === SaveErrorCode.INVALID_JSON ? 'OK' : 'Cancel'}
              </button>
              {saveIssue?.errorCode === SaveErrorCode.INVALID_JSON ? null : (
                <button
                  type="button"
                  className="btn btn-primary"
                  id="confirm-save-button"
                  onClick={confirmSave}
                >
                  Confirm save
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

InstructorFileEditorClient.displayName = 'InstructorFileEditorClient';
