export const EXAM_GRACE_CLIENT_DURATION_MS = 30_000;
export const EXAM_GRACE_SERVER_DURATION_MS = 60_000;
export const EXAM_GRACE_ADMISSION_DURATION_MS = 60_000;

export type ExamGraceSource = 'assessment' | 'prairietest';

export interface ExamGraceClientContext {
  token: string;
  deadline: string;
  source: ExamGraceSource;
  canSave: boolean;
  assessmentInstanceId: string;
  courseInstanceId: string;
}
