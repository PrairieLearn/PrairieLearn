const { experimentAsync } = require('tzientist');
const _ = require('lodash');

const calculationInprocess = require('./calculation-inprocess');
const calculationSubprocess = require('./calculation-subprocess');

/**
 * Similar to `util.promisify`, but with support for the non-standard
 * three-argument callback function that all of our question functions use.
 * Note that the returned promise resolves with an array of values. The
 * callback function must still be provided and will be invoked as normal.
 * 
 * TODO: refactor to standard two-argument callback or async/await.
 * 
 * @param {Function} func 
 */
function promisifyQuestionFunction(func, invokeCallback) {
  return (...args) => {
    const callback = args.pop();
    return new Promise((resolve, reject) => {
      func(...args, (err, courseIssues, val) => {
        if (err) {
          reject(err);
        } else {
          resolve([courseIssues, val]);
        }

        if (invokeCallback) {
          callback(err, courseIssues, val);
        }
      });
    });
  };
}

/**
 * Publishes the results of an experiment to the appropriate place.
 * 
 * @param {import('tzientist').Results} results
 */
function publishExperimentResults({
  experimentName,
  controlResult,
  controlError,
  controlTimeMs,
  candidateResult,
  candidateError,
  candidateTimeMs,
}) {
  if (controlError && candidateError) {
    // Both errored, this is expected.
  } else if (controlError && !candidateError) {
    // Only the control errored.
  } else if (!controlError && candidateError) {
    // Only the candidate errored.
  } else {
    // Neither one errored; let's check for equality.
    // Lodash is clever enough to understand Buffers, so we don't event need to
    // special-case `getFile`, which can sometimes return a Buffer.
    if (!_.isEqual(controlResult, candidateResult)) {
      // TODO: report to Honeycomb instead.
      console.error(`${experimentName} MISMATCH`);
    }
    console.log(`${experimentName} control time: ${controlTimeMs}ms`);
    console.log(`${experimentName} candidate time: ${candidateTimeMs}ms`);
  }
}

function questionFunctionExperiment(name, control, candidate) {
  const experiment = experimentAsync({
    name,
    control: promisifyQuestionFunction(control, true),
    candidate: promisifyQuestionFunction(candidate, false),
    options: {
      publish: publishExperimentResults,
    },
  });

  return (...args) => {
    experiment(...args).catch((err) => {
      console.trace(err);
      // We'll just swallow the error here; it would have already been propagated
      // via the callback from `promisifyQuestionFunction`.
    });
  };
}

module.exports.generate = questionFunctionExperiment(
  'calculation-question-generate',
  calculationInprocess.generate,
  calculationSubprocess.generate,
);

module.exports.prepare = questionFunctionExperiment(
  'calculation-question-prepare',
  calculationInprocess.prepare,
  calculationSubprocess.prepare,
);

module.exports.render = questionFunctionExperiment(
  'calculation-question-render',
  calculationInprocess.render,
  calculationSubprocess.render,
);

module.exports.getFile = questionFunctionExperiment(
  'calculation-question-getFile',
  calculationInprocess.getFile,
  calculationSubprocess.getFile,
);

module.exports.parse = questionFunctionExperiment(
  'calculation-question-parse',
  calculationInprocess.parse,
  calculationSubprocess.parse,
);

module.exports.grade = questionFunctionExperiment(
  'calculation-question-grade',
  calculationInprocess.grade,
  calculationSubprocess.grade,
);
