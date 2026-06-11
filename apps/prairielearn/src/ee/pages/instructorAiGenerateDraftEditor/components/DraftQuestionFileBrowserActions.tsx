import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { filesize } from 'filesize';
import { type ReactNode, type SubmitEvent, useState } from 'react';

import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

import { getAppError, renderAppError, syncJobFailedRenderer } from '../../../../lib/client/errors.js';
import { getReservedDraftUploadReason } from '../../../../lib/draft-question-files/paths.shared.js';
import {
  QUESTION_FILE_NAME_PATTERN,
  QUESTION_FILE_NAME_PATTERN_DESCRIPTION,
} from '../../../../lib/short-name.js';
import type { AiDraftFilesError } from '../../../../trpc/shared/ai-draft-files.js';

/**
 * Callbacks that perform draft question file mutations. Each resolves on
 * success and rejects on failure; the rejection is rendered in the action's
 * popover via {@link getAppError}.
 */
/**
 * Where a draft file upload lands: either replacing an exact existing file, or
 * creating a new file under its original name in `directory` (or the question
 * root, when `directory` is `null`).
 */
export type DraftUploadTarget =
  | { kind: 'replace'; filePath: string }
  | { kind: 'new'; directory: string | null };

export interface DraftQuestionFileBrowserActions {
  onUploadFile: (args: { file: File; target: DraftUploadTarget }) => Promise<void>;
  onRenameFile: (args: { oldFilePath: string; newFilePath: string }) => Promise<void>;
  onDeleteFile: (args: { filePath: string }) => Promise<void>;
}

/** Returns the directory portion of a POSIX path relative to the question root. */
function getParentDirectory(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash === -1 ? '' : filePath.slice(0, lastSlash);
}

function DraftFileUploadForm({
  idPrefix,
  infoDirectory,
  maxFileSizeBytes,
  target,
  urlPrefix,
  onCancel,
  onSubmit,
}: {
  idPrefix: string;
  /** When set, a note tells the user the file will be placed in this directory. */
  infoDirectory: string | null;
  maxFileSizeBytes: number;
  target: DraftUploadTarget;
  urlPrefix: string;
  onCancel: () => void;
  onSubmit: (file: File) => Promise<void>;
}) {
  const inputId = `${idPrefix}-file`;
  const errorId = `${idPrefix}-error`;
  const [file, setFile] = useState<File | null>(null);
  const uploadMutation = useMutation({ mutationFn: onSubmit });
  const submitError = getAppError<AiDraftFilesError['Upload']>(uploadMutation.error);

  const reservedReason = run(() => {
    if (file == null) return null;
    const effectivePath = run(() => {
      if (target.kind === 'replace') return target.filePath;
      const dir = target.directory ?? '';
      return dir === '' ? file.name : `${dir}/${file.name}`;
    });
    return getReservedDraftUploadReason(effectivePath);
  });
  const hasError = submitError != null || reservedReason != null;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (file == null || uploadMutation.isPending || reservedReason != null) return;
    uploadMutation.mutate(file);
  }

  return (
    <form className="mb-0" onSubmit={handleSubmit}>
      {infoDirectory != null ? (
        <div className="mb-3">
          This file will be placed in the <code>{infoDirectory}</code> directory.
        </div>
      ) : null}
      <div className="mb-3">
        <label className="form-label" htmlFor={inputId}>
          Choose file
        </label>
        <input
          type="file"
          id={inputId}
          className="form-control"
          aria-invalid={hasError}
          aria-errormessage={hasError ? errorId : undefined}
          required
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <small className="form-text text-muted">
          Max file size: {filesize(maxFileSizeBytes, { base: 10, round: 0 })}
        </small>
      </div>
      {submitError ? (
        <div id={errorId} className="text-danger small mb-3" role="alert">
          {renderAppError(submitError, {
            SYNC_JOB_FAILED: syncJobFailedRenderer(urlPrefix),
            UNKNOWN: ({ message }) => message,
          })}
        </div>
      ) : reservedReason != null ? (
        <div id={errorId} className="text-danger small mb-3" role="alert">
          {reservedReason}
        </div>
      ) : null}
      <div className="text-end justify-content-end gap-2 d-flex flex-wrap">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={uploadMutation.isPending}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={file == null || uploadMutation.isPending || reservedReason != null}
        >
          {uploadMutation.isPending ? 'Uploading...' : 'Upload file'}
        </button>
      </div>
    </form>
  );
}

