import { type FileUIPart, type UIMessage } from 'ai';
import clsx from 'clsx';
import { filesize } from 'filesize';
import { type DragEvent, type ReactNode, useCallback, useId, useState } from 'react';
import { Button, CloseButton, Modal } from 'react-bootstrap';

import {
  INLINE_IMAGE_TYPES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  type SentFilePart,
  THUMBNAIL_PIXELS,
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
  /** An object URL for an image's preview. */
  previewUrl: string | null;
  status: AttachmentStatus;
}

function statusOf(file: File): AttachmentStatus {
  const invalid = (problem: string) => ({ kind: 'invalid', problem }) as const;
  if (file.size > MAX_ATTACHMENT_BYTES) return invalid(`Over ${MAX_ATTACHMENT_SIZE}`);
  if (file.size === 0) return invalid('Empty file');
  return { kind: 'ready' };
}

export function revokePreviews(attachments: DraftAttachment[]) {
  for (const { previewUrl } of attachments) if (previewUrl) URL.revokeObjectURL(previewUrl);
}

/** Why an attachment can't be sent. The file limit depends on position, so removing one clears it. */
function invalidProblem({ status }: DraftAttachment, position: number) {
  if (position >= MAX_ATTACHMENTS_PER_MESSAGE) return `Over ${MAX_ATTACHMENTS_PER_MESSAGE} files`;
  return status.kind === 'invalid' ? status.problem : null;
}

