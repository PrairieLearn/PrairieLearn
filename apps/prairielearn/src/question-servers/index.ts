import { Question, Course, Variant, Submission } from '../lib/db-types';

export type QuestionType = Question['type'];
export type EffectiveQuestionType = 'Calculation' | 'Freeform';

type QuestionServerReturnValue<T> = Promise<{
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
  ) => QuestionServerReturnValue<GenerateResultData>;
  prepare: (
    question: Question,
    course: Course,
    variant: {
      variant_seed: string;
      params: Record<string, any>;
      true_answer: Record<string, any>;
      options: Record<string, any>;
      broken: boolean;
    },
  ) => QuestionServerReturnValue<PrepareResultData>;
  render: (
    renderSelection: { question: boolean; answer: boolean; submissions: boolean },
    variant: Variant,
    question: Question,
    submission: Submission,
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
  ) => QuestionServerReturnValue<GradeResultData>;
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

const questionModules: Record<EffectiveQuestionType, QuestionServer> = {
  Calculation: require('./calculation-subprocess'),
  Freeform: require('./freeform'),
};

const effectiveQuestionTypes: Record<QuestionType, EffectiveQuestionType> = {
  Calculation: 'Calculation',
  File: 'Calculation',
  Checkbox: 'Calculation',
  MultipleChoice: 'Calculation',
  MultipleTrueFalse: 'Calculation',
  Freeform: 'Freeform',
};

export function getEffectiveQuestionType(type: QuestionType): EffectiveQuestionType {
  if (type in effectiveQuestionTypes) {
    return effectiveQuestionTypes[type];
  } else {
    throw new Error('Unknown question type: ' + type);
  }
}

export function getModule(type: QuestionType): QuestionServer {
  return questionModules[getEffectiveQuestionType(type)];
}
