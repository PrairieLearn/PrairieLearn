import { z } from 'zod';

import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import {
  type Assessment,
  type AssessmentQuestion,
  type Course,
  type CourseInstance,
  type Question,
  type User,
} from '../../../lib/db-types.js';
import { type ServerJob } from '../../../lib/server-jobs.js';
import {
  type AiGradingModelId,
  DEFAULT_AI_GRADING_MODEL,
} from '../ai-grading/ai-grading-models.shared.js';
import { aiGrade } from '../ai-grading/ai-grading.js';

import { forwardChildJobOutput, waitForJobSequence } from './child-job.js';

const sql = loadSqlEquiv(import.meta.url);

const CountsSchema = z.object({
  total_instance_questions: z.coerce.number(),
  iqs_with_manual_grading: z.coerce.number(),
  iqs_with_ai_grading: z.coerce.number(),
});

/**
 * Diagnostic snapshot of how many instance questions on an AQ are eligible
 * for `aiGrade({mode:'human_graded'})`. If `iqs_with_manual_grading` is
 * zero, AI grading will silently grade nothing — surface that loudly.
 */
async function snapshotCounts(assessment_question_id: string) {
  return await queryRow(sql.snapshot_counts, { assessment_question_id }, CountsSchema);
}

/**
 * Runs AI grading on the synthetic AQ via PL's existing `aiGrade`. Uses
 * `'human_graded'` mode so AI grading only fires on the submissions that
 * received manual ground truth from the uploaded CSV, giving the existing
 * AI-vs-human stats infrastructure something to compare against.
 *
 * Polls the AI grading job sequence to completion, forwards its full output
 * back into the eval orchestrator's log so failures are visible without
 * leaving the page, and surfaces an explicit warning if zero instance
 * questions were eligible.
 *
 * Returns the AI grading job sequence id.
 */
export async function runGrading({
  course,
  course_instance,
  question,
  assessment,
  assessment_question,
  user,
  model_id = DEFAULT_AI_GRADING_MODEL,
  job,
}: {
  course: Course;
  course_instance: CourseInstance;
  question: Question;
  assessment: Assessment;
  assessment_question: AssessmentQuestion;
  user: User;
  model_id?: AiGradingModelId;
  job: ServerJob;
}): Promise<string> {
  const before = await snapshotCounts(assessment_question.id);
  job.info(
    `Before AI grading: ${before.total_instance_questions} instance question(s), ` +
      `${before.iqs_with_manual_grading} with manual grading, ` +
      `${before.iqs_with_ai_grading} with AI grading.`,
  );
  if (before.iqs_with_manual_grading === 0) {
    job.warn(
      "Zero instance questions have a manual grading job — aiGrade in 'human_graded' mode will not grade anything. " +
        'Check the submission upload log above for per-row errors.',
    );
  }

  const urlPrefix = `/pl/course_instance/${course_instance.id}/instructor`;
  job.info(`Starting AI grading on assessment_question_id=${assessment_question.id}`);

  const aiGradingJobSequenceId = await aiGrade({
    course,
    course_instance,
    question,
    assessment,
    assessment_question,
    urlPrefix,
    authn_user_id: user.id,
    user_id: user.id,
    mode: 'human_graded',
    model_id,
  });
  job.info(`AI grading job sequence: ${aiGradingJobSequenceId}`);

  const status = await waitForJobSequence(aiGradingJobSequenceId);
  await forwardChildJobOutput({
    childJobSequenceId: aiGradingJobSequenceId,
    courseId: course.id,
    parentJob: job,
    label: 'AI grading',
  });

  const after = await snapshotCounts(assessment_question.id);
  job.info(
    `After AI grading: ${after.iqs_with_ai_grading} instance question(s) now have an AI grading job ` +
      `(was ${before.iqs_with_ai_grading}).`,
  );

  if (status !== 'Success') {
    job.error(`AI grading job sequence ${aiGradingJobSequenceId} ended with status ${status}`);
  } else {
    job.info('AI grading complete.');
  }
  return aiGradingJobSequenceId;
}
