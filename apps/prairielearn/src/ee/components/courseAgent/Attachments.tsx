import { type FileUIPart, type UIMessage } from 'ai';
import clsx from 'clsx';
import { filesize } from 'filesize';
import { type DragEvent, type ReactNode, useCallback, useState } from 'react';
import { Button } from 'react-bootstrap';

import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  UploadedAttachmentSchema,
  attachmentIdOf,
  attachmentUrl,
} from '@prairielearn/course-agent-types';

const MAX_ATTACHMENT_SIZE = filesize(MAX_ATTACHMENT_BYTES, { round: 1, standard: 'jedec' });

export type AttachmentStatus =
  | { kind: 'ready' }
  /** It can't be sent and has to be removed. */
  | { kind: 'invalid'; problem: string }
  | { kind: 'uploading'; percent: number }
  | { kind: 'uploaded'; id: string }
  | { kind: 'failed' };

/** A file attached to a message that hasn't been sent yet. */
export interface DraftAttachment {
  key: string;
  file: File;
  status: AttachmentStatus;
}

function statusOf(file: File, position: number): AttachmentStatus {
  const invalid = (problem: string) => ({ kind: 'invalid', problem }) as const;
  if (position >= MAX_ATTACHMENTS_PER_MESSAGE) {
    return invalid(`Over ${MAX_ATTACHMENTS_PER_MESSAGE} files`);
  }
  if (file.size > MAX_ATTACHMENT_BYTES) return invalid(`Over ${MAX_ATTACHMENT_SIZE}`);
  if (file.size === 0) return invalid('Empty file');
  return { kind: 'ready' };
}

/** Draft attachments for one composer. */
export function useDraftAttachments(initial: DraftAttachment[] = []) {
  const [attachments, setAttachments] = useState(initial);
  // Stable, so the upload flow that reports progress through it can be memoized.
  const setStatus = useCallback(
    (key: string, status: AttachmentStatus) =>
      setAttachments((current) => current.map((a) => (a.key === key ? { ...a, status } : a))),
    [],
  );
  return {
    attachments,
    add: (files: File[]) => {
      const added = files.map((file, index) => ({
        key: crypto.randomUUID(),
        file,
        status: statusOf(file, attachments.length + index),
      }));
      setAttachments((current) => [...current, ...added]);
    },
    remove: (key: string) => setAttachments((current) => current.filter((a) => a.key !== key)),
    setAttachments,
    setStatus,
  };
}

/** The upload's ID, or the HTTP status it failed with (0 for a network error). */
function uploadFile(url: string, csrfToken: string, file: File, onProgress: (p: number) => void) {
  return new Promise<{ id: string } | { status: number }>((resolve) => {
    // XHR reports upload progress, which fetch doesn't.
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.responseType = 'json';
    request.setRequestHeader('X-CSRF-Token', csrfToken);
    request.setRequestHeader('Content-Type', 'application/octet-stream');
    // Each report re-renders the chat, so report only whole-percent changes.
    let reported = 0;
    request.upload.addEventListener('progress', (event) => {
      const percent = Math.floor((event.loaded / event.total) * 100);
      if (!event.lengthComputable || percent === reported) return;
      reported = percent;
      onProgress(percent);
    });
    request.addEventListener('load', () => {
      const uploaded = UploadedAttachmentSchema.safeParse(request.response);
      resolve(
        request.status === 201 && uploaded.success
          ? { id: uploaded.data.id }
          : { status: request.status },
      );
    });
    request.addEventListener('error', () => resolve({ status: 0 }));
    request.send(file);
  });
}

/**
 * Upload every attachment not uploaded yet, then return the message's file parts, or null if any
 * upload failed. Earlier successes keep their upload IDs, so sending again retries only failures.
 */
export async function uploadDraftAttachments(
  attachments: DraftAttachment[],
  {
    url,
    csrfToken,
    setStatus,
  }: {
    url: string;
    csrfToken: string;
    setStatus: (key: string, status: AttachmentStatus) => void;
  },
): Promise<FileUIPart[] | null> {
  const ids = await Promise.all(
    attachments.map(async ({ key, file, status }) => {
      if (status.kind === 'uploaded') return status.id;
      setStatus(key, { kind: 'uploading', percent: 0 });
      const result = await uploadFile(url, csrfToken, file, (percent) =>
        setStatus(key, { kind: 'uploading', percent }),
      );
      if ('id' in result) {
        setStatus(key, { kind: 'uploaded', id: result.id });
        return result.id;
      }
      // A full conversation stays full, so retrying can't help.
      setStatus(
        key,
        result.status === 413
          ? { kind: 'invalid', problem: 'Conversation is full' }
          : { kind: 'failed' },
      );
      return null;
    }),
  );
  if (ids.includes(null)) return null;
  return attachments.map(({ file }, index) => ({
    type: 'file',
    mediaType: file.type || 'application/octet-stream',
    filename: file.name,
    url: attachmentUrl(ids[index]!),
  }));
}

