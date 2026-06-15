import type { Question } from '../lib/db-types.js';

import type { EffectiveQuestionType, QuestionServer } from './types.js';

export * from './types.js';

type QuestionType = Question['type'];

const questionModules = {
  Calculation: await import('./calculation-subprocess.js'),
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
