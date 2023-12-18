import { Question, Course, Variant, Submission, CourseInstance } from '../lib/db-types';

export type QuestionType = Question['type'];
export type EffectiveQuestionType = 'Calculation' | 'Freeform';

type QuestionServerCallback<T> = (err: Error | null, courseIssues: Error[], data: T) => void;

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
    callback: QuestionServerCallback<GenerateResultData>,
  ) => void;
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
    callback: QuestionServerCallback<PrepareResultData>,
  ) => void;
  render: (
    renderSelection: { question: boolean; answer: boolean; submissions: boolean },
    variant: Variant,
    question: Question,
    submission: Submission,
    submissions: Submission[],
    course: Course,
    course_instance: CourseInstance,
    locals: Record<string, any>,
    callback: QuestionServerCallback<RenderResultData>,
  ) => void;
  parse: (
    submission: Submission,
    variant: Variant,
    question: Question,
    course: Course,
    callback: QuestionServerCallback<ParseResultData>,
  ) => void;
  grade: (
    submission: Submission,
    variant: Variant,
    question: Question,
    course: Course,
    callback: QuestionServerCallback<GradeResultData>,
  ) => void;
  file?: (
    filename: string,
    variant: Variant,
    question: Question,
    course: Course,
    callback: QuestionServerCallback<Buffer>,
  ) => void;
  test?: (
    variant: Variant,
    question: Question,
    course: Course,
    test_type: 'correct' | 'incorrect' | 'invalid',
    callback: QuestionServerCallback<TestResultData>,
  ) => void;
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
