// @ts-check
const { experimentAsync } = require('tzientist');
const _ = require('lodash');
const Sentry = require('@prairielearn/sentry');

const config = require('../lib/config');
const calculationInprocess = require('./calculation-inprocess');
const calculationSubprocess = require('./calculation-subprocess');

/**
 * Similar to `util.promisify`, but with support for the non-standard
 * three-argument callback function that all of our question functions use.
 * Note that the returned promise resolves with an array of values.
 *
 * TODO: refactor to standard two-argument callback or async/await.
 *
 * @param {string} spanName
 * @param {Function} func
 */
function promisifyQuestionFunction(spanName, func) {
  return async (...args) => {
    return new Promise((resolve, reject) => {
      func(...args, (err, courseIssues, val) => {
        if (err) {
          reject(err);
        } else {
          resolve([courseIssues, val]);
        }
      });
    });
  };
}

/**
 * Turns the error or result of an experiment observation into a JSON string
 * suitable for reporting to Sentry.
 *
 * @param {Error} error
 * @param {any} result
 * @returns {string}
 */
function observationPayload(error, result) {
  if (error) {
    return JSON.stringify({
      type: 'error',
      result: {
        message: error.message,
        stack: error.stack,
      },
    });
  }

  return JSON.stringify({
    type: 'success',
    result,
  });
}

/**
 * Runs both the `control` and `candidate` functions at the same time and
 * compares their output. No matter what the candidate does, the results of
 * the `control` function will always be what's returned to the client.
 *
 * @param {string} name
 * @param {Function} control
 * @param {Function} candidate
 * @returns {Function}
 */
function questionFunctionExperiment(name, control, candidate) {
  const experiment = experimentAsync({
    name,
    control: promisifyQuestionFunction('control', control),
    candidate: promisifyQuestionFunction('candidate', candidate),
    options: {
      publish: ({ controlResult, controlError, candidateResult, candidateError }) => {
        // The control implementation does not utilize course issues.
        const controlHasError = !!controlError;

        // The candidate implementation does propagate some errors as course
        // issues, so we need to take those into account when checking if the
        // implementation resulted in an error.
        const candidateHasError = !!candidateError || !_.isEmpty(candidateResult?.[0]);

        // We don't want to assert that the errors themselves are equal, just
        // that either both errored or both did not error.
        const errorsMismatched = controlHasError !== candidateHasError;

        // The "results" can actually contain error information for the candidate,
        // but not for the control. To avoid false positives, we'll only compare
        // the "data" portion of the results. The "course issues" portion of the
        // results was already handled above.
        const controlData = controlResult?.[1];
        const candidateData = candidateResult?.[1];
        const controlHasData = !_.isEmpty(controlData);
        const candidateHasData = !_.isEmpty(candidateData);

        // Lodash is clever enough to understand Buffers, so we don't event need to
        // special-case `getFile`, which can sometimes return a Buffer.
        //
        // We only assert that `controlData` and `candidateData` are equal if
        // they're both not "empty" (empty object, null, undefined, etc.) since
        // for our purposes, all empty data is equal.
        const dataMismatched =
          controlHasData && candidateHasData && !_.isEqual(controlData, candidateData);

        if (errorsMismatched || dataMismatched) {
          Sentry.captureException(new Error('Experiment results did not match'), {
            contexts: {
              experiment: {
                control: observationPayload(controlError, controlResult),
                candidate: observationPayload(candidateError, candidateResult),
              },
            },
          });
        }
      },
    },
  });

  return (...args) => {
    if (config.legacyQuestionExecutionMode === 'inprocess') {
      control(...args);
      return;
    } else if (config.legacyQuestionExecutionMode === 'subprocess') {
      candidate(...args);
      return;
    }

    const callback = args.pop();
    experiment(...args)
      .then(([courseIssues, data]) => {
        callback(null, courseIssues, data);
      })
      .catch((err) => {
        callback(err);
      });
  };
}

module.exports.generate = questionFunctionExperiment(
  'calculation-question-generate',
  calculationInprocess.generate,
  calculationSubprocess.generate
);

module.exports.prepare = questionFunctionExperiment(
  'calculation-question-prepare',
  calculationInprocess.prepare,
  calculationSubprocess.prepare
);

module.exports.render = questionFunctionExperiment(
  'calculation-question-render',
  calculationInprocess.render,
  calculationSubprocess.render
);

module.exports.getFile = questionFunctionExperiment(
  'calculation-question-getFile',
  calculationInprocess.getFile,
  calculationSubprocess.getFile
);

module.exports.parse = questionFunctionExperiment(
  'calculation-question-parse',
  calculationInprocess.parse,
  calculationSubprocess.parse
);

module.exports.grade = questionFunctionExperiment(
  'calculation-question-grade',
  calculationInprocess.grade,
  calculationSubprocess.grade
);
