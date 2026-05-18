import path from 'node:path';

import { config } from '../../../lib/config.js';
import { type User } from '../../../lib/db-types.js';
import { createServerJob } from '../../../lib/server-jobs.js';
import { selectCourseInstanceByShortName } from '../../../models/course-instances.js';

import { cloneEvalRepo } from './clone-eval-repo.js';
import { loadManifest } from './manifest.js';
import { resolveAssessmentQuestion } from './resolve-target.js';
import { applyRubric } from './rubric.js';
import { runGrading } from './run-grading.js';
import { scaffoldCourse } from './scaffold-course.js';
import { seedAiGradingCredits } from './seed-credits.js';
import { type EvalRunResult, reportRunStats } from './stats.js';
import { importSubmissions } from './submissions.js';

/**
 * Entry point for the AI grading eval harness.
 *
 * Current scope: workflow steps 1 (clone the eval repo), 2 (load the
 * manifest), 3 (scaffold a synthetic course and sync it to the DB), 4
 * (upsert each eval's rubric onto its AQ), 5 (upload each eval's
 * submissions CSV with its `Rubric Grading` ground truth), and 6 (run AI
 * grading in `human_graded` mode against the imported ground truth).
 * Step 7 (aggregate stats roll-up) will be added next.
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

    const courseInstance = await selectCourseInstanceByShortName({
      course: scaffold.course,
      shortName: scaffold.courseInstanceShortName,
    });
    await seedAiGradingCredits({
      course_instance_id: courseInstance.id,
      user_id: user.id,
      job,
    });

    const evalResults: EvalRunResult[] = [];

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

      await importSubmissions({
        course: scaffold.course,
        assessment: target.assessment,
        submissionsCsvPath: path.join(loaded.absoluteDir, 'submissions.csv'),
        user,
        job,
      });

      const aiGradingJobSequenceId = await runGrading({
        course: scaffold.course,
        course_instance: target.course_instance,
        question: target.question,
        assessment: target.assessment,
        assessment_question: target.assessment_question,
        user,
        job,
      });

      evalResults.push({
        evalId: loaded.entry.id,
        target,
        aiGradingJobSequenceId,
        maxPoints: loaded.entry.max_points,
      });
    }

    await reportRunStats({ results: evalResults, job });

    job.info('');
    job.info('All steps complete.');
  });

  return serverJob.jobSequenceId;
}
