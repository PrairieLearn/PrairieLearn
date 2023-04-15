// @ts-check
const fs = require('fs-extra');
const path = require('path');
const error = require('@prairielearn/error');
const sqldb = require('@prairielearn/postgres');

const config = require('./config');

const sql = sqldb.loadSqlEquiv(__filename);

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
module.exports.questionFilePathAsync = async function (
  filename,
  questionDirectory,
  coursePath,
  question,
  nTemplates = 0
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
        { sql: sql.select_question, params: params }
      );
    }

    const templateQuestion = result.rows[0];
    return module.exports.questionFilePathAsync(
      filename,
      templateQuestion.directory,
      coursePath,
      templateQuestion,
      nTemplates + 1
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
      const fullDefaultFilePath = path.join(config.questionDefaultsDir, defaultFilename);

      if (await fs.pathExists(fullDefaultFilePath)) {
        // Found a default file
        return {
          fullPath: fullDefaultFilePath,
          effectiveFilename: defaultFilename,
          rootPath: config.questionDefaultsDir,
        };
      } else {
        // No default file, give up
        throw error.makeWithData('File not found', { fullPath, fullDefaultFilePath });
      }
    }
  }
};

module.exports.questionFilePath = function (
  filename,
  questionDirectory,
  coursePath,
  question,
  callback
) {
  module.exports
    .questionFilePathAsync(filename, questionDirectory, coursePath, question)
    .then(({ fullPath, effectiveFilename, rootPath }) => {
      callback(null, fullPath, effectiveFilename, rootPath);
    })
    .catch((err) => {
      callback(err);
    });
};
