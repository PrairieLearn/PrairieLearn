import clsx from 'clsx';
import { filesize } from 'filesize';
import { type FormEvent, useState } from 'react';

import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

/**
 * Callbacks that perform draft question file mutations. Each resolves on success
 * and rejects with an `Error` whose message should be shown to the user. A
 * handler may instead navigate the browser away (e.g. to an edit error page),
 * in which case it resolves without the popover needing to react.
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

const FILE_NAME_PATTERN = /^(?:[A-Za-z0-9_-]+|\.\.)(?:\/(?:[A-Za-z0-9_-]+|\.\.))*(?:\.[A-Za-z0-9_-]+)?$/;

/** Returns the directory portion of a POSIX path relative to the question root. */
function getParentDirectory(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash === -1 ? '' : filePath.slice(0, lastSlash);
}

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function DraftFileUploadForm({
  idPrefix,
  infoHtml,
  maxFileSizeBytes,
  onCancel,
  onSubmit,
}: {
  idPrefix: string;
  infoHtml: string | null;
  maxFileSizeBytes: number;
  onCancel: () => void;
  onSubmit: (file: File) => Promise<void>;
}) {
  const inputId = `${idPrefix}-file`;
  const errorId = `${idPrefix}-error`;
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (file == null || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(file);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to upload file.'));
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mb-0" onSubmit={handleSubmit}>
      {infoHtml ? (
        // The info text is built server-side from trusted path names; it only
        // contains static markup like `<code>` and a documentation link.
        <div className="mb-3" dangerouslySetInnerHTML={{ __html: infoHtml }} />
      ) : null}
      <div className="mb-3">
        <label className="form-label" htmlFor={inputId}>
          Choose file
        </label>
        <input
          type="file"
          id={inputId}
          className="form-control"
          required
          aria-invalid={error != null}
          aria-errormessage={error != null ? errorId : undefined}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <small className="form-text text-muted">
          Max file size: {filesize(maxFileSizeBytes, { base: 10, round: 0 })}
        </small>
      </div>
      {error ? (
        <div id={errorId} className="text-danger small mb-3" role="alert">
          {error}
        </div>
      ) : null}
      <div className="text-end justify-content-end gap-2 d-flex flex-wrap">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={isSubmitting}
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
  onCancel,
  onSubmit,
}: {
  idPrefix: string;
  fileName: string;
  oldFilePath: string;
  onCancel: () => void;
  onSubmit: (newFilePath: string) => Promise<void>;
}) {
  const inputId = `${idPrefix}-input`;
  const errorId = `${idPrefix}-error`;
  const [value, setValue] = useState(fileName);
  const [showValidation, setShowValidation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validationError = run(() => {
    const trimmed = value.trim();
    if (trimmed === '') return 'A file name is required.';
    if (trimmed === fileName) return 'The file name must be changed.';
    if (!FILE_NAME_PATTERN.test(trimmed)) {
      return 'Use only letters, numbers, dashes, underscores, slashes, and periods.';
    }
    return null;
  });
  const displayError = submitError ?? (showValidation ? validationError : null);

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
      setSubmitError(getErrorMessage(err, 'Failed to rename file.'));
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mb-0" onSubmit={handleSubmit}>
      <div className="mb-3">
        Use only letters, numbers, dashes, and underscores, with no spaces. A file extension is
        recommended, delimited by a period. If you want to move the file to a different directory,
        you can specify a relative path that is delimited by a forward slash and that includes
        "<code>..</code>".
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor={inputId}>
          Path:
        </label>
        <input
          type="text"
          id={inputId}
          className={clsx('form-control', displayError != null && 'is-invalid')}
          value={value}
          aria-invalid={displayError != null}
          aria-errormessage={displayError != null ? errorId : undefined}
          onChange={(event) => setValue(event.target.value)}
        />
        {displayError ? (
          <div id={errorId} className="invalid-feedback d-block" role="alert">
            {displayError}
          </div>
        ) : null}
      </div>
      <div className="text-end justify-content-end gap-2 d-flex flex-wrap">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={isSubmitting}
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
  onCancel,
  onSubmit,
}: {
  idPrefix: string;
  fileName: string;
  onCancel: () => void;
  onSubmit: () => Promise<void>;
}) {
  const errorId = `${idPrefix}-error`;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete file.'));
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
          {error}
        </div>
      ) : null}
      <div className="text-end justify-content-end gap-2 d-flex flex-wrap">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={isSubmitting}
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
  infoHtml,
  maxFileSizeBytes,
  targetFilePath,
  directory,
  onUploadFile,
}: {
  id: string;
  label: string;
  iconClass: string;
  className: string;
  disabled?: boolean;
  infoHtml?: string | null;
  maxFileSizeBytes: number;
  targetFilePath: string | null;
  directory: string | null;
  onUploadFile: DraftQuestionFileBrowserActions['onUploadFile'];
}) {
  const [show, setShow] = useState(false);

  return (
    <OverlayTrigger
      trigger="click"
      placement="auto"
      show={show}
      onToggle={(nextShow) => setShow(nextShow)}
      popover={{
        props: { id: `${id}-popover` },
        header: 'Upload file',
        body: (
          <DraftFileUploadForm
            idPrefix={id}
            infoHtml={infoHtml ?? null}
            maxFileSizeBytes={maxFileSizeBytes}
            onCancel={() => setShow(false)}
            onSubmit={async (file) => {
              await onUploadFile({ file, targetFilePath, directory });
              setShow(false);
            }}
          />
        ),
      }}
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
  onRenameFile,
}: {
  id: string;
  fileName: string;
  oldFilePath: string;
  disabled?: boolean;
  onRenameFile: DraftQuestionFileBrowserActions['onRenameFile'];
}) {
  const [show, setShow] = useState(false);

  return (
    <OverlayTrigger
      trigger="click"
      placement="auto"
      show={show}
      onToggle={(nextShow) => setShow(nextShow)}
      popover={{
        props: { id: `${id}-popover` },
        header: 'Rename file',
        body: (
          <DraftFileRenameForm
            idPrefix={id}
            fileName={fileName}
            oldFilePath={oldFilePath}
            onCancel={() => setShow(false)}
            onSubmit={async (newFilePath) => {
              await onRenameFile({ oldFilePath, newFilePath });
              setShow(false);
            }}
          />
        ),
      }}
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
  onDeleteFile,
}: {
  id: string;
  fileName: string;
  filePath: string;
  disabled?: boolean;
  onDeleteFile: DraftQuestionFileBrowserActions['onDeleteFile'];
}) {
  const [show, setShow] = useState(false);

  return (
    <OverlayTrigger
      trigger="click"
      placement="auto"
      show={show}
      onToggle={(nextShow) => setShow(nextShow)}
      popover={{
        props: { id: `${id}-popover` },
        header: 'Confirm delete',
        body: (
          <DraftFileDeleteForm
            idPrefix={id}
            fileName={fileName}
            onCancel={() => setShow(false)}
            onSubmit={async () => {
              await onDeleteFile({ filePath });
              setShow(false);
            }}
          />
        ),
      }}
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
