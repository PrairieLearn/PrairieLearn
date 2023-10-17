const _ = require('lodash');

/**
 * Question servers module.
 * @module question-servers
 */

const questionModules = {
  Calculation: require('./calculation'),
  File: require('./calculation'),
  Checkbox: require('./calculation'),
  MultipleChoice: require('./calculation'),
  MultipleTrueFalse: require('./calculation'),
  Freeform: require('./freeform'),
};

const effectiveQuestionTypes = {
  Calculation: 'Calculation',
  File: 'Calculation',
  Checkbox: 'Calculation',
  MultipleChoice: 'Calculation',
  MultipleTrueFalse: 'Calculation',
  Freeform: 'Freeform',
};

module.exports = {
  getEffectiveQuestionType: function (type, callback) {
    if (_.has(effectiveQuestionTypes, type)) {
      callback(null, effectiveQuestionTypes[type]);
    } else {
      callback(new Error('Unknown question type: ' + type));
    }
  },

  getModule: function (type, callback) {
    if (_.has(questionModules, type)) {
      callback(null, questionModules[type]);
    } else {
      callback(new Error('Unknown question type: ' + type));
    }
  },
};
