import { config } from '../../../lib/config.js';
import { type User } from '../../../lib/db-types.js';
import { createServerJob } from '../../../lib/server-jobs.js';

import { cloneEvalRepo } from './clone-eval-repo.js';
import { loadManifest } from './manifest.js';
import { resolveAssessmentQuestion } from './resolve-target.js';
import { applyRubric } from './rubric.js';
import { scaffoldCourse } from './scaffold-course.js';

/**
 * Entry point for the AI grading eval harness.
 *
 * Current scope: workflow steps 1 (clone the eval repo), 2 (load the
 * manifest), 3 (scaffold a synthetic course and sync it to the DB), and 4
 * (upsert each eval's rubric onto its AQ). Subsequent steps (upload
 * submissions, run AI grading, aggregate stats) will be added incrementally.
 *
 * Dev-mode only: the harness creates real `courses` rows, will eventually
 * call `uploadSubmissions()` (which wipes assessment instances), and writes
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

    const scaffold = await scaffoldCourse({ manifest, evals, evalsDir, user, job });
    job.info(`Synthetic course inserted: id=${scaffold.course.id} path=${scaffold.coursePath}`);

    for (const loaded of evals) {
      const target = await resolveAssessmentQuestion({
        course: scaffold.course,
        courseInstanceShortName: scaffold.courseInstanceShortName,
        evalId: loaded.entry.id,
      });
      await applyRubric({
        assessment: target.assessment,
        assessment_question_id: target.assessment_question.id,
        rubric: loaded.rubric,
        authn_user_id: user.id,
      });
      job.info(
        `Applied rubric for ${loaded.entry.id}: assessment_question_id=${target.assessment_question.id}`,
      );
    }

    job.info('Steps 1-4 complete (clone, load manifest, scaffold course, apply rubrics).');
  });

  return serverJob.jobSequenceId;
}
