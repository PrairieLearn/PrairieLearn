// @ts-check
// This is meant to be invoked from `./question-servers/calculation.js`. It
// serves to isolate code from the main process that's handling requests.

const path = require('path');
const fs = require('fs');

const error = require('../prairielib/lib/error');
const filePaths = require('../lib/file-paths');
const requireFrontend = require('../lib/require-frontend');

/**
 * 
 * @param {string} coursePath 
 * @param {any} question 
 * @returns {Promise<any>}
 */
async function loadServer(coursePath, question) {
  const { fullPath: questionServerPath } =
    await filePaths.questionFilePathAsync(
      'server.js',
      question.directory,
      coursePath,
      question,
    );

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
          reject(new Error(`Could not load "server.js" for QID "${question.qid}"`));
        }
        // Apparently we need to use `setTimeout` to "get out of requireJS error handling".
        // TODO: is this actually necessary?
        setTimeout(() => resolve(server), 0);
      },
      (err) => {
        const e = error.makeWithData(
          `Error loading server.js for QID ${question.qid}`,
          err,
        );
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
    params: questionData.params,
    true_answer: questionData.trueAnswer,
    options: questionData.options || question.options || {},
  };
}

function getFile(server, coursePath, filename, variant, question) {
  const vid = variant.variant_seed;
  const params = variant.params;
  const trueAnswer = variant.true_answer;
  const options = variant.options;
  const questionDir = path.join(coursePath, 'questions', question.directory);
  return server.getFile(
    filename,
    vid,
    params,
    trueAnswer,
    options,
    questionDir,
  );
}

async function grade(server, coursePath, submission, variant, question) {
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
    score: score,
    v2_score: grading.score,
    feedback: grading.feedback,
    partial_scores: {},
    submitted_answer: submission.submitted_answer,
    format_errors: {},
    gradable: true,
    params: variant.params,
    true_answer: variant.true_answer,
  };
}

if (require.main === module) {
  (async () => {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const line = await new Promise((resolve) => {
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

    if (!line) {
      // TODO: handle me.
    }

    // Close the reader to empty the event loop
    rl.close();

    const input = JSON.parse(line);

    const {
      // These first three are required.
      func,
      coursePath,
      question,

      // Depending on which function is being invoked, these may or may not
      // be present.
      variant_seed,
      filename,
      variant,
      submission,
    } = input;

    const server = await loadServer(coursePath, question);

    let val;
    if (func === 'generate') {
      val = generate(server, coursePath, question, variant_seed);
    } else if (func === 'getFile') {
      val = getFile(server, coursePath, filename, variant, question);
    } else if (func === 'grade') {
      val = grade(server, coursePath, submission, variant, question);
    } else {
      throw new Error(`Unknown function: ${func}`);
    }

    // Write data back to invoking process.
    fs.writeFileSync(3, JSON.stringify({ val }), { encoding: 'utf-8' });
    fs.writeFileSync(3, '\n');
    fs.fdatasyncSync(3);

    // If we get here, everything went well - exit cleanly.
    process.exit(1);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  throw new Error('This script is designed to be run as the main process');
}
