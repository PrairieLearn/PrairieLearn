import { type Course, type Question, type Submission, type Variant } from '../lib/db-types.js';
import type { ElementExtensionJson } from '../schemas/index.js';

export type QuestionType = Question['type'];
export type EffectiveQuestionType = 'Calculation' | 'Freeform';

export interface RenderSelection {
  question?: boolean;
  submissions?: boolean;
  answer?: boolean;
}

export type QuestionServerReturnValue<T> = Promise<{
  courseIssues: (Error & { fatal?: boolean; data?: any })[];
  data: T;
}>;

export interface GenerateResultData {
  params: Record<string, any>;
  true_answer: Record<string, any>;
  options?: Record<string, any> | null;
}

export type PrepareResultData = GenerateResultData;

export interface RenderResultData {
  extraHeadersHtml: string;
  questionHtml: string;
  submissionHtmls: string[];
  answerHtml: string;
}

export interface ParseResultData {
  params: Record<string, any>;
  true_answer: Record<string, any>;
  submitted_answer: Record<string, any>;
  feedback: Record<string, any>;
  raw_submitted_answer: Record<string, any>;
  format_errors: Record<string, any>;
  gradable: boolean;
}

export interface GradeResultData {
  params: Record<string, any>;
  true_answer: Record<string, any>;
  submitted_answer: Record<string, any>;
  format_errors: Record<string, any>;
  raw_submitted_answer: Record<string, any>;
  partial_scores: Record<string, any>;
  score: number;
  feedback: Record<string, any>;
  gradable: boolean;
  v2_score?: number;
}

export interface TestResultData {
  params: Record<string, any>;
  true_answer: Record<string, any>;
  format_errors: Record<string, any>;
  raw_submitted_answer: Record<string, any>;
  partial_scores: Record<string, any>;
  score: number;
  gradable: boolean;
}

export interface QuestionServer {
  generate: (
    question: Question,
    course: Course,
    variant_seed: string,
  ) => QuestionServerReturnValue<Partial<GenerateResultData>>;
  prepare: (
    question: Question,
    course: Course,
    variant: Pick<Variant, 'variant_seed' | 'params' | 'true_answer' | 'options' | 'broken'>,
  ) => QuestionServerReturnValue<PrepareResultData>;
  render: (
    renderSelection: RenderSelection,
    variant: Variant,
    question: Question,
    submission: Submission | null,
    submissions: Submission[],
    course: Course,
    locals: Record<string, any>,
  ) => QuestionServerReturnValue<RenderResultData>;
  parse: (
    submission: Pick<
      Partial<Submission>,
      'submitted_answer' | 'feedback' | 'format_errors' | 'raw_submitted_answer' | 'gradable'
    >,
    variant: Variant,
    question: Question,
    course: Course,
  ) => QuestionServerReturnValue<ParseResultData>;
  grade: (
    submission: Submission,
    variant: Variant,
    question: Question,
    course: Course,
  ) => QuestionServerReturnValue<Partial<GradeResultData>>;
  file?: (
    filename: string,
    variant: Variant,
    question: Question,
    course: Course,
  ) => QuestionServerReturnValue<Buffer>;
  test?: (
    variant: Variant,
    question: Question,
    course: Course,
    test_type: 'correct' | 'incorrect' | 'invalid',
  ) => QuestionServerReturnValue<TestResultData>;
}

export type ElementExtensionJsonExtension = ElementExtensionJson & {
  name: string;
  directory: string;
};
