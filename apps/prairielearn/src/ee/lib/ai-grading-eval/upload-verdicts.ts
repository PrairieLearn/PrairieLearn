import crypto from 'node:crypto';
import path from 'node:path';

import { parse as csvParse } from 'csv-parse/sync';
import fs from 'fs-extra';

import { config } from '../../../lib/config.js';
import { type User } from '../../../lib/db-types.js';
import { createServerJob } from '../../../lib/server-jobs.js';

import { cloneEvalRepo } from './clone-eval-repo.js';
import { commitAndPushEvalRepo } from './git-commit.js';
import { loadManifest } from './manifest.js';
import { recomputeStatsFromSnapshots } from './recompute-from-snapshots.js';

interface UploadedFile {
  originalname: string;
  buffer: Buffer;
}

/**
 * Accepts one or more verdict CSVs uploaded from the admin page, drops each
 * into the matching `<eval>/verdicts/` directory in the cloned eval repo, and
 * pushes a single commit upstream. Dedupe is content-hash-based: re-uploading
 * an identical CSV is a no-op.
 */
export async function uploadVerdictCsvs({
  repository,
  branch,
  files,
  user,
}: {
  repository: string;
  branch?: string | null;
  files: UploadedFile[];
  user: User;
}): Promise<string> {
  if (!config.devMode) {
    throw new Error('AI grading eval verdicts upload is only available in dev mode');
  }
  if (!config.serverCanonicalHost) {
    throw new Error(
      'serverCanonicalHost is not configured. Set it in config.json so eval output can include working deep links to the synthetic course.',
    );
  }
  if (files.length === 0) {
    throw new Error('At least one verdicts CSV must be uploaded');
  }

  const serverJob = await createServerJob({
    type: 'ai_grading_eval_verdicts_upload',
    description: 'Upload AI grading eval verdicts',
    userId: user.id,
    authnUserId: user.id,
  });

  serverJob.executeInBackground(async (job) => {
    job.info(`Repository: ${repository}`);
    if (branch) job.info(`Branch: ${branch}`);
    job.info(`Uploading ${files.length} file(s)`);

    const evalsDir = await cloneEvalRepo({ repository, branch, job });
    job.info(`Eval repo ready at ${evalsDir}`);

    const { evals } = await loadManifest(evalsDir);
    const evalById = new Map(evals.map((e) => [e.entry.id, e]));

    const writtenRelPaths: string[] = [];
    let duplicates = 0;
    let rejected = 0;

    for (const file of files) {
      const reason = await processOneFile(file, evalById, evalsDir, job);
      if (reason === 'written') writtenRelPaths.push(relPath(file, evalsDir));
      else if (reason === 'duplicate') duplicates += 1;
      else rejected += 1;
    }

    job.info(
      `Summary: ${writtenRelPaths.length} written, ${duplicates} duplicate(s) skipped, ${rejected} rejected.`,
    );

    if (writtenRelPaths.length > 0) {
      await commitAndPushEvalRepo({
        cwd: evalsDir,
        branch,
        message: `Add ${writtenRelPaths.length} verdicts file(s)\n\n${writtenRelPaths.join('\n')}`,
        job,
      });
    } else {
      job.info('No new verdict files to commit.');
    }

    job.info('');
    job.info('Recomputing stats from persisted run snapshots with the latest verdicts...');
    await recomputeStatsFromSnapshots({ evals, job });
  });

  return serverJob.jobSequenceId;
}

type ProcessResult = 'written' | 'duplicate' | 'rejected';

function relPath(file: UploadedFile, _evalsDir: string): string {
  return file.originalname;
}

async function processOneFile(
  file: UploadedFile,
  evalById: Map<string, { entry: { id: string; directory: string }; absoluteDir: string }>,
  evalsDir: string,
  job: { info: (s: string) => void; warn: (s: string) => void },
): Promise<ProcessResult> {
  let rows: Record<string, string>[];
  try {
    rows = csvParse(file.buffer, {
      columns: true,
      bom: true,
      trim: true,
      skip_empty_lines: true,
    });
  } catch (err) {
    job.warn(`${file.originalname}: failed to parse CSV (${(err as Error).message}). Skipped.`);
    return 'rejected';
  }

  if (rows.length === 0) {
    job.warn(`${file.originalname}: no rows. Skipped.`);
    return 'rejected';
  }

  const evalIds = new Set(
    rows.map((r) => (typeof r.eval_id === 'string' ? r.eval_id.trim() : '')).filter((v) => !!v),
  );
  if (evalIds.size === 0) {
    job.warn(`${file.originalname}: missing eval_id column. Skipped.`);
    return 'rejected';
  }
  if (evalIds.size > 1) {
    job.warn(
      `${file.originalname}: rows span multiple eval_ids (${[...evalIds].join(', ')}). Skipped.`,
    );
    return 'rejected';
  }

  const evalId = [...evalIds][0];
  const loaded = evalById.get(evalId);
  if (!loaded) {
    job.warn(`${file.originalname}: eval_id "${evalId}" not found in manifest. Skipped.`);
    return 'rejected';
  }

  const hash = crypto.createHash('sha256').update(file.buffer).digest('hex').slice(0, 12);
  const targetDir = path.join(loaded.absoluteDir, 'verdicts');
  const targetFile = path.join(targetDir, `verdicts-${hash}.csv`);

  await fs.ensureDir(targetDir);
  if (await fs.pathExists(targetFile)) {
    job.info(
      `${file.originalname}: identical content already present (${path.relative(evalsDir, targetFile)}). Skipped.`,
    );
    return 'duplicate';
  }

  await fs.writeFile(targetFile, file.buffer);
  job.info(`${file.originalname} → ${path.relative(evalsDir, targetFile)}`);
  return 'written';
}
