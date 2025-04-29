import { type EffectiveQuestionType, type QuestionServer, type QuestionType } from './types.js';

export * from './types.js';

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
} satisfies Record<QuestionType, EffectiveQuestionType>;

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
