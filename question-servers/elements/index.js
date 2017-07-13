
module.exports = {};

module.exports = new Map([
    ['multipleChoice', require('./multipleChoice')],
    ['multipleChoiceSubmittedAnswer', require('./multipleChoiceSubmittedAnswer')],
    ['multipleChoiceTrueAnswer', require('./multipleChoiceTrueAnswer')],
    ['checkbox', require('./checkbox')],
    ['checkboxSubmittedAnswer', require('./checkboxSubmittedAnswer')],
    ['checkboxTrueAnswer', require('./checkboxTrueAnswer')],
    ['numberInput', require('./numberInput')],
    ['numberInputSubmittedAnswer', require('./numberInputSubmittedAnswer')],
    ['numberInputTrueAnswer', require('./numberInputTrueAnswer')],
    ['elementScore', require('./elementScore')],
    ['multipleChoicePy', 'multipleChoice.py'],
]);
