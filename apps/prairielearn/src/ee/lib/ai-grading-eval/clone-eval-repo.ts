import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';

import { contains } from '@prairielearn/path-utils';

import { config } from '../../../lib/config.js';
import { REPOSITORY_ROOT_PATH } from '../../../lib/paths.js';
import { type ServerJob } from '../../../lib/server-jobs.js';

export const EVAL_REPOS_ROOT = path.join(
  os.tmpdir(),
  'prairielearn-ai-grading-evals',
  'eval-repos',
);

/**
 * Derives a filesystem-safe directory name from a Git URL. The exact slug
 * doesn't need to round-trip — only to be stable per repo URL and free of
 * characters that would confuse the shell or filesystem.
 */
export function sanitizeRepoSlug(repository: string): string {
  const cleaned = repository
    .replace(/\.git$/, '')
    .replace(/^git@[^:]+:/, '')
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/^ssh:\/\/[^/]+\//, '');
  const slug = cleaned.replaceAll(/[^a-zA-Z0-9_.-]+/g, '-').replaceAll(/^-+|-+$/g, '');
  return slug || 'eval-repo';
}

/**
 * Clones the eval repo (or fast-forwards an existing clone) into a stable
 * tmp dir. Mirrors the git idiom used by `pullAndUpdateCourse` so the
 * `GIT_SSH_COMMAND` and safety-check behavior stay consistent with the rest
 * of PrairieLearn.
 *
 * Returns the absolute path of the checked-out repo.
 */
export async function cloneEvalRepo({
  repository,
  branch,
  job,
}: {
  repository: string;
  branch?: string | null;
  job: ServerJob;
}): Promise<string> {
  const slug = sanitizeRepoSlug(repository);
  const repoPath = path.join(EVAL_REPOS_ROOT, slug);

  if (contains(REPOSITORY_ROOT_PATH, repoPath)) {
    job.fail(
      `Refusing to clone eval repo into a path inside the PrairieLearn repository: ${repoPath}`,
    );
  }

  await fs.ensureDir(EVAL_REPOS_ROOT);

  const gitEnv = { ...process.env };
  if (config.gitSshCommand != null) {
    gitEnv.GIT_SSH_COMMAND = config.gitSshCommand;
  }

  const hasGitDir = await fs.pathExists(path.join(repoPath, '.git'));
  if (!hasGitDir) {
    if (await fs.pathExists(repoPath)) {
      job.info(`Removing non-git directory at ${repoPath}`);
      await fs.remove(repoPath);
    }
    job.info(`Cloning eval repo ${repository}`);
    const cloneArgs = ['clone'];
    if (branch) {
      cloneArgs.push('-b', branch);
    }
    cloneArgs.push(repository, repoPath);
    await job.exec('git', cloneArgs, { cwd: EVAL_REPOS_ROOT, env: gitEnv });
  } else {
    const gitOptions = { cwd: repoPath, env: gitEnv };
    job.info(`Updating existing eval repo clone at ${repoPath}`);
    await job.exec('git', ['remote', 'set-url', 'origin', repository], gitOptions);
    await job.exec('git', ['fetch', 'origin'], {
      ...gitOptions,
      cancelSignal: AbortSignal.timeout(30_000),
    });
    await job.exec('git', ['restore', '--staged', '--worktree', '.'], gitOptions);
    await job.exec('git', ['clean', '-fdx'], gitOptions);
  }

  if (branch) {
    const target = `origin/${branch}`;
    job.info(`Checking out ${target}`);
    await job.exec('git', ['reset', '--hard', target], { cwd: repoPath, env: gitEnv });
  } else {
    job.info('No branch specified; using default branch HEAD as cloned');
  }

  return repoPath;
}
