// @ts-check
import _ from 'lodash';
import * as fsExtra from 'fs-extra';
import * as fsPromises from 'node:fs/promises';
import * as path from 'path';

import { logger } from '@prairielearn/logger';
import { contains } from '@prairielearn/path-utils';
import { getRuntimeDirectoryForCourse } from './chunks.js';

/**
 * Returns the directory where job files should be written to while running
 * with AWS infrastructure.
 */
export function getJobDirectory(jobId) {
  return `/jobs/job_${jobId}`;
}

/**
 * Constructs a directory of files to be used for grading.
 *
 * @param {string} dir
 * @param {import('./db-types.js').Submission} submission
 * @param {import('./db-types.js').Variant} variant
 * @param {import('./db-types.js').Question} question
 * @param {import('./db-types.js').Course} course
 */
export async function buildDirectory(dir, submission, variant, question, course) {
  const coursePath = getRuntimeDirectoryForCourse(course);
  try {
    // Attempt to remove existing directory first
    await fsPromises.rm(dir, { force: true, recursive: true });
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.mkdir(path.join(dir, 'serverFilesCourse'));
    await fsPromises.mkdir(path.join(dir, 'tests'));
    await fsPromises.mkdir(path.join(dir, 'student'));
    await fsPromises.mkdir(path.join(dir, 'data'));

    // Copy all specified files/directories into serverFilesCourse/
    for (const file of question.external_grading_files ?? []) {
      const src = path.join(coursePath, 'serverFilesCourse', file);
      const dest = path.join(dir, 'serverFilesCourse', file);
      await fsExtra.copy(src, dest);
    }

    // This is temporary while /grade/shared is deprecated but still supported
    // TODO remove this when we remove support for /grade/shared
    const src = path.join(dir, 'serverFilesCourse');
    const dest = path.join(dir, 'shared');
    await fsExtra.copy(src, dest);

    if (question.directory != null) {
      const testsDir = path.join(coursePath, 'questions', question.directory, 'tests');
      await fsExtra.copy(testsDir, path.join(dir, 'tests')).catch((err) => {
        // Tests might not be specified, only copy them if they exist
        if (err.code !== 'ENOENT') throw err;
      });
    }

    for (const file of submission.submitted_answer?._files ?? []) {
      if (!file.name) {
        throw new Error("File was missing 'name' property.");
      }
      if (file.contents == null) {
        throw new Error("File was missing 'contents' property.");
      }

      // Files are expected to be base-64 encoded
      let decodedContents = Buffer.from(file.contents, 'base64');
      // Check that the file name does not try to navigate up in
      // the directory hierarchy
      const fullPath = path.join(dir, 'student', file.name);
      if (!contains(path.join(dir, 'student'), fullPath)) {
        throw new Error('Invalid filename');
      }

      await fsPromises.mkdir(path.dirname(fullPath), { recursive: true });
      await fsPromises.writeFile(fullPath, decodedContents);
    }

    // This uses the same fields passed v3's server.grade functions
    const data = {
      params: variant.params,
      correct_answers: variant.true_answer,
      submitted_answers: submission.submitted_answer,
      format_errors: submission.format_errors,
      partial_scores: submission.partial_scores ?? {},
      score: submission.score ?? 0,
      feedback: submission.feedback ?? {},
      variant_seed: parseInt(variant.variant_seed ?? '0', 36),
      options: variant.options || {},
      raw_submitted_answers: submission.raw_submitted_answer,
      gradable: submission.gradable,
    };
    await fsPromises.writeFile(path.join(dir, 'data', 'data.json'), JSON.stringify(data));

    logger.verbose(`Successfully set up ${dir}`);
  } catch (err) {
    logger.error(`Error setting up ${dir}`);
    throw err;
  }
}

/**
 * Generates an object that can be passed to assessment.processGradingResult.
 * This function can be passed a parsed results object, or it can be passed a
 * string or buffer to attempt to parse it and mark the grading job as failed when
 * parsing fails.
 *
 * @param {Object|string|Buffer} rawData - The grading results
 */
export function makeGradingResult(jobId, rawData) {
  let data = rawData;

  // Convert objects or buffers to strings so that we can remove null bytes,
  // which Postgres doesn't like
  if (Buffer.isBuffer(rawData)) {
    data = rawData.toString('utf-8');
  } else if (_.isObject(rawData)) {
    data = JSON.stringify(rawData);
  }
  try {
    // replace NULL with unicode replacement character
    data = JSON.parse(data.replace(/\0/g, '\ufffd'));
  } catch (e) {
    return makeGradingFailureWithMessage(jobId, data, 'Could not parse the grading results.');
  }

  function replaceNull(d) {
    if (_.isString(d)) {
      // replace NULL with unicode replacement character
      return d.replace(/\0/g, '\ufffd');
    } else if (_.isArray(d)) {
      return _.map(d, (x) => replaceNull(x));
    } else if (_.isObject(d)) {
      return _.mapValues(d, (x) => replaceNull(x));
    } else {
      return d;
    }
  }
  data = replaceNull(data);

  if (typeof data.succeeded !== 'boolean') {
    return makeGradingFailureWithMessage(jobId, data, "results did not contain 'succeeded' field.");
  }

  if (!data.succeeded) {
    return {
      gradingId: jobId,
      grading: {
        receivedTime: data.received_time || null,
        startTime: data.start_time || null,
        endTime: data.end_time || null,
        score: 0,
        feedback: data,
        format_errors: {},
      },
    };
  }

  if (!data.results) {
    return makeGradingFailureWithMessage(jobId, data, "results did not contain 'results' object.");
  }

  let score = 0.0;
  if (typeof data.results.score === 'number' || !Number.isNaN(data.results.score)) {
    score = data.results.score;
  } else {
    return makeGradingFailureWithMessage(
      jobId,
      data,
      `score "${data.results.score}" was not a number.`,
    );
  }

  let format_errors = [];
  if (typeof data.results.format_errors === 'string') {
    format_errors = [data.results.format_errors];
  } else if (Array.isArray(data.results.format_errors)) {
    format_errors = data.results.format_errors;
  }

  return {
    gradingId: jobId,
    grading: {
      receivedTime: data.received_time || null,
      startTime: data.start_time || null,
      endTime: data.end_time || null,
      score,
      feedback: data,
      format_errors: JSON.stringify({ _external_grader: format_errors }),
    },
  };
}

function makeGradingFailureWithMessage(jobId, data, message) {
  return {
    gradingId: jobId,
    grading: {
      receivedTime: (data && data.received_time) || null,
      startTime: (data && data.start_time) || null,
      endTime: (data && data.end_time) || null,
      score: 0,
      feedback: {
        succeeded: false,
        message,
      },
      format_errors: {},
    },
  };
}
