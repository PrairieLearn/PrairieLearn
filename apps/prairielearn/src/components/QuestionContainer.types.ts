import { Submission, GradingJobStatus } from '../lib/db-types.js';
import { RubricGradingData } from '../lib/manualGrading.js';

export type QuestionContext =
  | 'student_exam'
  | 'student_homework'
  | 'instructor'
  | 'public'
  | 'manual_grading';
export type SubmissionForRender = Submission & {
  feedback_manual_html?: string;
  submission_number: number;
  rubric_grading?: RubricGradingData;
  grading_job_status?: GradingJobStatus | null;
  grading_job_id?: string | null;
  grading_job_stats?: GradingJobStats | null;
  formatted_date: string;
  user_uid?: string | null;
};

export interface GradingJobStats {
  phases: number[];
  submitDuration: string;
  queueDuration: string;
  prepareDuration: string;
  runDuration: string;
  reportDuration: string;
  totalDuration: string;
}
