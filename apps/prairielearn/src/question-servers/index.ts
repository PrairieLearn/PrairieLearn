import { Question, Course, Variant, Submission, CourseInstance } from '../lib/db-types';

export type QuestionType = Question['type'];
export type EffectiveQuestionType = 'Calculation' | 'Freeform';

type QuestionServerCallback = (err: Error | null, courseIssues: Error[], data: any) => void;

export interface QuestionServer {
  generate: (
    question: Question,
    course: Course,
    variant_seed: string,
    callback: QuestionServerCallback,
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
    callback: QuestionServerCallback,
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
    callback: QuestionServerCallback,
  ) => void;
  parse: (
    submission: Submission,
    variant: Variant,
    question: Question,
    course: Course,
    callback: QuestionServerCallback,
  ) => void;
  grade: (
    submission: Submission,
    variant: Variant,
    question: Question,
    course: Course,
    callback: QuestionServerCallback,
  ) => void;
  file?: (
    filename: string,
    variant: Variant,
    question: Question,
    course: Course,
    callback: QuestionServerCallback,
  ) => void;
  test?: (
    variant: Variant,
    question: Question,
    course: Course,
    test_type: 'correct' | 'incorrect' | 'invalid',
    callback: QuestionServerCallback,
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
