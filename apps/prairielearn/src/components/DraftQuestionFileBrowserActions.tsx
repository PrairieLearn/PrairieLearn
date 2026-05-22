import clsx from 'clsx';
import { filesize } from 'filesize';
import { type FormEvent, useState } from 'react';

import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

import {
  type AppError,
  getAppError,
  renderAppError,
  syncJobFailedRenderer,
} from '../lib/client/errors.js';
import { FILE_NAME_PATTERN } from '../lib/file-names.js';

/**
 * Callbacks that perform draft question file mutations. Each resolves on
 * success and rejects on failure; the rejection is rendered in the action's
 * popover via {@link getAppError}.
 */
export interface DraftQuestionFileBrowserActions {
  /**
   * Uploads a file. When `targetFilePath` is set, the uploaded file replaces
   * that exact file; otherwise it is created in `directory` (or the question
   * root when `directory` is `null`) under its original name.
   */
  onUploadFile: (args: {
    file: File;
    targetFilePath: string | null;
    directory: string | null;
  }) => Promise<void>;
  onRenameFile: (args: { oldFilePath: string; newFilePath: string }) => Promise<void>;
  onDeleteFile: (args: { filePath: string }) => Promise<void>;
}

/** Returns the directory portion of a POSIX path relative to the question root. */
function getParentDirectory(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash === -1 ? '' : filePath.slice(0, lastSlash);
}

/** A draft file mutation whose underlying server job failed to sync. */
type DraftFileActionError = { code: 'EDIT_JOB_FAILED'; jobSequenceId: string };

/** Extracts a typed action error, falling back to `fallbackMessage`. */
function resolveActionError(err: unknown, fallbackMessage: string): AppError<DraftFileActionError> {
  return getAppError<DraftFileActionError>(err) ?? { code: 'UNKNOWN', message: fallbackMessage };
}

/** Renders a draft file action error, linking to the job logs on a sync failure. */
function ActionError({
  error,
  urlPrefix,
}: {
  error: AppError<DraftFileActionError>;
  urlPrefix: string;
}) {
  return renderAppError(error, {
    EDIT_JOB_FAILED: syncJobFailedRenderer(urlPrefix),
    UNKNOWN: ({ message }) => message,
  });
}