export function hasInvalidAttachment(attachments: DraftAttachment[]) {
  return attachments.some((attachment, position) => invalidProblem(attachment, position) !== null);
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
      const added = files.map((file) => ({
        key: crypto.randomUUID(),
        file,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        status: statusOf(file),
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
 * A small WebP of an image for its tile in chat history, or null if the browser can't make one:
 * it can't decode the image (HEIC in most browsers, or a corrupt file) or lacks `OffscreenCanvas`.
 * Browsers without WebP encoding produce a PNG.
 */
async function makeThumbnail(file: File) {
  let bitmap: ImageBitmap | undefined;
  // The preview is optional, so no failure here may reject and hold up the message.
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, THUMBNAIL_PIXELS / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

/**
 * A preview is optional, so a failed one leaves a file tile in its place. The message waits for
 * it, so a stalled request gives up rather than holding up the send.
 */
async function uploadThumbnail(url: string, csrfToken: string, thumbnail: Blob) {
  await fetch(url, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/octet-stream' },
    body: thumbnail,
    signal: AbortSignal.timeout(10_000),
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

/**
 * A square tile for an attachment: an image's preview, or its name and either its type or a
 * problem.
 */
function AttachmentTile({
  filename,
  label,
  problem = null,
  percent = null,
  previewUrl = null,
  downloadUrl = null,
  onView,
  onRemove,
}: {
  filename: string;
  label: string;
  problem?: string | null;
  /** Upload progress, shown over the tile while uploading. */
  percent?: number | null;
  previewUrl?: string | null;
  downloadUrl?: string | null;
  /** Opens a sent image in the viewer; an image whose preview fails to load downloads instead. */
  onView?: () => void;
  onRemove?: () => void;
}) {
  // Uploads from before previews existed, and images the browser couldn't decode, have none.
  const [previewFailed, setPreviewFailed] = useState(false);
  const previewing = previewUrl !== null && !problem && !previewFailed;
  const viewable = onView !== undefined && !problem && !previewFailed;
  // Spans, since a viewable tile's content sits inside a button.
  const content = (
    <span className="d-block position-relative h-100 overflow-hidden rounded-3">
      {previewing ? (
        <img
          src={previewUrl}
          alt=""
          loading="lazy"
          className="w-100 h-100 object-fit-cover"
          onError={() => setPreviewFailed(true)}
        />
      ) : (
        <span className="d-flex flex-column justify-content-between h-100 p-2">
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
        </span>
      )}
      {percent !== null && (
        <span className="course-agent-attachment-overlay position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center fw-medium">
          {percent}%
        </span>
      )}
      {downloadUrl && (
        <span className="course-agent-attachment-overlay course-agent-attachment-download position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center fs-5">
          <i
            className={clsx('bi', viewable ? 'bi-arrows-angle-expand' : 'bi-download')}
            aria-hidden="true"
          />
        </span>
      )}
    </span>
  );
  return (
    <li
      className={clsx(
        'course-agent-attachment position-relative flex-shrink-0 rounded-3 border',
        problem
          ? 'course-agent-attachment-invalid border-danger bg-danger-subtle'
          : 'bg-body-tertiary',
      )}
      title={filename}
    >
      {viewable ? (
        <button
          type="button"
          className="d-block w-100 h-100 p-0 border-0 bg-transparent text-reset"
          aria-label={`View ${filename}`}
          onClick={onView}
        >
          {content}
        </button>
      ) : downloadUrl ? (
        <a
          href={downloadUrl}
          download={filename}
          className="d-block h-100 text-reset text-decoration-none"
          aria-label={`Download ${filename}`}
        >
          {content}
        </a>
      ) : (
        content
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

function draftProblem(attachment: DraftAttachment, position: number) {
  return (
    invalidProblem(attachment, position) ??
    (attachment.status.kind === 'failed' ? 'Upload failed' : null)
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
      {attachments.map((attachment, position) => (
        <AttachmentTile
          key={attachment.key}
          filename={attachment.file.name}
          label={typeLabel(attachment.file.type, attachment.file.name)}
          problem={draftProblem(attachment, position)}
          percent={attachment.status.kind === 'uploading' ? attachment.status.percent : null}
          previewUrl={attachment.previewUrl}
          onRemove={sending ? undefined : () => onRemove(attachment.key)}
        />
      ))}
    </ul>
  );
}

/** A sent image, viewed in the browser at full size. */
interface ViewedImage {
  filename: string;
  url: string;
}

function ImageViewer({
  image,
  show,
  onHide,
}: {
  image: ViewedImage | null;
  show: boolean;
  onHide: () => void;
}) {
  const titleId = useId();
  return (
    <Modal show={show} size="xl" aria-labelledby={titleId} centered onHide={onHide}>
      {image && (
        <>
          <Modal.Header className="gap-2">
            <Modal.Title id={titleId} as="h2" className="h6 text-truncate me-auto">
              {image.filename}
            </Modal.Title>
            <a
              href={image.url}
              download={image.filename}
              className="btn btn-sm btn-outline-secondary text-nowrap"
            >
              <i className="bi bi-download me-1" aria-hidden="true" />
              Download
            </a>
            <CloseButton aria-label="Close" className="ms-0" onClick={onHide} />
          </Modal.Header>
          <Modal.Body className="course-agent-image-viewer d-flex justify-content-center p-2">
            <img src={image.url} alt={image.filename} className="mw-100" />
          </Modal.Body>
        </>
      )}
    </Modal>
  );
}

function useImageViewer() {
  // The image stays set while the viewer fades out, so it doesn't empty first.
  const [viewed, setViewed] = useState<ViewedImage | null>(null);
  const [viewing, setViewing] = useState(false);
  return {
    view: (image: ViewedImage) => {
      setViewed(image);
      setViewing(true);
    },
    viewer: <ImageViewer image={viewed} show={viewing} onHide={() => setViewing(false)} />,
  };
}

/**
 * A sent message's attachments, shown above its text. An image with a preview opens in a viewer,
 * and anything else downloads when clicked.
 */
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
  const { view, viewer } = useImageViewer();
  if (files.length === 0) return null;
  return (
    <>
      <ul
        className="list-unstyled d-flex flex-wrap justify-content-end gap-2 m-0"
        aria-label="Attachments"
      >
        {files.map(({ part, url }) => {
          const filename = part.filename ?? 'File';
          const image = part.mediaType.startsWith('image/');
          // Other images may have a preview, but the browser can't display the original.
          const viewable = INLINE_IMAGE_TYPES.includes(part.mediaType);
          return (
            <AttachmentTile
              key={part.url}
              filename={filename}
              label={typeLabel(part.mediaType, part.filename ?? '')}
              previewUrl={image ? `${url}/thumbnail` : null}
              downloadUrl={url}
              onView={viewable ? () => view({ filename, url }) : undefined}
            />
          );
        })}
      </ul>
      {viewer}
    </>
  );
}

/**
 * The largest image the agent sent whose tile shows the image itself, since the agent's images
 * have no thumbnail. A larger one shows its name, so history doesn't load many large images.
 */
const MAX_AGENT_PREVIEW_BYTES = 4 * 1024 * 1024;

/**
 * Files the agent sent, shown where it sent them in its reply. An image the browser can display
 * opens in a viewer, and anything else downloads when clicked.
 */
export function AgentFiles({
  files,
  sentFilesUrl,
}: {
  files: SentFilePart[];
  sentFilesUrl: string;
}) {
  const { view, viewer } = useImageViewer();
  return (
    <>
      <ul className="list-unstyled d-flex flex-wrap gap-2 m-0" aria-label="Files from the agent">
        {files.map((file) => {
          const url = `${sentFilesUrl}/${file.id}`;
          const image = file.mediaType !== undefined && INLINE_IMAGE_TYPES.includes(file.mediaType);
          return (
            <AttachmentTile
              key={file.id}
              filename={file.filename}
              label={typeLabel(file.mediaType ?? '', file.filename)}
              previewUrl={image && file.size <= MAX_AGENT_PREVIEW_BYTES ? url : null}
              downloadUrl={url}
              onView={image ? () => view({ filename: file.filename, url }) : undefined}
            />
          );
        })}
      </ul>
      {viewer}
    </>
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
