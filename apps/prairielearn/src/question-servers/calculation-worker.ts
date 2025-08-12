#!/usr/bin/env node

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

import assert from 'node:assert';
import * as path from 'node:path';
import { type Interface, createInterface } from 'node:readline';

import { type Question, type Submission, type Variant } from '../lib/db-types.js';
import requireFrontend from '../lib/require-frontend.js';

import type { GenerateResultData, GradeResultData } from './types.js';

/**
 * Attempts to load the server module that should be used for a particular
 * question.
 *
 * @param questionServerPath The path to the JavaScript question server
 * @param coursePath The path to the course root directory
 */
async function loadServer(questionServerPath: string, coursePath: string): Promise<any> {
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
      (err: Error) => {
        const e = new Error(`Error loading ${path.basename(questionServerPath)}`, {
          cause: err,
        });
        reject(e);
      },
    );
  });
}

function generate(
  server: any,
  coursePath: string,
  question: Question,
  variant_seed: string,
): GenerateResultData {
  assert(question.directory, 'Question directory is required');

  const questionDir = path.join(coursePath, 'questions', question.directory);
  const options = question.options || {};

  const questionData = server.getData(variant_seed, options, questionDir);
  return {
    params: questionData.params ?? null,
    true_answer: questionData.trueAnswer ?? null,
    options: questionData.options || question.options || {},
  };
}

function grade(
  server: any,
  coursePath: string,
  submission: Submission,
  variant: Variant,
  question: Question,
): GradeResultData {
  assert(question.directory, 'Question directory is required');

  const vid = variant.variant_seed;

  // Note: v3 questions use `params` and `true_answer` from the submission instead
  // of the variant. That change isn't necessary for v2 questions because the
  // submission grading process isn't permitted to modify either the params or
  // the correct answer.
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
    submitted_answer: submission.submitted_answer ?? {},
    raw_submitted_answer: submission.raw_submitted_answer ?? {},
    format_errors: {},
    gradable: true,

    // Note: v3 questions can change `params` and `true_answer` during grading, but
    // this was not implemented for v2 questions.
    params: variant.params ?? {},
    true_answer: variant.true_answer ?? {},
  };
}

function getLineOnce(rl: Interface): Promise<string | null> {
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

// Redirect `stdout` to `stderr` so that we can ensure that no
// user code can write to `stdout`; we need to use `stdout` to send results
// instead.
const stdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = process.stderr.write.bind(process.stderr);

(async () => {
  const rl = createInterface({
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

  let data: Record<string, any>;
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