function extensionOf(filename: string) {
  return filename.includes('.') ? filename.split('.').at(-1)!.toLowerCase() : '';
}

function typeLabel(mediaType: string, filename: string) {
  return (extensionOf(filename) || mediaType.split('/').at(-1) || 'File').toUpperCase();
}

/** A square tile for an attachment, with its name and either its type or a problem. */
function AttachmentTile({
  filename,
  label,
  problem = null,
  percent = null,
  onRemove,
}: {
  filename: string;
  label: string;
  problem?: string | null;
  /** Upload progress, shown over the tile while uploading. */
  percent?: number | null;
  onRemove?: () => void;
}) {
  return (
    <li
      className={clsx(
        'course-agent-attachment position-relative flex-shrink-0 rounded-3 border',
        problem ? 'border-danger bg-danger-subtle' : 'bg-body-tertiary',
      )}
      title={filename}
    >
      <div className="position-relative h-100 overflow-hidden rounded-3">
        <div className="d-flex flex-column justify-content-between h-100 p-2">
          <span className={clsx('course-agent-attachment-name', problem && 'text-danger')}>
            {filename}
          </span>
          {problem ? (
            <span className="course-agent-attachment-problem text-danger">
              <i className="bi bi-exclamation-triangle me-1" aria-hidden="true" />
              {problem}
            </span>
          ) : (
            <span className="badge rounded-pill border text-body-secondary fw-normal align-self-start mw-100 text-truncate">
              {label}
            </span>
          )}
        </div>
        {percent !== null && (
          <div className="course-agent-attachment-overlay position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center fw-medium">
            {percent}%
          </div>
        )}
      </div>
      {onRemove && (
        <Button
          variant="light"
          size="sm"
          className="course-agent-attachment-remove position-absolute rounded-circle border p-0 d-flex align-items-center justify-content-center"
          aria-label={`Remove ${filename}`}
          onClick={onRemove}
        >
          <i className="bi bi-x" aria-hidden="true" />
        </Button>
      )}
    </li>
  );
}

function draftProblem({ status }: DraftAttachment) {
  if (status.kind === 'invalid') return status.problem;
  if (status.kind === 'failed') return 'Upload failed';
  return null;
}

export function DraftAttachmentList({
  attachments,
  sending,
  onRemove,
}: {
  attachments: DraftAttachment[];
  sending: boolean;
  onRemove: (key: string) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <ul className="list-unstyled d-flex flex-wrap gap-2 m-0 px-2 pt-2" aria-label="Attachments">
      {attachments.map((attachment) => (
        <AttachmentTile
          key={attachment.key}
          filename={attachment.file.name}
          label={typeLabel(attachment.file.type, attachment.file.name)}
          problem={draftProblem(attachment)}
          percent={attachment.status.kind === 'uploading' ? attachment.status.percent : null}
          onRemove={sending ? undefined : () => onRemove(attachment.key)}
        />
      ))}
    </ul>
  );
}

/** A sent message's attachments, shown above its text. */
export function SentAttachments({ message }: { message: UIMessage }) {
  const files = message.parts.filter(
    (part): part is FileUIPart => part.type === 'file' && attachmentIdOf(part.url) !== null,
  );
  if (files.length === 0) return null;
  return (
    <ul
      className="list-unstyled d-flex flex-wrap justify-content-end gap-2 m-0"
      aria-label="Attachments"
    >
      {files.map((part) => (
        <AttachmentTile
          key={part.url}
          filename={part.filename ?? 'File'}
          label={typeLabel(part.mediaType, part.filename ?? '')}
        />
      ))}
    </ul>
  );
}

/** An area that attaches files dropped anywhere on it, with an overlay while they're dragged in. */
export function FileDropArea({
  enabled,
  onDrop,
  children,
}: {
  /** Whether files can be added now. */
  enabled: boolean;
  onDrop: (files: File[]) => void;
  children: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const draggingFiles = (event: DragEvent) => enabled && event.dataTransfer.types.includes('Files');
  return (
    <div
      className="position-relative d-flex flex-column flex-grow-1 overflow-hidden"
      onDragOver={(event) => {
        if (!draggingFiles(event)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        setDragging(false);
        if (!draggingFiles(event)) return;
        event.preventDefault();
        onDrop([...event.dataTransfer.files]);
      }}
    >
      {children}
      {dragging && (
        <div className="course-agent-drop-target position-absolute d-flex flex-column align-items-center justify-content-center text-primary">
          <i className="bi bi-upload fs-4" aria-hidden="true" />
          <span className="fw-medium">Drop files to attach</span>
          <span className="small">
            Up to {MAX_ATTACHMENTS_PER_MESSAGE} files, {MAX_ATTACHMENT_SIZE} each
          </span>
        </div>
      )}
    </div>
  );
}
