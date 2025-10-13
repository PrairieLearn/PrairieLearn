import assert from 'node:assert';
import * as path from 'path';

import { pathExists } from 'fs-extra';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { QuestionSchema } from './db-types.js';
import { APP_ROOT_PATH } from './paths.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const QUESTION_DEFAULTS_PATH = path.resolve(APP_ROOT_PATH, 'v2-question-servers');

interface QuestionFilePathInfo {
  /** The full path, including the filename, of the file to load */
  fullPath: string;
  /** The filename, excluding the path */
  effectiveFilename: string;
  /** The path, excluding the filename. */
  rootPath: string;
}

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
 */
export async function questionFilePath(
  filename: string,
  questionDirectory: string,
  coursePath: string,
  question: any,
  nTemplates = 0,
): Promise<QuestionFilePathInfo> {
  const rootPath = path.join(coursePath, 'questions', questionDirectory);
  const fullPath = path.join(rootPath, filename);

  if (nTemplates > 10) {
    throw new Error(`Template recursion exceeded maximum depth of 10: ${rootPath}`);
  }

  if (await pathExists(fullPath)) {
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
    const templateQuestion = await sqldb.queryOptionalRow(
      sql.select_question,
      params,
      QuestionSchema,
    );
    if (templateQuestion === null) {
      throw new error.HttpStatusError(
        500,
        `Could not find template question "${question.template_directory}" from question "${question.directory}"`,
      );
    }

    assert(templateQuestion.directory !== null, 'template question directory is required');

    return await questionFilePath(
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

      if (await pathExists(fullPathCourse)) {
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

      if (await pathExists(fullDefaultFilePath)) {
        // Found a default file
        return {
          fullPath: fullDefaultFilePath,
          effectiveFilename: defaultFilename,
          rootPath: QUESTION_DEFAULTS_PATH,
        };
      } else {
        // No default file, give up
        throw new error.AugmentedError('File not found', {
          data: { fullPath, fullDefaultFilePath },
        });
      }
    }
  }
}
