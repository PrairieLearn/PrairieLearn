import { z } from 'zod';

import {
  type Approval,
  approvalSchema,
  proposalContent,
} from '@prairielearn/course-agent-contract';

import type { CodexSandbox } from './codex.js';
import type { DynamicToolSpec } from './generated/v2/DynamicToolSpec.js';

export const pushSyncTool: DynamicToolSpec = {
  type: 'function',
  name: 'push_sync',
  description:
    'Request human review of committed course changes. Supply the base commit and proposed commit. Wait for the result before further edits. PL publishes the exact approved files to the configured repository; PL runs Course Sync after publication. The remote branch must already have an initial commit. After successful publication, reconcile your checkout with the published commit, preserving divergent work, before continuing.',
  inputSchema: {
    type: 'object',
    properties: {
      baseSha: { type: 'string' },
      proposedSha: { type: 'string' },
    },
    required: ['baseSha', 'proposedSha'],
    additionalProperties: false,
  },
};
const capturedFilesSchema = approvalSchema.pick({ diff: true, files: true });
const commits = z.object({
  baseSha: z.string().regex(/^[a-f0-9]{40}$/),
  proposedSha: z.string().regex(/^[a-f0-9]{40}$/),
});
/** Capture an immutable proposal from untrusted sandbox files; the PL webserver validates and publishes it separately. */
export async function captureApproval(sandbox: CodexSandbox, args: unknown): Promise<Approval> {
  const { baseSha, proposedSha } = commits.parse(args);
  const path = `/tmp/approval-${crypto.randomUUID()}.json`;
  let captured: { diff: string; files: Approval['files'] };
  // Read immutable blobs instead of the worktree; later edits cannot change the reviewed payload.
  const script = `const { execFileSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const base = "${baseSha === '0'.repeat(40) ? '4b825dc642cb6eb9a060e54bf8d69288fbee4904' : baseSha}";
const proposed = "${proposedSha}";
const utf8 = new TextDecoder("utf-8", { fatal: true });
const git = (...args) => utf8.decode(execFileSync("git", ["-C", "/workspace/repo", ...args]));
const raw = git("diff", "--raw", "--no-renames", "-z", base, proposed).split("\\0");
const files = [];
for (let i = 0; i < raw.length - 1; i += 2) {
  const [previousMode, mode] = raw[i].slice(1).split(" ");
  const path = raw[i + 1];
  const content = mode === "000000" ? null : git("show", proposed + ":" + path);
  files.push({ path, content, mode, previousMode });
}
const diff = git("diff", "--no-ext-diff", "--no-textconv", "--no-renames", base, proposed);
writeFileSync("${path}", JSON.stringify({ diff, files }));
`;
  try {
    const result = await sandbox.exec(`node - <<'CAPTURE'\n${script}\nCAPTURE`, { timeout: 10000 });
    if (!result.success) throw new Error('Could not capture committed text files.');
    captured = capturedFilesSchema.parse(JSON.parse((await sandbox.readFile(path)).content));
  } finally {
    await sandbox.deleteFile(path);
  }
  const { diff, files } = captured;
  if (new TextEncoder().encode(JSON.stringify(files)).length > 262144) {
    throw new Error('Captured files exceed 256 KiB.');
  }
  if (!diff.trim()) throw new Error('No reviewable committed changes.');
  if (new TextEncoder().encode(diff).length > 262144) throw new Error('Diff exceeds 256 KiB.');
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(proposalContent(baseSha, proposedSha, files)),
      ),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  return approvalSchema.parse({
    id: crypto.randomUUID(),
    baseSha,
    proposedSha,
    diff,
    files,
    digest,
    status: 'pending',
  });
}
