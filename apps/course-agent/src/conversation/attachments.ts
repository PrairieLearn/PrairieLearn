import type { UIMessage } from 'ai';

import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_CONVERSATION_ATTACHMENTS,
  MAX_CONVERSATION_ATTACHMENT_BYTES,
  attachmentIdOf,
} from '@prairielearn/course-agent-types';

/**
 * Outside the checkpointed session and the course checkout, so neither copies attachments. The
 * image creates it root-owned, so the agent can't replace it with a link that root then writes
 * through.
 */
export const UPLOADS_DIR = '/uploads';

export const uploadPrefix = (conversationId: string) => `uploads/${conversationId}/`;
export const uploadKey = (conversationId: string, uploadId: string) =>
  `${uploadPrefix(conversationId)}${uploadId}`;

interface UploadTotals {
  count: number;
  bytes: number;
}

/**
 * A conversation's upload totals, counted from R2 once and then kept by its Durable Object, the
 * single writer that serializes reservations. Uploads that were never sent count too.
 */
export class UploadQuota {
  private totals: Promise<UploadTotals> | null = null;

  constructor(private readonly countUploads: () => Promise<UploadTotals>) {}

  /** Whether an upload of this size fits under the cap; if so, it counts until released. */
  async reserve(size: number) {
    this.totals ??= this.countUploads().catch((error: unknown) => {
      this.totals = null;
      throw error;
    });
    const totals = await this.totals;
    // Nothing awaits between the check and the update, so concurrent reservations see each other.
    if (
      totals.count >= MAX_CONVERSATION_ATTACHMENTS ||
      totals.bytes + size > MAX_CONVERSATION_ATTACHMENT_BYTES
    ) {
      return false;
    }
    totals.count += 1;
    totals.bytes += size;
    return true;
  }

  /** Return a reservation whose upload was not stored. */
  async release(size: number) {
    // A Durable Object that restarted since the reservation counts from R2 again, which already
    // leaves this upload out.
    if (!this.totals) return;
    const totals = await this.totals;
    totals.count -= 1;
    totals.bytes -= size;
  }
}

export interface Attachment {
  id: string;
  filename: string;
}

/**
 * The browser controls message parts, so a user message keeps only file parts that point at
 * uploads. Contents sent inline, such as data URLs, never reach chat history.
 */
export function keepUploadReferences(message: UIMessage): UIMessage {
  if (message.role !== 'user') return message;
  let files = 0;
  const parts = message.parts.filter(
    (part) =>
      part.type !== 'file' ||
      (attachmentIdOf(part.url) !== null && ++files <= MAX_ATTACHMENTS_PER_MESSAGE),
  );
  return parts.length === message.parts.length ? message : { ...message, parts };
}

export function attachmentOf(part: UIMessage['parts'][number]): Attachment | null {
  if (part.type !== 'file') return null;
  const id = attachmentIdOf(part.url);
  return id ? { id, filename: part.filename ?? '' } : null;
}

export function attachmentsOf(message: UIMessage) {
  return message.parts.map(attachmentOf).filter((attachment) => attachment !== null);
}

/**
 * The attachments a turn copies into the sandbox: its own message's, plus every earlier one when
 * the turn starts a sandbox, since a new or restored sandbox has none.
 */
export function attachmentsToWrite(
  earlier: UIMessage[],
  message: UIMessage | null,
  startup: boolean,
) {
  return [
    ...(startup ? earlier.filter(({ role }) => role === 'user').flatMap(attachmentsOf) : []),
    ...(message ? attachmentsOf(message) : []),
  ];
}

/** Under the 255-byte filename limit, with room for a short extension. */
const MAX_NAME_BYTES = 200;

/** Each upload gets its own directory, so files with the same name don't collide. */
export function attachmentPath({ id, filename }: Attachment) {
  const name = truncateName(
    [...(filename.split(/[/\\]/).at(-1) ?? '')]
      .filter((character) => character.charCodeAt(0) >= 32 && character !== '\u007f')
      .join('')
      .trim(),
  );
  return `${UPLOADS_DIR}/${id}/${name === '' || name === '.' || name === '..' ? 'file' : name}`;
}

/** Shorten a name to fit `MAX_NAME_BYTES` of UTF-8, keeping its extension for the model. */
function truncateName(name: string) {
  const encoder = new TextEncoder();
  if (encoder.encode(name).length <= MAX_NAME_BYTES) return name;
  const extension = /\.[^.]{1,16}$/.exec(name)?.[0] ?? '';
  let bytes = encoder.encode(extension).length;
  let stem = '';
  for (const character of name.slice(0, name.length - extension.length)) {
    bytes += encoder.encode(character).length;
    if (bytes > MAX_NAME_BYTES) break;
    stem += character;
  }
  return stem + extension;
}

/**
 * A message's turn text. Codex has no input for arbitrary files, so this lists attachments by path
 * in the same format the Codex desktop app sends, and the model reads them with its tools. Images
 * also go to Codex as `localImage` input.
 */
export function formatRequest(text: string, attachments: Attachment[], images: Set<string>) {
  if (attachments.length === 0) return text;
  const files = attachments.map((attachment) => {
    const path = attachmentPath(attachment);
    const image = images.has(attachment.id) ? 'Image attachment: true\n' : '';
    return `## ${path.slice(path.lastIndexOf('/') + 1)}: ${path}\n${image}`;
  });
  return [
    '\n# Files mentioned by the user:\n\n',
    files.join('\n'),
    `\n## My request:\n${text}\n`,
  ].join('');
}

/** Enough leading bytes to recognize every image type `isImage()` accepts. */
export const IMAGE_SIGNATURE_BYTES = 12;

/** The image types the model can view, recognized by their contents rather than their name. */
export function isImage(bytes: Uint8Array) {
  const startsWith = (signature: number[], offset = 0) =>
    signature.every((byte, index) => bytes[offset + index] === byte);
  const ascii = (text: string) => [...text].map((character) => character.charCodeAt(0));
  return (
    startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
    startsWith([0xff, 0xd8, 0xff]) ||
    startsWith(ascii('GIF87a')) ||
    startsWith(ascii('GIF89a')) ||
    (startsWith(ascii('RIFF')) && startsWith(ascii('WEBP'), 8))
  );
}
