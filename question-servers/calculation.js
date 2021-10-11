const { experimentAsync } = require('tzientist');
const _ = require('lodash');
const { trace, context, SpanStatusCode } = require('@opentelemetry/api');

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
 * @param {string} spanName
 * @param {Function} func 
 * @param {boolean} invokeCallback
 */
function promisifyQuestionFunction(spanName, func, invokeCallback) {
  return async (...args) => {
    const callback = args.pop();

    // IMPORTANT: note that if the callback needs to be invoked, we need to
    // do it outside of `startActiveSpan` so that everything that happens
    // after this in the request isn't erroneously grouped underneath this
    // span.
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
    }).then(([courseIssues, val]) => {
      if (invokeCallback) {
        callback(null, courseIssues, val);
      }
      return [courseIssues, val];
    }).catch((err) => {
      if (invokeCallback) {
        callback(err);
      }
      throw err;
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

function questionFunctionExperiment(name, control, candidate) {
  const experiment = experimentAsync({
    name,
    control: promisifyQuestionFunction('control', control, true),
    candidate: promisifyQuestionFunction('candidate', candidate, false),
    options: {
      publish: ({
        controlResult,
        controlError,
        candidateResult,
        candidateError,
      }) => {
        // Grab the current span from context - this is the span created with
        // `startActiveSpan` below.
        const span = trace.getSpan(context.active());

        // We don't want to assert that the errors themselves are equal, just
        // that either both errored or both did not error.
        const errorsMismatched = (!!controlError) != (!!candidateError);

        // Lodash is clever enough to understand Buffers, so we don't event need to
        // special-case `getFile`, which can sometimes return a Buffer.
        const resultsMismatched = _.isEqual(controlResult, candidateResult);

        if (errorsMismatched || resultsMismatched) {
          console.log('errorsMismatched?', errorsMismatched);
          console.log('resultsMismatched?', resultsMismatched);
          console.log(controlError, controlResult, candidateError, candidateResult);
          console.log(observationPayload(controlError, controlResult));
          console.log(observationPayload(candidateError, candidateResult));
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
    tracer.startActiveSpan('experiment', async (span) => {
      span.setAttribute('experiment.name', name);
      try {
        await experiment(...args);
      } catch (e) {
        // We'll just swallow the error here; it would have already been propagated
        // via the callback from `promisifyQuestionFunction`.
        span.recordException(e);
      } finally {
        span.end();
      }
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
