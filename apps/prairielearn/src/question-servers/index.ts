import type { Question } from '../lib/db-types.js';

import { type QuestionServer } from './types.js';

export * from './types.js';

type QuestionType = Question['type'];
type EffectiveQuestionType = 'Calculation' | 'Freeform';

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

function getEffectiveQuestionType(type: QuestionType): EffectiveQuestionType {
  if (!type) {
    throw new Error('Question type is required');
  } else if (type in effectiveQuestionTypes) {
    return effectiveQuestionTypes[type];
  } else {
    throw new Error('Unknown question type: ' + type);
  }
}

export function getModule(type: QuestionType): QuestionServer {
  return questionModules[getEffectiveQuestionType(type)];
}