function DraftFileUploadForm({
  idPrefix,
  infoDirectory,
  maxFileSizeBytes,
  urlPrefix,
  onCancel,
  onSubmit,
}: {
  idPrefix: string;
  /** When set, a note tells the user the file will be placed in this directory. */
  infoDirectory: string | null;
  maxFileSizeBytes: number;
  urlPrefix: string;
  onCancel: () => void;
  onSubmit: (file: File) => Promise<void>;
}) {
  const inputId = `${idPrefix}-file`;
  const errorId = `${idPrefix}-error`;
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<AppError<DraftFileActionError> | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (file == null || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(file);
    } catch (err) {
      setError(resolveActionError(err, 'Failed to upload file.'));
      setIsSubmitting(false);
    }
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
          aria-invalid={error != null}
          aria-errormessage={error != null ? errorId : undefined}
          required
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <small className="form-text text-muted">
          Max file size: {filesize(maxFileSizeBytes, { base: 10, round: 0 })}
        </small>
      </div>
      {error ? (
        <div id={errorId} className="text-danger small mb-3" role="alert">
          <ActionError error={error} urlPrefix={urlPrefix} />
        </div>
      ) : null}
      <div className="text-end justify-content-end gap-2 d-flex flex-wrap">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={isSubmitting}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={file == null || isSubmitting}>
          {isSubmitting ? 'Uploading...' : 'Upload file'}
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<AppError<DraftFileActionError> | null>(null);

  const validationError = run(() => {
    const trimmed = value.trim();
    if (trimmed === '') return 'A file name is required.';
    if (trimmed === fileName) return 'The file name must be changed.';
    if (!FILE_NAME_PATTERN.test(trimmed)) {
      return 'Use only letters, numbers, dashes, underscores, slashes, and periods.';
    }
    return null;
  });
  const showValidationError = showValidation && validationError != null;
  const hasError = submitError != null || showValidationError;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setShowValidation(true);
    if (validationError != null) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const parentDirectory = getParentDirectory(oldFilePath);
      const trimmed = value.trim();
      const newFilePath = parentDirectory === '' ? trimmed : `${parentDirectory}/${trimmed}`;
      await onSubmit(newFilePath);
    } catch (err) {
      setSubmitError(resolveActionError(err, 'Failed to rename file.'));
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mb-0" onSubmit={handleSubmit}>
      <div className="mb-3">
        Use only letters, numbers, dashes, and underscores, with no spaces. A file extension is
        recommended, delimited by a period. If you want to move the file to a different directory,
        you can specify a relative path that is delimited by a forward slash and that includes "
        <code>..</code>".
      </div>
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
            <ActionError error={submitError} urlPrefix={urlPrefix} />
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
          disabled={isSubmitting}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Changing...' : 'Change'}
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<AppError<DraftFileActionError> | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit();
    } catch (err) {
      setError(resolveActionError(err, 'Failed to delete file.'));
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mb-0" onSubmit={handleSubmit}>
      <p>
        Are you sure you want to delete <strong>{fileName}</strong>?
      </p>
      {error ? (
        <div id={errorId} className="text-danger small mb-2" role="alert">
          <ActionError error={error} urlPrefix={urlPrefix} />
        </div>
      ) : null}
      <div className="text-end justify-content-end gap-2 d-flex flex-wrap">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={isSubmitting}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-danger" disabled={isSubmitting}>
          {isSubmitting ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </form>
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
  targetFilePath,
  directory,
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
  targetFilePath: string | null;
  directory: string | null;
  urlPrefix: string;
  onUploadFile: DraftQuestionFileBrowserActions['onUploadFile'];
}) {
  const [show, setShow] = useState(false);

  return (
    <OverlayTrigger
      trigger="click"
      placement="auto"
      show={show}
      popover={{
        props: { id: `${id}-popover` },
        header: 'Upload file',
        body: (
          <DraftFileUploadForm
            idPrefix={id}
            infoDirectory={infoDirectory ?? null}
            maxFileSizeBytes={maxFileSizeBytes}
            urlPrefix={urlPrefix}
            onCancel={() => setShow(false)}
            onSubmit={async (file) => {
              await onUploadFile({ file, targetFilePath, directory });
              setShow(false);
            }}
          />
        ),
      }}
      onToggle={(nextShow) => setShow(nextShow)}
    >
      <button type="button" id={id} className={className} disabled={disabled}>
        <i className={iconClass} aria-hidden="true" />
        <span>{label}</span>
      </button>
    </OverlayTrigger>
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
  const [show, setShow] = useState(false);

  return (
    <OverlayTrigger
      trigger="click"
      placement="auto"
      show={show}
      popover={{
        props: { id: `${id}-popover` },
        header: 'Rename file',
        body: (
          <DraftFileRenameForm
            idPrefix={id}
            fileName={fileName}
            oldFilePath={oldFilePath}
            urlPrefix={urlPrefix}
            onCancel={() => setShow(false)}
            onSubmit={async (newFilePath) => {
              await onRenameFile({ oldFilePath, newFilePath });
              setShow(false);
            }}
          />
        ),
      }}
      onToggle={(nextShow) => setShow(nextShow)}
    >
      <button
        type="button"
        id={id}
        className="btn btn-xs btn-secondary text-nowrap"
        data-testid="rename-file-button"
        disabled={disabled}
      >
        <i className="fa fa-i-cursor" aria-hidden="true" />
        <span>Rename</span>
      </button>
    </OverlayTrigger>
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
  const [show, setShow] = useState(false);

  return (
    <OverlayTrigger
      trigger="click"
      placement="auto"
      show={show}
      popover={{
        props: { id: `${id}-popover` },
        header: 'Confirm delete',
        body: (
          <DraftFileDeleteForm
            idPrefix={id}
            fileName={fileName}
            urlPrefix={urlPrefix}
            onCancel={() => setShow(false)}
            onSubmit={async () => {
              await onDeleteFile({ filePath });
              setShow(false);
            }}
          />
        ),
      }}
      onToggle={(nextShow) => setShow(nextShow)}
    >
      <button
        type="button"
        id={id}
        className="btn btn-xs btn-secondary text-nowrap"
        data-testid="delete-file-button"
        disabled={disabled}
      >
        <i className="far fa-trash-alt" aria-hidden="true" />
        <span>Delete</span>
      </button>
    </OverlayTrigger>
  );
}
