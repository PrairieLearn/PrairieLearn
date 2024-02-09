// @ts-check
import * as fs from 'fs-extra';
import * as path from 'path';
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { APP_ROOT_PATH } from './paths';

const sql = sqldb.loadSqlEquiv(__filename);
const QUESTION_DEFAULTS_PATH = path.resolve(APP_ROOT_PATH, 'v2-question-servers');

/**
 * @typedef {Object} QuestionFilePathInfo
 * @property {string} fullPath The full path, including the filename, of the file to load
 * @property {string} effectiveFilename The filename, excluding the path
 * @property {string} rootPath The path, excluding the filename.
 */

/**
 * Returns the full path for a file, as well as the effective filename and
 * the root path.
 *
 * Note that `fullPath === rootPath + '/' + effectiveFilename`.
 *
 * These can be used like this for safety when sending files:
 *
 * ```
 * res.sendFile(effectiveFilename, { root: rootPath });
 * ```
 *
 * @param {string} filename
 * @param {string} questionDirectory
 * @param {string} coursePath
 * @param {any} question
 * @param {number} nTemplates
 * @returns {Promise<QuestionFilePathInfo>}
 */
export async function questionFilePathAsync(
  filename,
  questionDirectory,
  coursePath,
  question,
  nTemplates = 0,
) {
  const rootPath = path.join(coursePath, 'questions', questionDirectory);
  const fullPath = path.join(rootPath, filename);

  if (nTemplates > 10) {
    throw new Error(`Template recursion exceeded maximum depth of 10: ${rootPath}`);
  }

  if (await fs.pathExists(fullPath)) {
    // Found the file!
    return {
      fullPath,
      effectiveFilename: filename,
      rootPath,
    };
  }

  if (question.template_directory) {
    // We have a template, try it
    const params = {
      course_id: question.course_id,
      directory: question.template_directory,
    };
    const result = await sqldb.queryZeroOrOneRowAsync(sql.select_question, params);
    if (result.rowCount === 0) {
      throw error.make(
        500,
        `Could not find template question "${question.template_directory}" from question "${question.directory}"`,
      );
    }

    const templateQuestion = result.rows[0];
    return questionFilePathAsync(
      filename,
      templateQuestion.directory,
      coursePath,
      templateQuestion,
      nTemplates + 1,
    );
  } else {
    // No template, try default files
    const filenameToSuffix = {
      'client.js': 'Client.js',
      'server.js': 'Server.js',
    };
    if (filenameToSuffix[filename] === undefined) {
      // no default for this file type, so try clientFilesCourse
      const rootPathCourse = path.join(coursePath, 'clientFilesCourse');
      const fullPathCourse = path.join(rootPathCourse, filename);

      if (await fs.pathExists(fullPathCourse)) {
        return {
          fullPath: fullPathCourse,
          effectiveFilename: filename,
          rootPath: rootPathCourse,
        };
      } else {
        throw new Error(`File not found at "${fullPath}" or "${fullPathCourse}"`);
      }
    } else {
      const defaultFilename = question.type + filenameToSuffix[filename];
      const fullDefaultFilePath = path.join(QUESTION_DEFAULTS_PATH, defaultFilename);

      if (await fs.pathExists(fullDefaultFilePath)) {
        // Found a default file
        return {
          fullPath: fullDefaultFilePath,
          effectiveFilename: defaultFilename,
          rootPath: QUESTION_DEFAULTS_PATH,
        };
      } else {
        // No default file, give up
        throw error.makeWithData('File not found', { fullPath, fullDefaultFilePath });
      }
    }
  }
}

export function questionFilePath(filename, questionDirectory, coursePath, question, callback) {
  questionFilePathAsync(filename, questionDirectory, coursePath, question)
    .then(({ fullPath, effectiveFilename, rootPath }) => {
      callback(null, fullPath, effectiveFilename, rootPath);
    })
    .catch((err) => {
      callback(err);
    });
}
