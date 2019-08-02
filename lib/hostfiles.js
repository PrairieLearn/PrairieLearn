// @ts-check
const path = require('path');
const fs = require('fs-extra');
const chokidar = require('chokidar');

const logger = require('./logger');

/** @typedef {{ watch?: boolean }} Options */

/**
 * Copies the contents of `source` to `target`; erases existing content
 * at `target` first.
 *
 * @param {string} source
 * @param {string} target
 */
async function copy(source, target) {
  await fs.emptyDir(target);
  await fs.copy(source, target);
}

/**
 * Watches the `source` directory for changes and efficiently mirrors them to
 * `target`.
 *
 * @param {string} source
 * @param {string} target
 */
function watch(source, target) {
  chokidar.watch(source, { ignoreInitial: true }).on('all', (eventName, eventPath) => {
    (async () => {
      const relativePath = path.relative(source, eventPath);
      logger.info(`Propagating changes to "${eventPath}" to host`);
      if (['add', 'change'].includes(eventName)) {
        await fs.copy(eventPath, path.join(target, relativePath));
      } else if (eventName === 'addDir') {
        await fs.mkdirp(path.join(target, relativePath));
      } else if (['unlink', 'unlinkDir'].includes(eventName)) {
        await fs.remove(path.join(target, relativePath));
      }
    })().catch(err => {
      logger.error(`Failed to propagate changes (${err}); killing process for safety`);
      process.exit(1);
    });
  });
}

/**
 * @param {Options} options
 */
module.exports.copyQuestionPythonFiles = async function(options = {}) {
  const pythonDir = path.join(__dirname, '..', 'python');
  const targetDir = '/hostfiles/python';
  await copy(pythonDir, targetDir);
  if (options.watch) {
    watch(pythonDir, targetDir);
  }
};

/**
 * @param {Options} options
 */
module.exports.copyElementFiles = async function(options = {}) {
  const elementsDir = path.join(__dirname, '..', 'elements');
  const targetDir = '/hostfiles/elements';
  await copy(elementsDir, targetDir);
  if (options.watch) {
    watch(elementsDir, targetDir);
  }
};

/**
 * @param {Options} options
 */
module.exports.copyExampleCourseFiles = async function(options = {}) {
  const exampleCourseDir = path.join(__dirname, '..', 'exampleCourse');
  const targetDir = '/hostfiles/exampleCourse';
  await copy(exampleCourseDir, targetDir);
  if (options.watch) {
    watch(exampleCourseDir, targetDir);
  }
};
