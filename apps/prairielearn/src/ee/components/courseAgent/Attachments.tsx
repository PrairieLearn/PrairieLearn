import { type FileUIPart, type UIMessage } from 'ai';
import clsx from 'clsx';
import { useCallback, useState } from 'react';
import { Button, Spinner } from 'react-bootstrap';

import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  UploadedAttachmentSchema,
  attachmentIdOf,
  attachmentUrl,
} from '@prairielearn/course-agent-types';

/** A file attached to a message that hasn't been sent yet. */
export interface DraftAttachment {
  key: string;
  file: File;
  /** An object URL for an image's thumbnail. */
  previewUrl: string | null;
  /** Why the file can't be sent; it has to be removed. */
  problem: string | null;
  uploadId: string | null;
  /** From 0 to 1 while uploading. */
  progress: number | null;
  uploadFailed: boolean;
}

function problemWith(file: File, position: number) {
  if (position >= MAX_ATTACHMENTS_PER_MESSAGE) {
    return `Only ${MAX_ATTACHMENTS_PER_MESSAGE} files per message. Remove it.`;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) return 'Over 20 MB. Remove it.';
  if (file.size === 0) return 'Empty file. Remove it.';
  return null;
}

function revokePreviews(attachments: DraftAttachment[]) {
  for (const { previewUrl } of attachments) if (previewUrl) URL.revokeObjectURL(previewUrl);
}

/** Draft attachments for one composer. `handOff` passes them on without revoking previews. */
export function useDraftAttachments(initial: DraftAttachment[] = []) {
  const [attachments, setAttachments] = useState(initial);
  // Stable, so the upload flow that reports progress through it can be memoized.
  const update = useCallback(
    (key: string, patch: Partial<DraftAttachment>) =>
      setAttachments((current) => current.map((a) => (a.key === key ? { ...a, ...patch } : a))),
    [],
  );
  return {
    attachments,
    add: (files: File[]) => {
      const added = files.map((file, index) => ({
        key: crypto.randomUUID(),
        file,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        problem: problemWith(file, attachments.length + index),
        uploadId: null,
        progress: null,
        uploadFailed: false,
      }));
      setAttachments((current) => [...current, ...added]);
    },
    remove: (key: string) => {
      revokePreviews(attachments.filter((a) => a.key === key));
      setAttachments((current) => current.filter((a) => a.key !== key));
    },
    clear: () => {
      revokePreviews(attachments);
      setAttachments([]);
    },
    handOff: setAttachments,
    update,
  };
}

function uploadFile(url: string, csrfToken: string, file: File, onProgress: (p: number) => void) {
  return new Promise<string>((resolve, reject) => {
    // XHR reports upload progress, which fetch doesn't.
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.responseType = 'json';
    request.setRequestHeader('X-CSRF-Token', csrfToken);
    request.setRequestHeader('Content-Type', 'application/octet-stream');
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });
    request.addEventListener('load', () => {
      const uploaded = UploadedAttachmentSchema.safeParse(request.response);
      if (request.status === 201 && uploaded.success) resolve(uploaded.data.id);
      else reject(new Error(`Upload failed with status ${request.status}`));
    });
    request.addEventListener('error', () => reject(new Error('Upload failed')));
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
    update,
  }: {
    url: string;
    csrfToken: string;
    update: (key: string, patch: Partial<DraftAttachment>) => void;
  },
): Promise<FileUIPart[] | null> {
  const ids = await Promise.all(
    attachments.map(async ({ key, file, uploadId }) => {
      if (uploadId) return uploadId;
      update(key, { progress: 0, uploadFailed: false });
      try {
        const id = await uploadFile(url, csrfToken, file, (progress) => update(key, { progress }));
        update(key, { uploadId: id, progress: null });
        return id;
      } catch {
        update(key, { progress: null, uploadFailed: true });
        return null;
      }
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

function fileIcon(mediaType: string, filename: string) {
  const extension = filename.split('.').at(-1)?.toLowerCase() ?? '';
  if (mediaType.startsWith('image/')) return 'bi-file-earmark-image';
  if (mediaType === 'application/pdf' || extension === 'pdf') return 'bi-file-earmark-pdf';
  if (['csv', 'tsv', 'xlsx', 'xls'].includes(extension)) return 'bi-file-earmark-spreadsheet';
  if (['zip', 'gz', 'tar'].includes(extension)) return 'bi-file-earmark-zip';
  if (mediaType.startsWith('text/') || ['md', 'json', 'py', 'tex'].includes(extension)) {
    return 'bi-file-earmark-text';
  }
  return 'bi-file-earmark';
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function typeLabel(mediaType: string, filename: string) {
  const extension = filename.includes('.') ? filename.split('.').at(-1)!.toUpperCase() : '';
  return extension || mediaType.split('/').at(-1)?.toUpperCase() || 'File';
}

function AttachmentCard({
  filename,
  mediaType,
  detail,
  previewUrl = null,
  danger = false,
  busy = false,
  onRemove,
}: {
  filename: string;
  mediaType: string;
  detail: string;
  previewUrl?: string | null;
  danger?: boolean;
  busy?: boolean;
  onRemove?: () => void;
}) {
  return (
    <li
      className={clsx(
        'course-agent-attachment position-relative d-flex align-items-center gap-2 rounded-2 border bg-body-tertiary',
        danger && 'border-danger',
      )}
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt=""
          className="course-agent-attachment-icon rounded-1 object-fit-cover"
        />
      ) : (
        <span
          className={clsx(
            'course-agent-attachment-icon rounded-1 d-flex align-items-center justify-content-center',
            danger ? 'bg-danger-subtle text-danger' : 'bg-body-secondary text-body-secondary',
          )}
          aria-hidden="true"
        >
          {busy ? (
            <Spinner animation="border" size="sm" />
          ) : (
            <i
              className={clsx(
                'bi',
                danger ? 'bi-exclamation-triangle' : fileIcon(mediaType, filename),
              )}
            />
          )}
        </span>
      )}
      <span className="d-flex flex-column overflow-hidden small lh-sm">
        <span className="text-truncate">{filename}</span>
        <span className={danger ? 'text-danger' : 'text-body-secondary'}>{detail}</span>
      </span>
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
      {attachments.map((attachment) => {
        const { file, problem, progress, uploadFailed } = attachment;
        const detail = problem
          ? problem
          : progress !== null
            ? `Uploading… ${Math.round(progress * 100)}%`
            : uploadFailed
              ? "Couldn't upload. Send to retry."
              : `${typeLabel(file.type, file.name)} · ${formatSize(file.size)}`;
        return (
          <AttachmentCard
            key={attachment.key}
            filename={file.name}
            mediaType={file.type}
            detail={detail}
            previewUrl={progress === null ? attachment.previewUrl : null}
            danger={problem !== null || uploadFailed}
            busy={progress !== null}
            onRemove={sending ? undefined : () => onRemove(attachment.key)}
          />
        );
      })}
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
        <AttachmentCard
          key={part.url}
          filename={part.filename ?? 'File'}
          mediaType={part.mediaType}
          detail={typeLabel(part.mediaType, part.filename ?? '')}
        />
      ))}
    </ul>
  );
}
