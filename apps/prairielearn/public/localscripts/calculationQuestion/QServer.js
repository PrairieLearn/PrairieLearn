define(['underscore', 'PrairieGeom'], function (_, PrairieGeom) {
  function QServer() {}

  QServer.prototype.gradeAnswer = function (vid, params, trueAnswer, submittedAnswer, options) {
    options = _.defaults(options, {
      type: 'equal',
      relTol: 1e-2,
      absTol: 1e-8,
    });
    var trueAns = trueAnswer;
    var subAns = submittedAnswer;
    if (this.transformTrueAnswer)
      trueAns = this.transformTrueAnswer(vid, params, trueAns, subAns, options);
    if (this.transformSubmittedAnswer)
      subAns = this.transformSubmittedAnswer(vid, params, trueAns, subAns, options);
    var score;
    if (options.type === 'equal') {
      score = 0;
      if (PrairieGeom.checkEqual(trueAns, subAns, options.relTol, options.absTol)) score = 1;
    } else if (options.type === 'error') {
      var error;
      if (this.submittedAnswerError) {
        error = this.submittedAnswerError(vid, params, trueAns, subAns, options);
      } else {
        error = PrairieGeom.absError(trueAns, subAns);
      }
      var score = PrairieGeom.errorToScore(error, options.absTol);
    } else {
      throw Exception('Unknown gradeAnswer type: ' + options.type);
    }
    return { score: score };
  };

  return QServer;
});
