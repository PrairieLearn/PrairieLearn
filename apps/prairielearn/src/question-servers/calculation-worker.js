// @ts-check

// This is meant to be invoked from a Python code caller via `lib/code-caller`.
// This allows us to isolate code from the main process that's handling requests,
// and to execute code inside Docker containers in environments where
// containerized code execution is enabled.
//
// It's important that nothing in this file relies on config or other global
// server state, as this won't be executed in the main process.
//
// Note that the zygote will load the *transpiled* version of this file in the
// `dist` directory, not the original source file in `src`. If you're making
// changes to this file, you'll need to run `yarn build` in `apps/prairielearn`
// in order to update the file in `dist`.

const path = require('path');
const readline = require('readline');
const error = require('@prairielearn/error');

const requireFrontend = require('../lib/require-frontend');

/**
 * Attempts to load the server module that should be used for a particular
 * question.
 *
 * @param {string} questionServerPath The path to the JavaScript question server
 * @param {string} coursePath The path to the course root directory
 * @returns {Promise<any>}
 */
async function loadServer(questionServerPath, coursePath) {
  const configRequire = requireFrontend.config({
    paths: {
      clientFilesCourse: path.join(coursePath, 'clientFilesCourse'),
      serverFilesCourse: path.join(coursePath, 'serverFilesCourse'),
      clientCode: path.join(coursePath, 'clientFilesCourse'),
      serverCode: path.join(coursePath, 'serverFilesCourse'),
    },
  });

  return new Promise((resolve, reject) => {
    configRequire(
      [questionServerPath],
      function (server) {
        if (server === undefined) {
          reject(new Error(`Could not load ${path.basename(questionServerPath)}`));
        }
        // This was added as a workaround for requireJS error handling weirdness.
        setTimeout(() => resolve(server), 0);
      },
      (err) => {
        const e = error.makeWithData(`Error loading ${path.basename(questionServerPath)}`, err);
        if (err.originalError != null) {
          e.stack = err.originalError.stack + '\n\n' + err.stack;
        }
        reject(e);
      },
    );
  });
}

function generate(server, coursePath, question, variant_seed) {
  const questionDir = path.join(coursePath, 'questions', question.directory);
  const options = question.options || {};

  const questionData = server.getData(variant_seed, options, questionDir);
  return {
    params: questionData.params ?? null,
    true_answer: questionData.trueAnswer ?? null,
    options: questionData.options || question.options || {},
  };
}

function grade(server, coursePath, submission, variant, question) {
  const vid = variant.variant_seed;
  const params = variant.params;
  const trueAnswer = variant.true_answer;
  const submittedAnswer = submission.submitted_answer;
  const options = variant.options;
  const questionDir = path.join(coursePath, 'questions', question.directory);

  const grading = server.gradeAnswer(
    vid,
    params,
    trueAnswer,
    submittedAnswer,
    options,
    questionDir,
  );

  let score = grading.score;
  if (!question.partial_credit) {
    // legacy Calculation questions round the score to 0 or 1 (with 0.5 rounding up)
    score = grading.score >= 0.5 ? 1 : 0;
  }

  return {
    score,
    v2_score: grading.score,
    feedback: grading.feedback ?? null,
    partial_scores: {},
    submitted_answer: submission.submitted_answer ?? null,
    format_errors: {},
    gradable: true,
    params: variant.params ?? null,
    true_answer: variant.true_answer ?? null,
  };
}

/**
 *
 * @param {import('readline').Interface} rl
 * @returns {Promise<string | null>}
 */
function getLineOnce(rl) {
  return new Promise((resolve) => {
    let didResolve = false;
    rl.on('line', (line) => {
      if (didResolve) return;
      didResolve = true;
      resolve(line);
    });
    rl.on('close', () => {
      if (didResolve) return;
      didResolve = true;
      resolve(null);
    });
  });
}

if (require.main === module) {
  // Redirect `stdout` to `stderr` so that we can ensure that no
  // user code can write to `stdout`; we need to use `stdout` to send results
  // instead.
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = process.stderr.write.bind(process.stderr);

  (async () => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const line = await getLineOnce(rl);

    if (!line) {
      throw new Error('Did not get data from parent process');
    }

    // Close the reader to empty the event loop.
    rl.close();

    const input = JSON.parse(line);

    const {
      // These first four are required.
      questionServerPath,
      func,
      coursePath,
      question,

      // Depending on which function is being invoked, these may or may not
      // be present.
      variant_seed,
      variant,
      submission,
    } = input;

    const server = await loadServer(questionServerPath, coursePath);

    let data;
    if (func === 'generate') {
      data = generate(server, coursePath, question, variant_seed);
    } else if (func === 'grade') {
      data = grade(server, coursePath, submission, variant, question);
    } else {
      throw new Error(`Unknown function: ${func}`);
    }

    // Write data back to invoking process.
    stdoutWrite(JSON.stringify({ val: data, present: true }), 'utf-8');
    stdoutWrite('\n');

    // If we get here, everything went well - exit cleanly.
    process.exit(0);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  throw new Error('This script is designed to be run as the main process');
}
