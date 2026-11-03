import type { CopyTarget } from './copy-content.js';
import type { SubmissionInfo } from './submission-info.js';

export interface CopyQuestionDialogData {
  questionId: string;
  courseId: string;
  targets: CopyTarget[];
}

export interface QuestionDialogData {
  copyQuestion: CopyQuestionDialogData | null;
  submissions: SubmissionInfo[];
}
