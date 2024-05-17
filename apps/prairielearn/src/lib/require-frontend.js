// @ts-check
/**
 * Require frontend modules.
 *
 * Note: Do not use to require backend modules, as they should be CommonJS
 * modules and not AMD modules.
 */
import { createRequire } from 'node:module';
import * as path from 'node:path';

import requirejs from 'requirejs';

import { logger } from '@prairielearn/logger';

import { APP_ROOT_PATH } from './paths.js';

requirejs.config({
  nodeRequire: createRequire(import.meta.url),
  baseUrl: path.join(APP_ROOT_PATH, 'public/localscripts/calculationQuestion'),
});

requirejs.onError = function (err) {
  var data = {
    errorMsg: err.toString(),
    stack: err.stack,
  };
  for (var e in err) {
    if (Object.prototype.hasOwnProperty.call(err, e)) {
      data[e] = String(err[e]);
    }
  }
  logger.error('requirejs load error', data);
};

export default requirejs;