function DraftFileRenameForm({
  idPrefix,
  fileName,
  oldFilePath,
  urlPrefix,
  onCancel,
  onSubmit,
}: {
  idPrefix: string;
  fileName: string;
  oldFilePath: string;
  urlPrefix: string;
  onCancel: () => void;
  onSubmit: (newFilePath: string) => Promise<void>;
}) {
  const inputId = `${idPrefix}-input`;
  const errorId = `${idPrefix}-error`;
  const [value, setValue] = useState(fileName);
  const [showValidation, setShowValidation] = useState(false);
  const renameMutation = useMutation({ mutationFn: onSubmit });
  const submitError = getAppError<AiDraftFilesError['Rename']>(renameMutation.error);

  const validationError = run(() => {
    const trimmed = value.trim();
    if (trimmed === '') return 'A file name is required.';
    if (trimmed === fileName) return 'The file name must be changed.';
    if (!QUESTION_FILE_NAME_PATTERN.test(trimmed)) {
      return 'Use only letters, numbers, dashes, underscores, slashes, and periods.';
    }
    return null;
  });
  const showValidationError = showValidation && validationError != null;
  const hasError = submitError != null || showValidationError;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (renameMutation.isPending) return;

    setShowValidation(true);
    if (validationError != null) return;

    const parentDirectory = getParentDirectory(oldFilePath);
    const trimmed = value.trim();
    const newFilePath = parentDirectory === '' ? trimmed : `${parentDirectory}/${trimmed}`;
    renameMutation.mutate(newFilePath);
  }

  return (
    <form className="mb-0" onSubmit={handleSubmit}>
      <div className="mb-3">{QUESTION_FILE_NAME_PATTERN_DESCRIPTION}</div>
      <div className="mb-3">
        <label className="form-label" htmlFor={inputId}>
          Path:
        </label>
        <input
          type="text"
          id={inputId}
          className={clsx('form-control', hasError && 'is-invalid')}
          value={value}
          aria-invalid={hasError}
          aria-errormessage={hasError ? errorId : undefined}
          onChange={(event) => setValue(event.target.value)}
        />
        {submitError != null ? (
          <div id={errorId} className="invalid-feedback d-block" role="alert">
            {renderAppError(submitError, {
              SYNC_JOB_FAILED: syncJobFailedRenderer(urlPrefix),
              UNKNOWN: ({ message }) => message,
            })}
          </div>
        ) : showValidationError ? (
          <div id={errorId} className="invalid-feedback d-block" role="alert">
            {validationError}
          </div>
        ) : null}
      </div>
      <div className="text-end justify-content-end gap-2 d-flex flex-wrap">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={renameMutation.isPending}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={renameMutation.isPending}>
          {renameMutation.isPending ? 'Changing...' : 'Change'}
        </button>
      </div>
    </form>
  );
}

function DraftFileDeleteForm({
  idPrefix,
  fileName,
  urlPrefix,
  onCancel,
  onSubmit,
}: {
  idPrefix: string;
  fileName: string;
  urlPrefix: string;
  onCancel: () => void;
  onSubmit: () => Promise<void>;
}) {
  const errorId = `${idPrefix}-error`;
  const deleteMutation = useMutation({ mutationFn: onSubmit });
  const error = getAppError<AiDraftFilesError['Delete']>(deleteMutation.error);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deleteMutation.isPending) return;
    deleteMutation.mutate();
  }

  return (
    <form className="mb-0" onSubmit={handleSubmit}>
      <p>
        Are you sure you want to delete <strong>{fileName}</strong>?
      </p>
      {error ? (
        <div id={errorId} className="text-danger small mb-2" role="alert">
          {renderAppError(error, {
            SYNC_JOB_FAILED: syncJobFailedRenderer(urlPrefix),
            UNKNOWN: ({ message }) => message,
          })}
        </div>
      ) : null}
      <div className="text-end justify-content-end gap-2 d-flex flex-wrap">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={deleteMutation.isPending}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-danger" disabled={deleteMutation.isPending}>
          {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </form>
  );
}

