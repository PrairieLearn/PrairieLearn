// @ts-check
import * as path from 'path';

import * as error from '@prairielearn/error';
import { html } from '@prairielearn/html';
import { contains } from '@prairielearn/path-utils';

import { encodePath } from './uri-util.js';

/**
 * For the file path of the current page, this function returns rich
 * information about higher folders up to a certain level determined by
 * the navPage. Created for use in instructor file views.
 *
 * @param {string | undefined} requestedPath
 * @param {Record<string, any>} locals
 */
export function getPaths(requestedPath, locals) {
  /** @type {string} */
  const coursePath = locals.course.path;
  /** @type {string} */
  const courseId = locals.course.id;

  /** @type {string} */
  let rootPath;
  /** @type {string[]} */
  let invalidRootPaths;
  /** @type {string[]} */
  let cannotMove;
  /** @type {string} */
  let clientDir;
  /** @type {string} */
  let serverDir;
  /** @type {string|undefined} */
  let testsDir;
  /** @type {string} */
  let urlPrefix;
  if (locals.navPage === 'course_admin') {
    rootPath = coursePath;
    invalidRootPaths = [path.join(rootPath, 'questions'), path.join(rootPath, 'courseInstances')];
    cannotMove = [path.join(rootPath, 'infoCourse.json')];
    clientDir = path.join(rootPath, 'clientFilesCourse');
    serverDir = path.join(rootPath, 'serverFilesCourse');
    urlPrefix = `${locals.urlPrefix}/course_admin`;
  } else if (locals.navPage === 'instance_admin') {
    rootPath = path.join(coursePath, 'courseInstances', locals.course_instance.short_name);
    invalidRootPaths = [path.join(rootPath, 'assessments')];
    cannotMove = [path.join(rootPath, 'infoCourseInstance.json')];
    clientDir = path.join(rootPath, 'clientFilesCourseInstance');
    serverDir = path.join(rootPath, 'serverFilesCourseInstance');
    urlPrefix = `${locals.urlPrefix}/instance_admin`;
  } else if (locals.navPage === 'assessment') {
    rootPath = path.join(
      coursePath,
      'courseInstances',
      locals.course_instance.short_name,
      'assessments',
      locals.assessment.tid,
    );
    invalidRootPaths = [];
    cannotMove = [path.join(rootPath, 'infoAssessment.json')];
    clientDir = path.join(rootPath, 'clientFilesAssessment');
    serverDir = path.join(rootPath, 'serverFilesAssessment');
    urlPrefix = `${locals.urlPrefix}/assessment/${locals.assessment.id}`;
  } else if (locals.navPage === 'question') {
    rootPath = path.join(coursePath, 'questions', locals.question.qid);
    invalidRootPaths = [];
    cannotMove = [path.join(rootPath, 'info.json')];
    clientDir = path.join(rootPath, 'clientFilesQuestion');
    serverDir = path.join(rootPath, 'serverFilesQuestion');
    testsDir = path.join(rootPath, 'tests');
    urlPrefix = `${locals.urlPrefix}/question/${locals.question.id}`;
  } else {
    throw new Error(`Invalid navPage: ${locals.navPage}`);
  }

  let workingPath = rootPath;
  if (requestedPath) {
    try {
      workingPath = path.join(coursePath, requestedPath);
    } catch (err) {
      throw new Error(`Invalid path: ${requestedPath}`);
    }
  }
  const workingPathRelativeToCourse = path.relative(coursePath, workingPath);
  const workingDirectory = path.dirname(workingPathRelativeToCourse);
  const workingFilename = path.basename(workingPathRelativeToCourse);

  const specialDirs =
    workingPath === rootPath
      ? [
          {
            label: 'Client',
            path: clientDir,
            info: html`This file will be placed in the subdirectory
              <code>${path.basename(clientDir)}</code> and will be accessible from the student's web
              browser.`,
          },
          {
            label: 'Server',
            path: serverDir,
            info: html`This file will be placed in the subdirectory
              <code>${path.basename(serverDir)}</code> and will be accessible only from the server.
              It will not be accessible from the student's web browser.`,
          },
        ]
      : [];
  if (workingPath === rootPath && testsDir) {
    specialDirs.push({
      label: 'Test',
      path: testsDir,
      info: html`This file will be placed in the subdirectory
        <code>${path.basename(testsDir)}</code> and will be accessible only from the server. It will
        not be accessible from the student's web browser. This is appropriate for code to support
        <a href="https://prairielearn.readthedocs.io/en/latest/externalGrading/">
          externally graded questions</a
        >.`,
    });
  }

  if (!contains(rootPath, workingPath)) {
    throw new error.AugmentedError('Invalid working directory', {
      info: html`
        <p>The working directory</p>
        <div class="container">
          <pre class="bg-dark text-white rounded p-2">${workingPath}</pre>
        </div>
        <p>must be inside the root directory</p>
        <div class="container">
          <pre class="bg-dark text-white rounded p-2">${rootPath}</pre>
        </div>
        <p>when looking at <code>${locals.navPage}</code> files.</p>
      `,
    });
  }

  const found = invalidRootPaths.find((invalidRootPath) => contains(invalidRootPath, workingPath));
  if (found) {
    throw new error.AugmentedError('Invalid working directory', {
      info: html`
        <p>The working directory</p>
        <div class="container">
          <pre class="bg-dark text-white rounded p-2">${workingPath}</pre>
        </div>
        <p>must <em>not</em> be inside the directory</p>
        <div class="container"><pre class="bg-dark text-white rounded p-2">${found}</pre></div>
        <p>when looking at <code>${locals.navPage}</code> files.</p>
      `,
    });
  }

  let curPath = coursePath;
  const branch = [
    {
      name: path.basename(curPath),
      path: path.relative(coursePath, curPath),
      canView: contains(rootPath, curPath),
      encodedPath: encodePath(path.relative(coursePath, curPath)),
    },
    ...path
      .relative(coursePath, workingPath)
      .split(path.sep)
      .filter((dir) => dir)
      .map((dir) => {
        curPath = path.join(curPath, dir);
        return {
          name: path.basename(curPath),
          path: path.relative(coursePath, curPath),
          canView: contains(rootPath, curPath),
          encodedPath: encodePath(path.relative(coursePath, curPath)),
        };
      }),
  ];

  return {
    coursePath,
    courseId,
    rootPath,
    invalidRootPaths,
    cannotMove,
    clientDir,
    serverDir,
    testsDir,
    urlPrefix,
    workingPath,
    workingPathRelativeToCourse,
    workingDirectory,
    workingFilename,
    specialDirs,
    branch,
  };
}
