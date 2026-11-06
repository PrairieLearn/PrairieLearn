import { differenceInMilliseconds } from 'date-fns';

import { formatDate } from '@prairielearn/formatter';

import type { GradingJob, Submission } from './db-types.js';

export function getSubmissionInfo({
  submission,
  courseId,
  courseInstanceId,
  timezone,
}: {
  submission: Pick<Submission, 'id' | 'date'> & {
    user_uid: string | null;
    grading_job: GradingJob | null;
  };
  courseId: string;
  courseInstanceId?: string | null;
  timezone: string;
}) {
  const gradingJobId = submission.grading_job?.id ?? null;
  return {
    id: submission.id,
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

function buildGradingJobStats(job: GradingJob | null) {
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
