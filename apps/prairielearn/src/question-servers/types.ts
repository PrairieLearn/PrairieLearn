import { type Course, type Question, type Submission, type Variant } from '../lib/db-types.js';
import type { UntypedResLocals } from '../lib/res-locals.types.js';
import type { ElementExtensionJson } from '../schemas/index.js';

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
  params: Record<string, unknown>;
  true_answer: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export type PrepareResultData = GenerateResultData;

export interface RenderResultData {
  extraHeadersHtml: string;
  questionHtml: string;
  submissionHtmls: string[];
  answerHtml: string;
}

export interface ParseResultData {
  params: Record<string, unknown>;
  true_answer: Record<string, unknown>;
  submitted_answer: Record<string, unknown>;
  feedback: Record<string, unknown>;
  raw_submitted_answer: Record<string, unknown>;
  format_errors: Record<string, unknown>;
  gradable: boolean;
}

export interface GradeResultData {
  params: Record<string, unknown>;
  true_answer: Record<string, unknown>;
  submitted_answer: Record<string, unknown>;
  format_errors: Record<string, unknown>;
  raw_submitted_answer: Record<string, unknown>;
  partial_scores: Record<string, unknown>;
  score: number;
  feedback: Record<string, unknown>;
  gradable: boolean;
  v2_score?: number;
}

export interface TestResultData {
  params: Record<string, any>;
  true_answer: Record<string, unknown>;
  format_errors: Record<string, unknown>;
  raw_submitted_answer: Record<string, unknown>;
  partial_scores: Record<string, unknown>;
  score: number;
  gradable: boolean;
}

export type PrepareVariant = Pick<
  Variant,
  'variant_seed' | 'params' | 'true_answer' | 'options' | 'broken'
>;

export type ParseSubmission = Pick<
  Partial<Submission>,
  'submitted_answer' | 'feedback' | 'format_errors' | 'raw_submitted_answer' | 'gradable'
>;

export interface QuestionServer {
  generate: (
    question: Question,
    course: Course,
    variant_seed: string,
  ) => QuestionServerReturnValue<Partial<GenerateResultData>>;
  prepare: (
    question: Question,
    course: Course,
    variant: PrepareVariant,
  ) => QuestionServerReturnValue<PrepareResultData>;
  render: (params: {
    renderSelection: RenderSelection;
    variant: Variant;
    question: Question;
    submission: Submission | null;
    submissions: Submission[];
    course: Course;
    locals: UntypedResLocals;
  }) => QuestionServerReturnValue<RenderResultData>;
  parse: (
    submission: ParseSubmission,
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

// This data object changes over the lifetime of the question grading process.
// That is why many fields are optional, as they are only present in later phases.
export interface ExecutionData {
  params: Record<string, any>;
  correct_answers: Record<string, unknown>;
  variant_seed: number;
  options: Record<string, any> & {
    question_path: string;
    client_files_question_path: string;
    client_files_course_path: string;
    server_files_course_path: string;
    course_extensions_path: string;
  };
  answers_names?: Record<string, string>;
  submitted_answers?: Record<string, unknown>;
  format_errors?: Record<string, unknown>;
  partial_scores?: Record<string, unknown>;
  score?: number;
  feedback?: Record<string, unknown>;
  raw_submitted_answers?: Record<string, unknown>;
  editable?: boolean;
  manual_grading?: boolean;
  ai_grading?: boolean;
  panel?: 'question' | 'answer' | 'submission';
  num_valid_submissions?: number;
  filename?: string;
  gradable?: boolean;
  extensions?: Record<string, ElementExtensionJsonExtension>;
}
