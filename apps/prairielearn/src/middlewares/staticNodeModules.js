// @ts-check
const express = require('express');
const path = require('node:path');

const { APP_ROOT_PATH, REPOSITORY_ROOT_PATH } = require('../lib/paths');

const NODE_MODULES_PATHS = [
  path.resolve(APP_ROOT_PATH, 'node_modules'),
  path.resolve(REPOSITORY_ROOT_PATH, 'node_modules'),
];

/**
 * Allows serving static files from multiple `node_modules` directories.
 * Multiple directories are supported to account for the fact that PrairieLearn
 * is in a monorepo and dependencies might be located in either `node_modules`
 * or `apps/prairielearn/node_modules`.
 *
 * The first argument is a path within `node_modules` to serve. This can be '.'
 * to serve all files, or a subdirectory like `mathjax/es5`.
 *
 * @param {string} servePath
 * @param {import('serve-static').ServeStaticOptions} options
 */
module.exports = function (servePath, options) {
  const router = express.Router();

  NODE_MODULES_PATHS.forEach((p) => {
    const resolvedServePath = path.resolve(p, servePath);
    router.use(express.static(resolvedServePath, options));
  });

  return router;
};
