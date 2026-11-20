import { MAX_ATTACHMENT_BYTES, type SentFilePart } from '@prairielearn/course-agent-types';

import type { ToolReply } from '../sandbox/codex.js';
import type { CourseSandbox } from '../sandbox/sandbox.js';

import { type UploadQuota, safeFilename, sentFileKey } from './attachments.js';

const notSent = (problems: string[]): ToolReply => ({
  success: false,
  text: `No files were sent. ${problems.join('; ')}.`,
});

/**
 * Serves `send_files`: stores the files where the instructor can download them and shows them in
 * the reply. A call sends every file or none, so the agent never has to work out which arrived.
 */
export async function sendFiles({
  paths,
  conversationId,
  sandbox,
  bucket,
  quota,
  show,
}: {
  paths: string[];
  conversationId: string;
  sandbox: Pick<CourseSandbox, 'statFiles' | 'storeFile'>;
  bucket: Pick<R2Bucket, 'delete'>;
  quota: UploadQuota;
  /** Adds the files to the reply, or returns false if the turn can no longer show them. */
  show: (files: SentFilePart[]) => boolean;
}): Promise<ToolReply> {
  const stats = await sandbox.statFiles(paths);
  const sizes: number[] = [];
  const problems: string[] = [];
  for (const [index, path] of paths.entries()) {
    const stat = stats[index];
    if ('problem' in stat) {
      problems.push(`${path}: ${stat.problem}`);
    } else if (stat.size === 0) {
      problems.push(`${path}: empty file`);
    } else if (stat.size > MAX_ATTACHMENT_BYTES) {
      problems.push(`${path}: larger than ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB`);
    } else {
      sizes.push(stat.size);
    }
  }
  if (problems.length > 0) return notSent(problems);

  const reserved: number[] = [];
  const release = () => Promise.all(reserved.map((size) => quota.release(size)));
  for (const size of sizes) {
    if (!(await quota.reserve(size))) {
      await release();
      return notSent(['this conversation has reached its limit for sent files']);
    }
    reserved.push(size);
  }
  const files: SentFilePart[] = paths.map((path, index) => ({
    id: crypto.randomUUID(),
    filename: safeFilename(path),
    size: sizes[index],
  }));
  const keys = files.map(({ id }) => sentFileKey(conversationId, id));
  // A file the instructor never sees would count toward the cap until it expired, so a call that
  // fails after storing some files deletes them. Every store has settled by then.
  const discard = async () => {
    await bucket.delete(keys);
    await release();
  };
  const stored = await Promise.allSettled(
    files.map(({ size }, index) => sandbox.storeFile(paths[index], size, keys[index])),
  );
  const failure = stored.find((result) => result.status === 'rejected');
  if (failure) {
    await discard();
    throw failure.reason;
  }
  for (const [index, result] of stored.entries()) {
    if (result.status === 'rejected') continue;
    if ('problem' in result.value) {
      problems.push(`${paths[index]}: ${result.value.problem}`);
    } else if (result.value.mediaType) {
      files[index].mediaType = result.value.mediaType;
    }
  }
  if (problems.length > 0) {
    await discard();
    return notSent(problems);
  }
  if (!show(files)) {
    await discard();
    return { success: false, text: 'No files were sent. The turn ended first.' };
  }
  return {
    success: true,
    text: `Sent ${files.map(({ filename }) => filename).join(', ')}. The instructor sees them in the chat, where images are displayed, and can download them; do not repeat their contents in your message.`,
  };
}
