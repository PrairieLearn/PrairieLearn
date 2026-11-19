import { differenceInMilliseconds } from 'date-fns';

import { formatDate } from '@prairielearn/formatter';

import type { AssessmentQuestion, GradingJob, Question, Submission } from './db-types.js';

type SubmissionGradingJob = Pick<
  GradingJob,
  | 'id'
  | 'grading_method'
  | 'grading_requested_at'
  | 'grading_submitted_at'
  | 'grading_received_at'
  | 'grading_started_at'
  | 'grading_finished_at'
  | 'graded_at'
>;

export function getSubmissionInfo({
  submission,
  question,
  assessment_question,
  courseId,
  courseInstanceId,
  timezone,
}: {
  submission: Pick<Submission, 'id' | 'date'> & {
    user_uid: string | null;
    grading_job: SubmissionGradingJob | null;
  };
  question: Question;
  assessment_question?: AssessmentQuestion | null;
  courseId: string;
  courseInstanceId?: string | null;
  timezone: string;
}) {
  const gradingJobId = submission.grading_job?.id ?? null;
  return {
    id: submission.id,
    isAutograded: isAutograded({ question, assessment_question }),
    formattedDate: formatDate(submission.date!, timezone),
    userUid: submission.user_uid,
    gradingJobId,
    gradingJobStats: buildGradingJobStats(submission.grading_job),
    gradingJobUrl:
      gradingJobId == null
        ? null
        : courseInstanceId == null
          ? `/pl/course/${courseId}/grading_job/${gradingJobId}`
          : `/pl/course_instance/${courseInstanceId}/instructor/grading_job/${gradingJobId}`,
  };
}

export type SubmissionInfo = ReturnType<typeof getSubmissionInfo>;

function buildGradingJobStats(job: SubmissionGradingJob | null) {
  if (!job) return null;

  const durations: (number | null)[] = [];
  const formatDiff = (start: Date | null, end: Date | null, addToPhases = true) => {
    const duration = end == null || start == null ? null : differenceInMilliseconds(end, start);
    if (addToPhases) durations.push(duration);
    return duration == null ? '\u2212' : (duration / 1000).toFixed(3).replace(/\.?0+$/, '') + 's';
  };

  const stats = {
    submitDuration: formatDiff(job.grading_requested_at, job.grading_submitted_at),
    queueDuration: formatDiff(job.grading_submitted_at, job.grading_received_at),
    prepareDuration: formatDiff(job.grading_received_at, job.grading_started_at),
    runDuration: formatDiff(job.grading_started_at, job.grading_finished_at),
    reportDuration: formatDiff(job.grading_finished_at, job.graded_at),
    totalDuration: formatDiff(job.grading_requested_at, job.graded_at, false),
  };
  const totalDuration = durations.reduce((a, b) => (a ?? 0) + (b ?? 0), 0) || 1;

  return {
    ...stats,
    grading_method: job.grading_method,
    phases: durations.map(
      // Round down to avoid width being greater than 100% with floating point errors
      (duration) => Math.floor(((duration ?? 0) * 1000) / totalDuration) / 10,
    ),
  };
}

export function isAutograded({
  question,
  assessment_question,
}: {
  question: Question;
  assessment_question?: AssessmentQuestion | null;
}) {
  return assessment_question
    ? !!assessment_question.max_auto_points || !assessment_question.max_manual_points
    : question.grading_method !== 'Manual';
}
