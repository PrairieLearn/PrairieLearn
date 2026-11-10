import { type FileUIPart, type UIMessage } from 'ai';
import clsx from 'clsx';
import { filesize } from 'filesize';
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

const formatBytes = (bytes: number) => filesize(bytes, { round: 1, standard: 'jedec' });
export const MAX_ATTACHMENT_SIZE = formatBytes(MAX_ATTACHMENT_BYTES);

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
  /** An object URL for an image's thumbnail. */
  previewUrl: string | null;
  status: AttachmentStatus;
}

function statusOf(file: File, position: number): AttachmentStatus {
  const invalid = (problem: string) => ({ kind: 'invalid', problem }) as const;
  if (position >= MAX_ATTACHMENTS_PER_MESSAGE) {
    return invalid(`Only ${MAX_ATTACHMENTS_PER_MESSAGE} files per message. Remove it.`);
  }
  if (file.size > MAX_ATTACHMENT_BYTES) return invalid(`Over ${MAX_ATTACHMENT_SIZE}. Remove it.`);
  if (file.size === 0) return invalid('Empty file. Remove it.');
  return { kind: 'ready' };
}

export function revokePreviews(attachments: DraftAttachment[]) {
  for (const { previewUrl } of attachments) if (previewUrl) URL.revokeObjectURL(previewUrl);
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
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        status: statusOf(file, attachments.length + index),
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
    /** Replaces the attachments without revoking previews, for passing them to another owner. */
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
 * A reduced WebP of an image for its preview in chat history, or null if the browser can't decode
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
      const thumbnail = file.type.startsWith('image/') ? makeThumbnail(file) : null;
      const result = await uploadFile(url, csrfToken, file, (percent) =>
        setStatus(key, { kind: 'uploading', percent }),
      );
      if ('id' in result) {
        const made = await thumbnail;
        if (made) await uploadThumbnail(`${url}/${result.id}/thumbnail`, csrfToken, made);
        setStatus(key, { kind: 'uploaded', id: result.id });
        return result.id;
      }
      // A full conversation stays full, so retrying can't help.
      setStatus(
        key,
        result.status === 413
          ? { kind: 'invalid', problem: 'Conversation file limit reached. Remove it.' }
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

function fileIcon(mediaType: string, filename: string) {
  const extension = extensionOf(filename);
  if (mediaType.startsWith('image/')) return 'bi-file-earmark-image';
  if (mediaType === 'application/pdf' || extension === 'pdf') return 'bi-file-earmark-pdf';
  if (['csv', 'tsv', 'xlsx', 'xls'].includes(extension)) return 'bi-file-earmark-spreadsheet';
  if (['zip', 'gz', 'tar'].includes(extension)) return 'bi-file-earmark-zip';
  if (mediaType.startsWith('text/') || ['md', 'json', 'py', 'tex'].includes(extension)) {
    return 'bi-file-earmark-text';
  }
  return 'bi-file-earmark';
}

function typeLabel(mediaType: string, filename: string) {
  return (extensionOf(filename) || mediaType.split('/').at(-1) || 'File').toUpperCase();
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

function draftDetail({ file, status }: DraftAttachment) {
  switch (status.kind) {
    case 'invalid':
      return status.problem;
    case 'uploading':
      return `Uploading… ${status.percent}%`;
    case 'failed':
      return "Couldn't upload. Send to retry.";
    default:
      return `${typeLabel(file.type, file.name)} · ${formatBytes(file.size)}`;
  }
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
        <AttachmentCard
          key={attachment.key}
          filename={attachment.file.name}
          mediaType={attachment.file.type}
          detail={draftDetail(attachment)}
          previewUrl={attachment.previewUrl}
          danger={attachment.status.kind === 'invalid' || attachment.status.kind === 'failed'}
          busy={attachment.status.kind === 'uploading'}
          onRemove={sending ? undefined : () => onRemove(attachment.key)}
        />
      ))}
    </ul>
  );
}

/** A sent image shown whole, or as a file card if it has no preview. */
function SentImage({
  filename,
  mediaType,
  previewUrl,
  downloadUrl,
}: {
  filename: string;
  mediaType: string;
  previewUrl: string;
  downloadUrl: string;
}) {
  // Uploads from before previews existed, and images the browser couldn't decode, have none.
  const [previewFailed, setPreviewFailed] = useState(false);
  if (previewFailed) {
    return (
      <AttachmentCard
        filename={filename}
        mediaType={mediaType}
        detail={typeLabel(mediaType, filename)}
        downloadUrl={downloadUrl}
      />
    );
  }
  return (
    <li className="course-agent-sent-image position-relative">
      <a href={downloadUrl} download={filename} aria-label={`Download ${filename}`}>
        <img
          src={previewUrl}
          alt=""
          className="d-block rounded-3 border"
          onError={() => setPreviewFailed(true)}
        />
        <span className="course-agent-attachment-download position-absolute top-0 start-0 w-100 h-100 rounded-3 d-flex align-items-center justify-content-center fs-4">
          <i className="bi bi-download" aria-hidden="true" />
        </span>
      </a>
    </li>
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
      {files.map(({ part, url }) =>
        part.mediaType.startsWith('image/') ? (
          <SentImage
            key={part.url}
            filename={part.filename ?? 'Image'}
            mediaType={part.mediaType}
            previewUrl={`${url}/thumbnail`}
            downloadUrl={url}
          />
        ) : (
          <AttachmentCard
            key={part.url}
            filename={part.filename ?? 'File'}
            mediaType={part.mediaType}
            detail={typeLabel(part.mediaType, part.filename ?? '')}
            downloadUrl={url}
          />
        ),
      )}
    </ul>
  );
}
