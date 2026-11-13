import type { Question } from '../lib/db-types.js';

import * as calculationSubprocess from './calculation-subprocess.js';
import type { EffectiveQuestionType, QuestionServer } from './types.js';

export * from './types.js';

type QuestionType = Question['type'];

// v2 (Calculation) questions predate shared state and never declare access to
// it, so `calculation-subprocess.ts` doesn't need to know about the feature.
// This adapter drops the `sharedState` argument before delegating so that
// file can stay untouched.
const Calculation: QuestionServer = {
  ...calculationSubprocess,
  generate: (question, course, variant_seed, preferences, _sharedState, caller) =>
    calculationSubprocess.generate(question, course, variant_seed, preferences, caller),
  parse: (submission, variant, question, course, _sharedState, caller) =>
    calculationSubprocess.parse(submission, variant, question, course, caller),
  grade: (submission, variant, question, course, _sharedState, caller) =>
    calculationSubprocess.grade(submission, variant, question, course, caller),
};

const questionModules = {
  Calculation,
  Freeform: await import('./freeform.js'),
} satisfies Record<EffectiveQuestionType, QuestionServer>;

const effectiveQuestionTypes = {
  Calculation: 'Calculation',
  File: 'Calculation',
  Checkbox: 'Calculation',
  MultipleChoice: 'Calculation',
  MultipleTrueFalse: 'Calculation',
  Freeform: 'Freeform',
} satisfies Record<NonNullable<QuestionType>, EffectiveQuestionType>;

export function getModule(type: QuestionType): QuestionServer {
  if (!type) {
    throw new Error('Question type is required');
  } else if (type in effectiveQuestionTypes) {
    return questionModules[effectiveQuestionTypes[type]];
  } else {
    throw new Error('Unknown question type: ' + type);
  }
}
