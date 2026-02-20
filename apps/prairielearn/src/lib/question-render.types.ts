import z from 'zod';

import type { SubmissionForRender } from '../components/SubmissionPanel.js';
import type { EffectiveQuestionType } from '../question-servers/types.js';

import { IssueSchema, type Variant } from './db-types.js';
import type { RubricData } from './manualGrading.types.js';

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

export type IssueRenderData = z.infer<typeof IssueRenderDataSchema>;

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
  allowGradeLeftMs: number;
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
  jobSequenceTokens: Record<string, string>;
}

export type ResLocalsQuestionRender = ResLocalsBuildLocals & ResLocalsQuestionRenderAdded;
export type ResLocalsInstanceQuestionRender = ResLocalsQuestionRender &
  ResLocalsInstanceQuestionRenderAdded;
