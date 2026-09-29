// A v2 question client whose browser-side render always fails. Used to exercise the
// `data-legacy-question-render-status="error"` path in `localscripts/question.js`.
define([], function () {
  function BrokenClient() {}

  BrokenClient.prototype.initialize = function () {};
  BrokenClient.prototype.setSubmittedAnswer = function () {};
  BrokenClient.prototype.setTrueAnswer = function () {};
  BrokenClient.prototype.setFeedback = function () {};
  BrokenClient.prototype.renderQuestion = function () {
    throw new Error('Deliberately broken client render');
  };
  BrokenClient.prototype.renderAnswer = function () {};
  BrokenClient.prototype.renderSubmission = function () {};
  BrokenClient.prototype.getSubmittedAnswer = function () {
    return {};
  };

  return new BrokenClient();
});
