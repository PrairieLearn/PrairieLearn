import { setTimeout as sleep } from 'node:timers/promises';

import {
  type Assessment,
  type AssessmentQuestion,
  type Course,
  type CourseInstance,
  type Question,
  type User,
} from '../../../lib/db-types.js';
import { type ServerJob, selectJobSequenceStatus } from '../../../lib/server-jobs.js';
import {
  type AiGradingModelId,
  DEFAULT_AI_GRADING_MODEL,
} from '../ai-grading/ai-grading-models.shared.js';
import { aiGrade } from '../ai-grading/ai-grading.js';

const POLL_INTERVAL_MS = 2000;

/**
 * Runs AI grading on the synthetic AQ via PL's existing `aiGrade`. Uses
 * `'human_graded'` mode so AI grading only fires on the submissions that
 * received manual ground truth from the uploaded CSV, giving the existing
 * AI-vs-human stats infrastructure something to compare against.
 *
 * Returns the AI grading job sequence id so the orchestrator can surface a
 * deep link, and only resolves once the job leaves `Running`/`Stopping`.
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

  while (true) {
    const { status } = await selectJobSequenceStatus(aiGradingJobSequenceId);
    if (status !== 'Running' && status !== 'Stopping') {
      if (status !== 'Success') {
        job.error(`AI grading job sequence ${aiGradingJobSequenceId} ended with status ${status}`);
      } else {
        job.info('AI grading complete.');
      }
      return aiGradingJobSequenceId;
    }
    await sleep(POLL_INTERVAL_MS);
  }
}
