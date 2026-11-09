import { type FileUIPart, type UIMessage } from 'ai';
import clsx from 'clsx';
import { useCallback, useState } from 'react';
import { Button, Spinner } from 'react-bootstrap';

import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  THUMBNAIL_PIXELS,
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

/** The upload's ID, or the HTTP status it failed with (0 for a network error). */
function uploadFile(url: string, csrfToken: string, file: File, onProgress: (p: number) => void) {
  return new Promise<{ id: string } | { status: number }>((resolve) => {
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
 * A small WebP of an image for its preview in chat history, or null if the browser can't decode
 * it (HEIC in most browsers, or a corrupt file). Browsers without WebP encoding produce a PNG.
 */
async function makeThumbnail(file: File) {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  const scale = Math.min(1, THUMBNAIL_PIXELS / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(bitmap.width * scale)),
    Math.max(1, Math.round(bitmap.height * scale)),
  );
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
}

/** A preview is optional, so a failed one leaves the card's file icon in its place. */
async function uploadThumbnail(url: string, csrfToken: string, thumbnail: Blob) {
  await fetch(url, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/octet-stream' },
    body: thumbnail,
  }).catch(() => null);
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
      const thumbnail = file.type.startsWith('image/') ? makeThumbnail(file) : null;
      const result = await uploadFile(url, csrfToken, file, (progress) =>
        update(key, { progress }),
      );
      if ('id' in result) {
        const made = await thumbnail;
        if (made) await uploadThumbnail(`${url}/${result.id}/thumbnail`, csrfToken, made);
        update(key, { uploadId: result.id, progress: null });
        return result.id;
      }
      // A full conversation stays full, so retrying can't help.
      update(
        key,
        result.status === 413
          ? { progress: null, problem: 'Conversation file limit reached. Remove it.' }
          : { progress: null, uploadFailed: true },
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
  downloadUrl = null,
  danger = false,
  busy = false,
  onRemove,
}: {
  filename: string;
  mediaType: string;
  detail: string;
  previewUrl?: string | null;
  downloadUrl?: string | null;
  danger?: boolean;
  busy?: boolean;
  onRemove?: () => void;
}) {
  // Uploads from before previews existed, and images the browser couldn't decode, have none.
  const [previewFailed, setPreviewFailed] = useState(false);
  const content = (
    <>
      <span
        className={clsx(
          'course-agent-attachment-icon position-relative overflow-hidden rounded-1 d-flex align-items-center justify-content-center',
          danger ? 'bg-danger-subtle text-danger' : 'bg-body-secondary text-body-secondary',
        )}
        aria-hidden="true"
      >
        {busy ? (
          <Spinner animation="border" size="sm" />
        ) : previewUrl && !previewFailed ? (
          <img
            src={previewUrl}
            alt=""
            className="w-100 h-100 object-fit-cover"
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <i
            className={clsx(
              'bi',
              danger ? 'bi-exclamation-triangle' : fileIcon(mediaType, filename),
            )}
          />
        )}
        {downloadUrl && (
          <span className="course-agent-attachment-download position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center">
            <i className="bi bi-download" />
          </span>
        )}
      </span>
      <span className="d-flex flex-column overflow-hidden small lh-sm">
        <span className="text-truncate">{filename}</span>
        <span className={danger ? 'text-danger' : 'text-body-secondary'}>{detail}</span>
      </span>
    </>
  );
  return (
    <li
      className={clsx(
        'course-agent-attachment position-relative d-flex rounded-2 border bg-body-tertiary',
        danger && 'border-danger',
      )}
    >
      {downloadUrl ? (
        <a
          href={downloadUrl}
          download={filename}
          className="course-agent-attachment-body d-flex align-items-center gap-2 text-reset text-decoration-none"
          aria-label={`Download ${filename}`}
        >
          {content}
        </a>
      ) : (
        <span className="course-agent-attachment-body d-flex align-items-center gap-2">
          {content}
        </span>
      )}
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

/** A sent message's attachments, shown above its text. Each one downloads when clicked. */
export function SentAttachments({
  message,
  uploadsUrl,
}: {
  message: UIMessage;
  uploadsUrl: string;
}) {
  const files = message.parts.flatMap((part) => {
    if (part.type !== 'file') return [];
    const id = attachmentIdOf(part.url);
    return id ? [{ part, url: `${uploadsUrl}/${id}` }] : [];
  });
  if (files.length === 0) return null;
  return (
    <ul
      className="list-unstyled d-flex flex-wrap justify-content-end gap-2 m-0"
      aria-label="Attachments"
    >
      {files.map(({ part, url }) => (
        <AttachmentCard
          key={part.url}
          filename={part.filename ?? 'File'}
          mediaType={part.mediaType}
          detail={typeLabel(part.mediaType, part.filename ?? '')}
          previewUrl={part.mediaType.startsWith('image/') ? `${url}/thumbnail` : null}
          downloadUrl={url}
        />
      ))}
    </ul>
  );
}
