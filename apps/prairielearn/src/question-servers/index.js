// @ts-check

/**
 * Question servers module.
 * @module question-servers
 */

/** @typedef {import('../lib/db-types').Question['type']} QuestionType */
/** @typedef {'Calculation' | 'Freeform'} EffectiveQuestionType */
/** @typedef {(err: Error | null, courseIssues: Error[], data: any) => void} QuestionServerCallback */

/**
 * @typedef QuestionServer
 * @property {(question: import('../lib/db-types').Question, course: import('../lib/db-types').Course, variant_seed: string, callback: QuestionServerCallback) => void} generate
 * @property {(question: import('../lib/db-types').Question, course: import('../lib/db-types').Course, variant: Object, callback: QuestionServerCallback) => void} prepare
 * @property {(renderSelection: {question: boolean, answer: boolean, submissions: boolean}, variant: import('../lib/db-types').Variant, question: import('../lib/db-types').Question, submission: import('../lib/db-types').Submission, submissions: import('../lib/db-types').Submission[], course: import('../lib/db-types').Course, course_instance: import('../lib/db-types').CourseInstance, locals: Record<string, any>, callback: QuestionServerCallback) => void} render
 * @property {(submission: import('../lib/db-types').Submission, variant: import('../lib/db-types').Variant, question: import('../lib/db-types').Question, course: import('../lib/db-types').Course, callback: QuestionServerCallback) => void} parse
 * @property {(submission: import('../lib/db-types').Submission, variant: import('../lib/db-types').Variant, question: import('../lib/db-types').Question, course: import('../lib/db-types').Course, callback: QuestionServerCallback) => void} grade
 * @property {(filename: string, variant: import('../lib/db-types').Variant, question: import('../lib/db-types').Question, course: import('../lib/db-types').Course, callback: QuestionServerCallback) => void} [file]
 * @property {(variant: import('../lib/db-types').Variant, question: import('../lib/db-types').Question, course: import('../lib/db-types').Course, test_type: 'correct' | 'incorrect' | 'invalid', callback: QuestionServerCallback) => void} [test]
 */

/** @type {Record<EffectiveQuestionType, QuestionServer>} */
const questionModules = {
  Calculation: require('./calculation-subprocess'),
  Freeform: require('./freeform'),
};

/** @type {Record<QuestionType, EffectiveQuestionType>} */
const effectiveQuestionTypes = {
  Calculation: 'Calculation',
  File: 'Calculation',
  Checkbox: 'Calculation',
  MultipleChoice: 'Calculation',
  MultipleTrueFalse: 'Calculation',
  Freeform: 'Freeform',
};

/**
 * @param {QuestionType} type
 * @returns {EffectiveQuestionType}
 */
export function getEffectiveQuestionType(type) {
  if (type in effectiveQuestionTypes) {
    return effectiveQuestionTypes[type];
  } else {
    throw new Error('Unknown question type: ' + type);
  }
}

/**
 * @param {QuestionType} type
 * @returns {QuestionServer}
 */
export function getModule(type) {
  return questionModules[getEffectiveQuestionType(type)];
}
