import * as path from 'path';

import * as error from '@prairielearn/error';
import { html, type HtmlSafeString } from '@prairielearn/html';
import { contains } from '@prairielearn/path-utils';

export interface InstructorFilePaths {
  coursePath: string;
  courseId: string;
  hasEditPermission: boolean;
  rootPath: string;
  invalidRootPaths: string[];
  cannotMove: string[];
  clientDir: string;
  serverDir?: string;
  testsDir?: string;
  urlPrefix: string;
  workingPath: string;
  workingPathRelativeToCourse: string;
  workingDirectory: string;
  workingFilename: string;
  specialDirs: {
    label: string;
    path: string;
    info: HtmlSafeString;
  }[];
  branch: {
    name: string;
    path: string;
    canView: boolean;
  }[];
}

function getContextPaths(
  locals: Record<string, any>,
): Pick<
  InstructorFilePaths,
  | 'rootPath'
  | 'invalidRootPaths'
  | 'cannotMove'
  | 'clientDir'
  | 'serverDir'
  | 'testsDir'
  | 'urlPrefix'
> {
  const coursePath: string = locals.course.path;
  if (locals.navPage === 'course_admin') {
    const rootPath = coursePath;
    return {
      rootPath,
      invalidRootPaths: [path.join(rootPath, 'questions'), path.join(rootPath, 'courseInstances')],
      cannotMove: [path.join(rootPath, 'infoCourse.json')],
      clientDir: path.join(rootPath, 'clientFilesCourse'),
      serverDir: path.join(rootPath, 'serverFilesCourse'),
      urlPrefix: `${locals.urlPrefix}/course_admin`,
    };
  } else if (locals.navPage === 'instance_admin') {
    const rootPath = path.join(coursePath, 'courseInstances', locals.course_instance.short_name);
    return {
      rootPath,
      invalidRootPaths: [path.join(rootPath, 'assessments')],
      cannotMove: [path.join(rootPath, 'infoCourseInstance.json')],
      clientDir: path.join(rootPath, 'clientFilesCourseInstance'),
      urlPrefix: `${locals.urlPrefix}/instance_admin`,
    };
  } else if (locals.navPage === 'assessment') {
    const rootPath = path.join(
      coursePath,
      'courseInstances',
      locals.course_instance.short_name,
      'assessments',
      locals.assessment.tid,
    );
    return {
      rootPath,
      invalidRootPaths: [],
      cannotMove: [path.join(rootPath, 'infoAssessment.json')],
      clientDir: path.join(rootPath, 'clientFilesAssessment'),
      urlPrefix: `${locals.urlPrefix}/assessment/${locals.assessment.id}`,
    };
  } else if (locals.navPage === 'question') {
    const rootPath = path.join(coursePath, 'questions', locals.question.qid);
    return {
      rootPath,
      invalidRootPaths: [],
      cannotMove: [path.join(rootPath, 'info.json')],
      clientDir: path.join(rootPath, 'clientFilesQuestion'),
      testsDir: path.join(rootPath, 'tests'),
      urlPrefix: `${locals.urlPrefix}/question/${locals.question.id}`,
    };
  } else {
    throw new Error(`Invalid navPage: ${locals.navPage}`);
  }
}

/**
 * For the file path of the current page, this function returns rich
 * information about higher folders up to a certain level determined by
 * the navPage. Created for use in instructor file views.
 */
export function getPaths(
  requestedPath: string | undefined,
  locals: Record<string, any>,
): InstructorFilePaths {
  const coursePath: string = locals.course.path;
  const courseId: string = locals.course.id;
  const hasEditPermission: boolean =
    locals.authz_data.has_course_permission_edit && !locals.course.example_course;

  const { rootPath, invalidRootPaths, cannotMove, clientDir, serverDir, testsDir, urlPrefix } =
    getContextPaths(locals);

  let workingPath = rootPath;
  if (requestedPath) {
    try {
      workingPath = path.join(coursePath, requestedPath);
    } catch {
      throw new Error(`Invalid path: ${requestedPath}`);
    }
  }
  const workingPathRelativeToCourse = path.relative(coursePath, workingPath);
  const workingDirectory = path.dirname(workingPathRelativeToCourse);
  const workingFilename = path.basename(workingPathRelativeToCourse);

  const specialDirs: InstructorFilePaths['specialDirs'] = [];
  if (workingPath === rootPath) {
    specialDirs.push({
      label: 'Client',
      path: clientDir,
      info: html`This file will be placed in the subdirectory
        <code>${path.basename(clientDir)}</code> and will be accessible from the student's web
        browser.`,
    });
    if (serverDir) {
      specialDirs.push({
        label: 'Server',
        path: serverDir,
        info: html`This file will be placed in the subdirectory
          <code>${path.basename(serverDir)}</code> and will be accessible only from the server. It
          will not be accessible from the student's web browser.`,
      });
    }
    if (testsDir) {
      specialDirs.push({
        label: 'Test',
        path: testsDir,
        info: html`This file will be placed in the subdirectory
          <code>${path.basename(testsDir)}</code> and will be accessible only from the server. It
          will not be accessible from the student's web browser. This is appropriate for code to
          support
          <a href="https://prairielearn.readthedocs.io/en/latest/externalGrading/">
            externally graded questions</a
          >.`,
      });
    }
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
        };
      }),
  ];

  return {
    coursePath,
    courseId,
    hasEditPermission,
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
