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
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function getPaths(req, res) {
  /** @type {string} */
  const coursePath = res.locals.course.path;
  /** @type {string} */
  const courseId = res.locals.course.id;

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
  if (res.locals.navPage === 'course_admin') {
    rootPath = res.locals.course.path;
    invalidRootPaths = [path.join(rootPath, 'questions'), path.join(rootPath, 'courseInstances')];
    cannotMove = [path.join(rootPath, 'infoCourse.json')];
    clientDir = path.join(rootPath, 'clientFilesCourse');
    serverDir = path.join(rootPath, 'serverFilesCourse');
    urlPrefix = `${res.locals.urlPrefix}/course_admin`;
  } else if (res.locals.navPage === 'instance_admin') {
    rootPath = path.join(
      res.locals.course.path,
      'courseInstances',
      res.locals.course_instance.short_name,
    );
    invalidRootPaths = [path.join(rootPath, 'assessments')];
    cannotMove = [path.join(rootPath, 'infoCourseInstance.json')];
    clientDir = path.join(rootPath, 'clientFilesCourseInstance');
    serverDir = path.join(rootPath, 'serverFilesCourseInstance');
    urlPrefix = `${res.locals.urlPrefix}/instance_admin`;
  } else if (res.locals.navPage === 'assessment') {
    rootPath = path.join(
      res.locals.course.path,
      'courseInstances',
      res.locals.course_instance.short_name,
      'assessments',
      res.locals.assessment.tid,
    );
    invalidRootPaths = [];
    cannotMove = [path.join(rootPath, 'infoAssessment.json')];
    clientDir = path.join(rootPath, 'clientFilesAssessment');
    serverDir = path.join(rootPath, 'serverFilesAssessment');
    urlPrefix = `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}`;
  } else if (res.locals.navPage === 'question') {
    rootPath = path.join(res.locals.course.path, 'questions', res.locals.question.qid);
    invalidRootPaths = [];
    cannotMove = [path.join(rootPath, 'info.json')];
    clientDir = path.join(rootPath, 'clientFilesQuestion');
    serverDir = path.join(rootPath, 'serverFilesQuestion');
    testsDir = path.join(rootPath, 'tests');
    urlPrefix = `${res.locals.urlPrefix}/question/${res.locals.question.id}`;
  } else {
    throw new Error(`Invalid navPage: ${res.locals.navPage}`);
  }

  let workingPath = rootPath;
  if (req.params[0]) {
    try {
      workingPath = path.join(res.locals.course.path, req.params[0]);
    } catch (err) {
      throw new Error(`Invalid path: ${req.params[0]}`);
    }
  }
  const workingPathRelativeToCourse = path.relative(res.locals.course.path, workingPath);
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
        <p>when looking at <code>${res.locals.navPage}</code> files.</p>
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
        <p>when looking at <code>${res.locals.navPage}</code> files.</p>
      `,
    });
  }

  let curPath = res.locals.course.path;
  const branch = [
    {
      name: path.basename(curPath),
      path: path.relative(res.locals.course.path, curPath),
      canView: contains(rootPath, curPath),
      encodedPath: encodePath(path.relative(res.locals.course.path, curPath)),
    },
    ...path
      .relative(res.locals.course.path, workingPath)
      .split(path.sep)
      .filter((dir) => dir)
      .map((dir) => {
        curPath = path.join(curPath, dir);
        return {
          name: path.basename(curPath),
          path: path.relative(res.locals.course.path, curPath),
          canView: contains(rootPath, curPath),
          encodedPath: encodePath(path.relative(res.locals.course.path, curPath)),
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
