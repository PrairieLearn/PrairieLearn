import { config } from '../../../lib/config.js';
import { type User } from '../../../lib/db-types.js';
import { createServerJob } from '../../../lib/server-jobs.js';

import { cloneEvalRepo } from './clone-eval-repo.js';
import { loadManifest } from './manifest.js';

/**
 * Entry point for the AI grading eval harness.
 *
 * Current scope: workflow steps 1 (clone the eval repo) and 2 (load the
 * manifest). Subsequent steps (scaffold synthetic course, upload rubric /
 * submissions, run AI grading, aggregate stats) will be added incrementally.
 *
 * Dev-mode only: the harness will eventually create real `courses` rows,
 * call `uploadSubmissions()` (which wipes assessment instances), and write
 * `ai_grading_jobs` rows.
 */
export async function runAiGradingEval({
  repository,
  branch,
  commit,
  user,
}: {
  repository: string;
  branch?: string | null;
  commit?: string | null;
  user: User;
}): Promise<string> {
  if (!config.devMode) {
    throw new Error('AI grading evals are only available in dev mode');
  }

  const serverJob = await createServerJob({
    type: 'ai_grading_eval',
    description: 'Run AI grading evals',
    userId: user.id,
    authnUserId: user.id,
  });

  serverJob.executeInBackground(async (job) => {
    job.info(`Repository: ${repository}`);
    if (branch) job.info(`Branch: ${branch}`);
    if (commit) job.info(`Commit: ${commit}`);

    const evalsDir = await cloneEvalRepo({ repository, branch, commit, job });
    job.info(`Eval repo ready at ${evalsDir}`);

    const { manifest, evals } = await loadManifest(evalsDir);
    job.info(`Loaded manifest "${manifest.name}" with ${evals.length} eval(s):`);
    for (const loaded of evals) {
      job.info(`  - ${loaded.entry.id} (${loaded.rubric.rubric_items.length} rubric item(s))`);
    }

    job.info('Steps 1 (clone) and 2 (load manifest) complete.');
  });

  return serverJob.jobSequenceId;
}
