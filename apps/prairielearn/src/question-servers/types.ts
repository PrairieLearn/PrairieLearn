import { type Course, type Question, type Submission, type Variant } from '../lib/db-types.js';
import type { ElementExtensionJson } from '../schemas/index.js';

export type QuestionType = Question['type'];
export type EffectiveQuestionType = 'Calculation' | 'Freeform';

export type QuestionServerReturnValue<T> = Promise<{
  courseIssues: (Error & { fatal?: boolean; data?: any })[];
  data: T;
}>;

export interface GenerateResultData {
  params: Record<string, any> | null;
  true_answer: Record<string, any> | null;
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
  params: Record<string, any> | null;
  true_answer: Record<string, any> | null;
  submitted_answer?: Record<string, any> | null;
  feedback?: Record<string, any> | null;
  raw_submitted_answer?: Record<string, any> | null;
  format_errors?: Record<string, any> | null;
  gradable?: boolean | null;
}

export interface GradeResultData {
  params: Record<string, any> | null;
  true_answer: Record<string, any> | null;
  submitted_answer: Record<string, any> | null;
  format_errors?: Record<string, any> | null;
  raw_submitted_answer?: Record<string, any> | null;
  partial_scores: Record<string, any>;
  score: number;
  feedback: Record<string, any> | null;
  gradable?: boolean | null;
  v2_score?: number;
}

export interface TestResultData {
  params: Record<string, any> | null;
  true_answer: Record<string, any> | null;
  format_errors?: Record<string, any> | null;
  raw_submitted_answer?: Record<string, any> | null;
  partial_scores?: Record<string, any>;
  score?: number | null;
  gradable?: boolean | null;
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
    renderSelection: { question: boolean; answer: boolean; submissions: boolean },
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

// This data object changes over the lifetime of the question grading process.
// That is why many fields are nullable / optional, as they are only set in later phases.
export interface ExecutionData {
  params: Record<string, any> | null;
  correct_answers: Record<string, any> | null;
  variant_seed: number;
  options: Record<string, any> & {
    question_path: string;
    client_files_question_path: string;
    client_files_course_path: string;
    server_files_course_path: string;
    course_extensions_path: string;
  };
  answers_names?: Record<string, string>;
  submitted_answers?: Record<string, any> | null;
  format_errors?: Record<string, any> | null;
  partial_scores?: Record<string, any>;
  score?: number;
  feedback?: Record<string, any>;
  raw_submitted_answers?: Record<string, any> | null;
  editable?: boolean;
  manual_grading?: boolean;
  panel?: 'question' | 'answer' | 'submission';
  num_valid_submissions?: number | null;
  filename?: string;
  gradable?: boolean | null;
  extensions?: Record<string, ElementExtensionJsonExtension> | [];
}
