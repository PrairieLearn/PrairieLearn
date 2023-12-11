// @ts-check

/**
 * Question servers module.
 * @module question-servers
 */

/** @typedef {import('../lib/db-types').Question['type']} QuestionType */
/** @typedef {'Calculation' | 'Freeform'} EffectiveQuestionType */

/**
 * @typedef QuestionServer
 * @property {function} generate
 * @property {function} prepare
 * @property {function} render
 * @property {function} parse
 * @property {function} grade
 * @property {function} [file]
 * @property {function} [test]
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
