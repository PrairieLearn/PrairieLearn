import path from 'node:path';

import { config } from '../../../lib/config.js';
import { type User } from '../../../lib/db-types.js';
import { createServerJob } from '../../../lib/server-jobs.js';
import { selectCourseInstanceByShortName } from '../../../models/course-instances.js';
import { selectCompleteRubric } from '../../../models/rubrics.js';
import { type AiGradingModelId } from '../ai-grading/ai-grading-models.shared.js';
import { deleteAiGradingJobs } from '../ai-grading/ai-grading-util.js';

import { cloneEvalRepo } from './clone-eval-repo.js';
import { loadManifest } from './manifest.js';
import { resolveAssessmentQuestion } from './resolve-target.js';
import { applyRubric } from './rubric.js';
import { runGrading } from './run-grading.js';
import { scaffoldCourse } from './scaffold-course.js';
import { seedAiGradingCredits } from './seed-credits.js';
import { type ModelRunSummary, reportRunStats, snapshotModelRunStats } from './stats.js';
import { importSubmissions } from './submissions.js';

/**
 * Entry point for the AI grading eval harness.
 *
 * Dev-mode only: creates real `courses` rows, calls `uploadSubmissions()`
 * (which wipes assessment instances on the synthetic course), and writes
 * `ai_grading_jobs` rows.
 *
 * Per eval, runs AI grading once per requested model, snapshotting stats
 * between runs.
 */
export async function runAiGradingEval({
  repository,
  branch,
  models,
  creditMilliDollars,
  user,
}: {
  repository: string;
  branch?: string | null;
  models: AiGradingModelId[];
  creditMilliDollars: number;
  user: User;
}): Promise<string> {
  if (!config.devMode) {
    throw new Error('AI grading evals are only available in dev mode');
  }
  if (models.length === 0) {
    throw new Error('At least one model is required to run AI grading evals');
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
    job.info(`Models (${models.length}): ${models.join(', ')}`);
    job.info(`Seed credit: $${(creditMilliDollars / 1000).toFixed(2)}`);

    const evalsDir = await cloneEvalRepo({ repository, branch, job });
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
      milli_dollars: creditMilliDollars,
      job,
    });

    const summaries: ModelRunSummary[] = [];

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

      const { rubric_items } = await selectCompleteRubric(target.assessment_question.id);

      for (const model of models) {
        const aiGradingJobSequenceId = await runGrading({
          course: scaffold.course,
          course_instance: target.course_instance,
          question: target.question,
          assessment: target.assessment,
          assessment_question: target.assessment_question,
          user,
          model_id: model,
          job,
        });
        summaries.push(
          await snapshotModelRunStats({
            evalId: loaded.entry.id,
            model,
            target,
            rubricItems: rubric_items,
            aiGradingJobSequenceId,
            job,
          }),
        );
        // Wipe so the next model starts from a clean slate — otherwise IQs
        // the next model fails to grade would inherit this model's grading
        // as their "latest" job and skew its classification stats.
        await deleteAiGradingJobs({
          assessment_question_ids: [target.assessment_question.id],
          authn_user_id: user.id,
        });
      }
    }

    reportRunStats({ summaries, job });

    job.info('');
    job.info('All steps complete.');
  });

  return serverJob.jobSequenceId;
}