/**
 * A file-browser row action whose click opens a popover form. Encapsulates the
 * show/hide state shared by the upload, rename, and delete buttons; `renderBody`
 * receives a `close` callback so the form can dismiss the popover.
 */
function PopoverActionButton({
  id,
  header,
  iconClass,
  label,
  className,
  disabled,
  testId,
  renderBody,
}: {
  id: string;
  header: string;
  iconClass: string;
  label: string;
  className: string;
  disabled?: boolean;
  testId?: string;
  renderBody: (close: () => void) => ReactNode;
}) {
  const [show, setShow] = useState(false);
  const [wasDisabled, setWasDisabled] = useState(disabled);

  // Close the popover if the action becomes disabled while it's open (e.g. an
  // AI generation starts)
  if (disabled !== wasDisabled) {
    setWasDisabled(disabled);
    if (disabled) setShow(false);
  }

  return (
    <OverlayTrigger
      trigger="click"
      placement="auto"
      show={show}
      popover={{
        props: { id: `${id}-popover` },
        header,
        body: renderBody(() => setShow(false)),
      }}
      onToggle={setShow}
    >
      <button type="button" id={id} className={className} disabled={disabled} data-testid={testId}>
        <i className={iconClass} aria-hidden="true" />
        <span>{label}</span>
      </button>
    </OverlayTrigger>
  );
}

export function UploadFileButton({
  id,
  label,
  iconClass,
  className,
  disabled,
  infoDirectory,
  maxFileSizeBytes,
  target,
  urlPrefix,
  onUploadFile,
}: {
  id: string;
  label: string;
  iconClass: string;
  className: string;
  disabled?: boolean;
  infoDirectory?: string | null;
  maxFileSizeBytes: number;
  target: DraftUploadTarget;
  urlPrefix: string;
  onUploadFile: DraftQuestionFileBrowserActions['onUploadFile'];
}) {
  return (
    <PopoverActionButton
      id={id}
      header="Upload file"
      iconClass={iconClass}
      label={label}
      className={className}
      disabled={disabled}
      renderBody={(close) => (
        <DraftFileUploadForm
          idPrefix={id}
          infoDirectory={infoDirectory ?? null}
          maxFileSizeBytes={maxFileSizeBytes}
          target={target}
          urlPrefix={urlPrefix}
          onCancel={close}
          onSubmit={async (file) => {
            await onUploadFile({ file, target });
            close();
          }}
        />
      )}
    />
  );
}

export function RenameFileButton({
  id,
  fileName,
  oldFilePath,
  disabled,
  urlPrefix,
  onRenameFile,
}: {
  id: string;
  fileName: string;
  oldFilePath: string;
  disabled?: boolean;
  urlPrefix: string;
  onRenameFile: DraftQuestionFileBrowserActions['onRenameFile'];
}) {
  return (
    <PopoverActionButton
      id={id}
      header="Rename file"
      iconClass="fa fa-i-cursor"
      label="Rename"
      className="btn btn-xs btn-secondary text-nowrap"
      disabled={disabled}
      testId="rename-file-button"
      renderBody={(close) => (
        <DraftFileRenameForm
          idPrefix={id}
          fileName={fileName}
          oldFilePath={oldFilePath}
          urlPrefix={urlPrefix}
          onCancel={close}
          onSubmit={async (newFilePath) => {
            await onRenameFile({ oldFilePath, newFilePath });
            close();
          }}
        />
      )}
    />
  );
}

export function DeleteFileButton({
  id,
  fileName,
  filePath,
  disabled,
  urlPrefix,
  onDeleteFile,
}: {
  id: string;
  fileName: string;
  filePath: string;
  disabled?: boolean;
  urlPrefix: string;
  onDeleteFile: DraftQuestionFileBrowserActions['onDeleteFile'];
}) {
  return (
    <PopoverActionButton
      id={id}
      header="Confirm delete"
      iconClass="far fa-trash-alt"
      label="Delete"
      className="btn btn-xs btn-danger text-nowrap"
      disabled={disabled}
      testId="delete-file-button"
      renderBody={(close) => (
        <DraftFileDeleteForm
          idPrefix={id}
          fileName={fileName}
          urlPrefix={urlPrefix}
          onCancel={close}
          onSubmit={async () => {
            await onDeleteFile({ filePath });
            close();
          }}
        />
      )}
    />
  );
}
