var _ = require('underscore');

/**
 * Question servers module.
 * @module question-servers
 */

var questionModules = {
    'Calculation':       require('./calculation'),
    'File':              require('./calculation'),
    'Checkbox':          require('./calculation'),
    'MultipleChoice':    require('./calculation'),
    'MultipleTrueFalse': require('./calculation'),
    'Freeform':          require('./freeform'),
};

var effectiveQuestionTypes = {
    'Calculation':       'Calculation',
    'File':              'Calculation',
    'Checkbox':          'Calculation',
    'MultipleChoice':    'Calculation',
    'MultipleTrueFalse': 'Calculation',
    'Freeform':          'Freeform',
};

module.exports = {
    getEffectiveQuestionType: function(type, callback) {
        if (_(effectiveQuestionTypes).has(type)) {
            callback(null, effectiveQuestionTypes[type]);
        } else {
            callback(new Error('Unknown question type: ' + type));
        }
    },

    getModule: function(type, callback) {
        if (_(questionModules).has(type)) {
            callback(null, questionModules[type]);
        } else {
            callback(new Error('Unknown question type: ' + type));
        }
    },
};
