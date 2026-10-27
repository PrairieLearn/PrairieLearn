import { isUtf8 } from 'node:buffer';

import type { Octokit } from '@octokit/rest';
import { createTwoFilesPatch } from 'diff';

import {
  MAX_REVIEW_BYTES,
  MAX_REVIEW_FILE_BYTES,
  type ReviewSnapshot,
} from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';

/** Build the displayed diff from saved file contents and immutable GitHub blobs. */
export async function createReviewDiff(
  client: Octokit,
  { owner, repo }: { owner: string; repo: string },
  snapshot: ReviewSnapshot,
) {
  const { data: tree } = await client.git.getTree({
    owner,
    repo,
    tree_sha: snapshot.baseCommit,
    recursive: '1',
  });
  if (tree.truncated) {
    throw new HttpStatusError(
      400,
      'This repository is too large to review through the course agent.',
    );
  }
  const entries = new Map(tree.tree.map((entry) => [entry.path, entry]));
  const additions = new Map(snapshot.additions.map((file) => [file.path, file.contents]));
  const patches: string[] = [];
  let total = 0;
  for (const file of [...snapshot.additions, ...snapshot.deletions]) {
    const entry = entries.get(file.path);
    if (entry && (entry.type !== 'blob' || entry.mode !== '100644')) {
      throw new HttpStatusError(
        400,
        `Only non-executable regular files are supported: ${file.path}`,
      );
    }
    if (!entry && !additions.has(file.path)) {
      throw new HttpStatusError(400, `Deleted file does not exist: ${file.path}`);
    }
    if ((entry?.size ?? 0) > MAX_REVIEW_FILE_BYTES) {
      throw new HttpStatusError(400, `Review file is too large: ${file.path}`);
    }
    const old = entry
      ? Buffer.from(
          (await client.git.getBlob({ owner, repo, file_sha: entry.sha })).data.content,
          'base64',
        )
      : Buffer.alloc(0);
    const contents = additions.get(file.path);
    const next = contents === undefined ? Buffer.alloc(0) : Buffer.from(contents, 'base64');
    total += old.length + next.length;
    if (total > MAX_REVIEW_BYTES) throw new HttpStatusError(400, 'Reviewed changes are too large.');
    if (old.includes(0) || next.includes(0) || !isUtf8(old) || !isUtf8(next)) {
      patches.push(
        `Binary file ${file.path}: ${entry ? (contents === undefined ? 'deleted' : 'modified') : 'added'}\n`,
      );
    } else {
      patches.push(
        createTwoFilesPatch(
          entry ? file.path : '/dev/null',
          contents === undefined ? '/dev/null' : file.path,
          old.toString('utf8'),
          next.toString('utf8'),
        ),
      );
    }
  }
  return patches.join('\n');
}
