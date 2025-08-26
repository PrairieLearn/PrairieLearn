import z from 'zod';

import type { EffectiveQuestionType } from '../question-servers/types.js';

import { GradingJobSchema, IssueSchema, SubmissionSchema, type Variant } from './db-types.js';
import type { RubricData, RubricGradingData } from './manualGrading.types.js';

const detailedSubmissionColumns = {
  feedback: true,
  format_errors: true,
  params: true,
  partial_scores: true,
  raw_submitted_answer: true,
  submitted_answer: true,
  true_answer: true,
} as const;

export const SubmissionBasicSchema = SubmissionSchema.omit(detailedSubmissionColumns).extend({
  grading_job: GradingJobSchema.nullable(),
  formatted_date: z.string().nullable(),
  user_uid: z.string().nullable(),
});

export const SubmissionDetailedSchema = SubmissionSchema.pick(detailedSubmissionColumns);

export type SubmissionForRender = z.infer<typeof SubmissionBasicSchema> &
  Partial<z.infer<typeof SubmissionDetailedSchema>> & {
    feedback_manual_html?: string;
    submission_number: number;
    rubric_grading?: RubricGradingData | null;
  };

export interface SubmissionPanels {
  submissionPanel: string | null;
  extraHeadersHtml: string | null;
  answerPanel?: string | null;
  questionScorePanel?: string | null;
  assessmentScorePanel?: string | null;
  questionPanelFooter?: string | null;
  questionNavNextButton?: string | null;
}

export const IssueRenderDataSchema = IssueSchema.extend({
  formatted_date: z.string(),
  // Nullable from left join.
  user_uid: z.string().nullable(),
  user_name: z.string().nullable(),
  user_email: z.string().nullable(),
});
type IssueRenderData = z.infer<typeof IssueRenderDataSchema>;

export interface QuestionUrls {
  questionUrl: string;
  newVariantUrl: string;
  tryAgainUrl: string;
  reloadUrl: string;
  clientFilesQuestionUrl: string;
  calculationQuestionFileUrl: string;
  calculationQuestionGeneratedFileUrl: string;
  clientFilesCourseUrl: string;
  clientFilesQuestionGeneratedFileUrl: string;
  baseUrl: string;
  externalImageCaptureUrl: string | null;
  workspaceUrl?: string;
}
/**
 * All properties that are added to the locals by {@link getAndRenderVariant}.
 */
export interface ResLocalsQuestionRenderAdded extends QuestionUrls {
  question_is_shared: boolean;
  variant: Variant;
  showTrueAnswer: boolean;
  submission: SubmissionForRender | null;
  submissions: SubmissionForRender[];
  effectiveQuestionType: EffectiveQuestionType;
  extraHeadersHtml: string;
  questionHtml: string;
  submissionHtmls: string[];
  answerHtml: string;
  issues: IssueRenderData[];
  questionJsonBase64: string | undefined;
}

export interface ResLocalsInstanceQuestionRenderAdded {
  rubric_data: RubricData | null;
}

export interface ResLocalsBuildLocals {
  showGradeButton: boolean;
  showSaveButton: boolean;
  disableGradeButton: boolean;
  disableSaveButton: boolean;
  showNewVariantButton: boolean;
  showTryAgainButton: boolean;
  showTrueAnswer: boolean;
  showGradingRequested: boolean;
  allowAnswerEditing: boolean;
  hasAttemptsOtherVariants: boolean;
  variantAttemptsLeft: number;
  variantAttemptsTotal: number;
  submissions: SubmissionForRender[];
  variantToken: string;
}

export type ResLocalsQuestionRender = ResLocalsBuildLocals & ResLocalsQuestionRenderAdded;
export type ResLocalsInstanceQuestionRender = ResLocalsQuestionRender &
  ResLocalsInstanceQuestionRenderAdded;
