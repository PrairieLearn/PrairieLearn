import path from 'node:path';

import { config } from '../../../lib/config.js';
import { type User } from '../../../lib/db-types.js';
import { createServerJob } from '../../../lib/server-jobs.js';
import { selectCourseInstanceByShortName } from '../../../models/course-instances.js';
import { selectCompleteRubric } from '../../../models/rubrics.js';
import { type AiGradingModelId } from '../ai-grading/ai-grading-models.shared.js';
import { deleteAiGradingJobs } from '../ai-grading/ai-grading-util.js';

import { generateAnnotationPacket } from './annotation-packet.js';
import { type ClassifiedCase, classifyRun, seedHumanGradingVerdicts } from './classify.js';
import { EVAL_REPOS_ROOT, cloneEvalRepo, sanitizeRepoSlug } from './clone-eval-repo.js';
import { loadManifest } from './manifest.js';
import { resolveAssessmentQuestion } from './resolve-target.js';
import { applyRubric } from './rubric.js';
import { runGrading } from './run-grading.js';
import { scaffoldCourse } from './scaffold-course.js';
import { seedAiGradingCredits } from './seed-credits.js';
import { type ModelRunSummary, reportRunStats, snapshotModelRunStats } from './stats.js';
import { importSubmissions } from './submissions.js';
import { buildVerdictMap, loadVerdictsFromCsvs } from './verdicts.js';

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
  generateAnnotationPackets,
  user,
}: {
  repository: string;
  branch?: string | null;
  models: AiGradingModelId[];
  creditMilliDollars: number;
  generateAnnotationPackets: boolean;
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
    job.info(`Generate annotation packets: ${generateAnnotationPackets ? 'yes' : 'no'}`);

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
    const verdictFilesByEval = new Map<string, Map<string, number>>();
    const annotationPacketsByEval = new Map<string, string>();

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

      const seedEntries = await seedHumanGradingVerdicts({
        assessment_question_id: target.assessment_question.id,
        eval_id: loaded.entry.id,
      });
      const csvEntries = await loadVerdictsFromCsvs(loaded, job);
      const verdictMap = buildVerdictMap([...seedEntries, ...csvEntries]);
      job.info(
        `Verdicts for ${loaded.entry.id}: ${seedEntries.length} from submissions.csv, ${csvEntries.length} from verdicts/*.csv`,
      );

      if (csvEntries.length > 0) {
        const filenames = new Map<string, number>();
        for (const e of csvEntries) {
          const filename = e.source.startsWith('csv:') ? e.source.slice(4) : e.source;
          filenames.set(filename, (filenames.get(filename) ?? 0) + 1);
        }
        verdictFilesByEval.set(loaded.entry.id, filenames);
      }

      const unsureByCase = new Map<
        string,
        { case_data: ClassifiedCase; models: AiGradingModelId[] }
      >();

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

        const classified = await classifyRun({
          assessment_question_id: target.assessment_question.id,
          eval_id: loaded.entry.id,
          verdictMap,
          ai_job_sequence_id: aiGradingJobSequenceId,
        });

        for (const c of classified.cases) {
          if (c.classification !== 'unsure') continue;
          const existing = unsureByCase.get(c.case_id);
          if (existing) {
            existing.models.push(model);
          } else {
            unsureByCase.set(c.case_id, { case_data: c, models: [model] });
          }
        }

        summaries.push(
          await snapshotModelRunStats({
            evalId: loaded.entry.id,
            model,
            target,
            rubricItems: rubric_items,
            aiGradingJobSequenceId,
            classified,
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

      if (generateAnnotationPackets) {
        const unsureCases = [...unsureByCase.values()];
        if (unsureCases.length === 0) {
          job.info(`No unsure cases for ${loaded.entry.id}; skipping annotation packet.`);
        } else {
          const packetDir = path.join(
            EVAL_REPOS_ROOT,
            '..',
            'annotation-packets',
            sanitizeRepoSlug(repository),
          );
          const packetPath = await generateAnnotationPacket({
            loadedEval: loaded,
            unsureCases,
            target,
            course: scaffold.course,
            user,
            packetDir,
            job,
          });
          annotationPacketsByEval.set(loaded.entry.id, packetPath);
        }
      }
    }

    reportRunStats({ summaries, verdictFilesByEval, annotationPacketsByEval, job });

    job.info('');
    job.info('All steps complete.');
  });

  return serverJob.jobSequenceId;
}
