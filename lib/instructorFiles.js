const path = require('path');
const { encodePath, decodePath } = require('./uri-util');

/**
 * Returs true if the parent path contains the child path. Used to allow code to make checks that
 * prevent directory traversal attacks.
 * @param {string} parentPath - the path of the parent directory.
 * @param {string} childPath - the path of the child directory.
 * @param {boolean=true} includeSelf - return value if both paths point to the same directory.
 * @return {boolean} true if the child path is a child of the parent path, false otherwise.
 */
function contains(parentPath, childPath, includeSelf = true) {
  const relPath = path.relative(parentPath, childPath);
  if (!relPath) return includeSelf;
  return !(relPath.split(path.sep)[0] === '..' || path.isAbsolute(relPath));
}

/**
 * For the file path of the current page, this function returns rich
 * information about higher folders up to a certain level determined by
 * the navPage. Created for use in instructor file views.
 */
function getPaths(req, res, callback) {
  let paths = {
    coursePath: res.locals.course.path,
    courseId: res.locals.course.id,
  };

  if (res.locals.navPage === 'course_admin') {
    paths.rootPath = res.locals.course.path;
    paths.invalidRootPaths = [
      path.join(paths.rootPath, 'questions'),
      path.join(paths.rootPath, 'courseInstances'),
    ];
    paths.cannotMove = [path.join(paths.rootPath, 'infoCourse.json')];
    paths.clientDir = path.join(paths.rootPath, 'clientFilesCourse');
    paths.serverDir = path.join(paths.rootPath, 'serverFilesCourse');
    paths.urlPrefix = `${res.locals.urlPrefix}/course_admin`;
  } else if (res.locals.navPage === 'instance_admin') {
    paths.rootPath = path.join(
      res.locals.course.path,
      'courseInstances',
      res.locals.course_instance.short_name
    );
    paths.invalidRootPaths = [path.join(paths.rootPath, 'assessments')];
    paths.cannotMove = [path.join(paths.rootPath, 'infoCourseInstance.json')];
    paths.clientDir = path.join(paths.rootPath, 'clientFilesCourseInstance');
    paths.serverDir = path.join(paths.rootPath, 'serverFilesCourseInstance');
    paths.urlPrefix = `${res.locals.urlPrefix}/instance_admin`;
  } else if (res.locals.navPage === 'assessment') {
    paths.rootPath = path.join(
      res.locals.course.path,
      'courseInstances',
      res.locals.course_instance.short_name,
      'assessments',
      res.locals.assessment.tid
    );
    paths.invalidRootPaths = [];
    paths.cannotMove = [path.join(paths.rootPath, 'infoAssessment.json')];
    paths.clientDir = path.join(paths.rootPath, 'clientFilesAssessment');
    paths.serverDir = path.join(paths.rootPath, 'serverFilesAssessment');
    paths.urlPrefix = `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}`;
  } else if (res.locals.navPage === 'question') {
    paths.rootPath = path.join(res.locals.course.path, 'questions', res.locals.question.qid);
    paths.invalidRootPaths = [];
    paths.cannotMove = [path.join(paths.rootPath, 'info.json')];
    paths.clientDir = path.join(paths.rootPath, 'clientFilesQuestion');
    paths.serverDir = path.join(paths.rootPath, 'serverFilesQuestion');
    paths.testsDir = path.join(paths.rootPath, 'tests');
    paths.urlPrefix = `${res.locals.urlPrefix}/question/${res.locals.question.id}`;
  } else {
    return callback(new Error(`Invalid navPage: ${res.locals.navPage}`));
  }

  if (req.params[0]) {
    try {
      paths.workingPath = path.join(res.locals.course.path, decodePath(req.params[0]));
    } catch (err) {
      return callback(new Error(`Invalid path: ${req.params[0]}`));
    }
  } else {
    paths.workingPath = paths.rootPath;
  }
  paths.workingPathRelativeToCourse = path.relative(res.locals.course.path, paths.workingPath);

  if (paths.workingPath === paths.rootPath) {
    paths.specialDirs = [];
    if (paths.clientDir) {
      paths.specialDirs.push({
        label: 'Client',
        path: paths.clientDir,
        info: `This file will be placed in the subdirectory <code>${path.basename(
          paths.clientDir
        )}</code> and will be accessible from the student's webbrowser.`,
      });
    }
    if (paths.serverDir) {
      paths.specialDirs.push({
        label: 'Server',
        path: paths.serverDir,
        info: `This file will be placed in the subdirectory <code>${path.basename(
          paths.serverDir
        )}</code> and will be accessible only from the server. It will not be accessible from the student's webbrowser.`,
      });
    }
    if (paths.testsDir) {
      paths.specialDirs.push({
        label: 'Test',
        path: paths.testsDir,
        info: `This file will be placed in the subdirectory <code>${path.basename(
          paths.testsDir
        )}</code> and will be accessible only from the server. It will not be accessible from the student's webbrowser. This is appropriate for code to support <a href='https://prairielearn.readthedocs.io/en/latest/externalGrading/'>externally graded questions</a>.`,
      });
    }
  }

  if (!contains(paths.rootPath, paths.workingPath)) {
    let err = new Error('Invalid working directory');
    err.info =
      `<p>The working directory</p>` +
      `<div class="container"><pre class="bg-dark text-white rounded p-2">${paths.workingPath}</pre></div>` +
      `<p>must be inside the root directory</p>` +
      `<div class="container"><pre class="bg-dark text-white rounded p-2">${paths.rootPath}</pre></div>` +
      `<p>when looking at <code>${res.locals.navPage}</code> files.</p>`;
    return callback(err);
  }

  const found = paths.invalidRootPaths.find((invalidRootPath) =>
    contains(invalidRootPath, paths.workingPath)
  );
  if (found) {
    let err = new Error('Invalid working directory');
    err.info =
      `<p>The working directory</p>` +
      `<div class="container"><pre class="bg-dark text-white rounded p-2">${paths.workingPath}</pre></div>` +
      `<p>must <em>not</em> be inside the directory</p>` +
      `<div class="container"><pre class="bg-dark text-white rounded p-2">${found}</pre></div>` +
      `<p>when looking at <code>${res.locals.navPage}</code> files.</p>`;
    return callback(err);
  }

  let curPath = res.locals.course.path;
  paths.branch = [
    {
      name: path.basename(curPath),
      path: path.relative(res.locals.course.path, curPath),
      canView: contains(paths.rootPath, curPath),
      encodedPath: encodePath(path.relative(res.locals.course.path, curPath)),
    },
  ];
  path
    .relative(res.locals.course.path, paths.workingPath)
    .split(path.sep)
    .forEach((dir) => {
      if (dir) {
        curPath = path.join(curPath, dir);
        paths.branch.push({
          name: path.basename(curPath),
          path: path.relative(res.locals.course.path, curPath),
          canView: contains(paths.rootPath, curPath),
          encodedPath: encodePath(path.relative(res.locals.course.path, curPath)),
        });
      }
    });

  callback(null, paths);
}

module.exports = {
  contains,
  getPaths,
};
