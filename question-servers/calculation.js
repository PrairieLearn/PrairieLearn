// @ts-check
const { experimentAsync } = require('tzientist');
const _ = require('lodash');
const { trace, context, SpanStatusCode } = require('@opentelemetry/api');
const error = require('../prairielib/lib/error');
const ERR = require('async-stacktrace');

const chunks = require('../lib/chunks');
const { withCodeCaller } = require('../lib/code-caller');
const filePaths = require('../lib/file-paths');

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
    const tracer = trace.getTracer('experiments');
    return tracer.startActiveSpan(spanName, async (span) => {
      return new Promise((resolve, reject) => {
        func(...args, (err, courseIssues, val) => {
          if (err) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err.message,
            });
            span.end();
            reject(err);
          } else {
            span.setStatus({
              code: SpanStatusCode.OK,
            });
            span.end();
            resolve([courseIssues, val]);
          }
        });
      });
    });
  };
}

/**
 * Turns the error or result of an experiment observation into a JSON string
 * suitable for using as an OpenTelemetry attribute value.
 *
 * @param {Error} error
 * @param {any} result
 * @returns {string}
 */
function observationPayload(error, result) {
  if (error) {
    return JSON.stringify({
      message: error.message,
      stack: error.stack,
    });
  }

  return JSON.stringify(result);
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
        // Grab the current span from context - this is the span created with
        // `startActiveSpan` below.
        const span = trace.getSpan(context.active());

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
          span.setAttributes({
            'experiment.result': 'mismatched',
            'experiment.control': observationPayload(controlError, controlResult),
            'experiment.candidate': observationPayload(candidateError, candidateResult),
          });
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'Experiment results did not match',
          });
        } else {
          span.setAttribute('experiment.result', 'matched');
          span.setStatus({
            code: SpanStatusCode.OK,
          });
        }
      },
    },
  });

  return (...args) => {
    const tracer = trace.getTracer('experiments');
    const callback = args.pop();
    tracer
      .startActiveSpan(`experiment:${name}`, async (span) => {
        span.setAttribute('experiment.name', name);
        try {
          // Important: must await promise here so that span timing information
          // is derived correctly.
          return await experiment(...args);
        } catch (err) {
          span.recordException(err);
          throw err;
        } finally {
          span.end();
        }
      })
      .then(([courseIssues, data]) => {
        callback(null, courseIssues, data);
      })
      .catch((err) => {
        callback(err);
      });
  };
}

module.exports.generate = (question, course, variant_seed, callback) => {
  const coursePath = chunks.getRuntimeDirectoryForCourse(course);
  filePaths.questionFilePath(
    'server.js',
    question.directory,
    coursePath,
    question,
    (err, questionServerPath) => {
      if (ERR(err, callback)) return;
      withCodeCaller(coursePath, async (codeCaller) => {
        const res = await codeCaller.call('v2-question', null, questionServerPath, 'generate', [
          {
            questionServerPath,
            func: 'generate',
            coursePath,
            question,
          },
        ]);
        return res.result;
      }).then(
        (questionData) => {
          let data = {
            params: questionData.params,
            true_answer: questionData.trueAnswer,
            options: questionData.options || question.options || {},
          };
          callback(null, [], data);
        },
        (err) => {
          let data = {
            variant_seed: variant_seed,
            question: question,
            course: course,
          };
          err.status = 500;
          return ERR(error.addData(err, data), callback);
        }
      );
    }
  );
};

// module.exports.generate = questionFunctionExperiment(
//   'calculation-question-generate',
//   calculationInprocess.generate,
//   calculationSubprocess.generate
// );

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
