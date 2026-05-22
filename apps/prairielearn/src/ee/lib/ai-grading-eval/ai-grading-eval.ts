import path from 'node:path';

import { config } from '../../../lib/config.js';
import { type User } from '../../../lib/db-types.js';
import { createServerJob } from '../../../lib/server-jobs.js';
import { selectCourseInstanceByShortName } from '../../../models/course-instances.js';
import { type AiGradingModelId } from '../ai-grading/ai-grading-models.shared.js';
import { deleteAiGradingJobs } from '../ai-grading/ai-grading-util.js';

import { generateAnnotationPacket } from './annotation-packet.js';
import { type ClassifiedCase, classifyRun, seedHumanGradingVerdicts } from './classify.js';
import { EVAL_REPOS_ROOT, cloneEvalRepo, sanitizeRepoSlug } from './clone-eval-repo.js';
import { commitAndPushEvalRepo } from './git-commit.js';
import { loadManifest } from './manifest.js';
import { resolveAssessmentQuestion } from './resolve-target.js';
import { applyRubric } from './rubric.js';
import { runGrading } from './run-grading.js';
import { scaffoldCourse } from './scaffold-course.js';
import { seedAiGradingCredits } from './seed-credits.js';
import { writeRunSnapshot } from './snapshot.js';
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
    const verdictFilesByEval = new Map<string, Map<string, number>>();
    const annotationPacketsByEval = new Map<string, string>();
    const snapshotRelPaths: string[] = [];

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

      const casesById = new Map<
        string,
        { case_data: ClassifiedCase; models: AiGradingModelId[] }
      >();

      for (const [modelIdx, model] of models.entries()) {
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
          const existing = casesById.get(c.case_id);
          if (existing) {
            existing.models.push(model);
          } else {
            casesById.set(c.case_id, { case_data: c, models: [model] });
          }
        }

        const { summary, snapshot } = await snapshotModelRunStats({
          evalId: loaded.entry.id,
          model,
          target,
          aiGradingJobSequenceId,
          classified,
          seedVerdicts: seedEntries,
          job,
        });
        summaries.push(summary);

        const snapshotPath = await writeRunSnapshot({
          evalAbsoluteDir: loaded.absoluteDir,
          snapshot,
        });
        const snapshotRel = path.relative(evalsDir, snapshotPath);
        snapshotRelPaths.push(snapshotRel);
        job.info(`  Wrote run snapshot: ${snapshotRel}`);
        // Wipe AI grading jobs between models so the next model starts from a
        // clean slate — otherwise IQs the next model fails to grade would
        // inherit this model's grading as their "latest" job and skew its
        // classification stats. We deliberately skip the wipe after the
        // final model so the synthetic course retains its results for
        // post-run investigation in the instructor UI.
        const isLastModel = modelIdx === models.length - 1;
        if (!isLastModel) {
          await deleteAiGradingJobs({
            assessment_question_ids: [target.assessment_question.id],
            authn_user_id: user.id,
          });
        }
      }

      const allCases = [...casesById.values()];
      const hasUnsure = allCases.some((c) => c.case_data.classification === 'unsure');
      if (!hasUnsure) {
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
          cases: allCases,
          target,
          course: scaffold.course,
          user,
          packetDir,
          job,
        });
        annotationPacketsByEval.set(loaded.entry.id, packetPath);
      }
    }

    reportRunStats({ summaries, verdictFilesByEval, annotationPacketsByEval, job });

    if (snapshotRelPaths.length > 0) {
      job.info('');
      job.info(
        `Committing ${snapshotRelPaths.length} run snapshot(s) to the eval repo so verdict re-uploads can re-render these stats:`,
      );
      for (const rel of snapshotRelPaths) {
        job.info(`  ${rel}`);
      }
      await commitAndPushEvalRepo({
        cwd: evalsDir,
        branch,
        message: `Add ${snapshotRelPaths.length} run snapshot(s)\n\n${snapshotRelPaths.join('\n')}`,
        job,
      });
    }

    if (annotationPacketsByEval.size > 0) {
      job.info('');
      job.info('Next steps:');
      job.info(
        '  1. Copy and paste the file URL(s) below into your browser to open the annotation form locally:',
      );
      for (const [evalId, packetPath] of annotationPacketsByEval) {
        job.info('');
        job.info(`       ${evalId}`);
        job.info('');
        job.info(`         file://${packetPath}`);
        job.info('');
      }
      job.info('  2. You or another course staff member should complete the form.');
      job.info('  3. Export the CSV.');
      job.info('  4. Upload it under "Upload verdict CSVs" when you\'re done.');
    }
  });

  return serverJob.jobSequenceId;
}
