import * as compiledAssets from '@prairielearn/compiled-assets';
import express from 'express';
import * as path from 'node:path';
import staticNodeModules from '../middlewares/staticNodeModules.js';
import elementFiles from '../pages/elementFiles/elementFiles.js';
import { config } from '../lib/config.js';
import { APP_ROOT_PATH } from '../lib/paths.js';

/**
 * Applies middleware to the given Express app to serve static assets.
 */
export function applyAssetMiddleware(assetsPrefix: string, app: express.Application) {
  const router = express.Router();

  // Compiled assets have a digest/hash embedded in their filenames, so they
  // don't require a separate cachebuster.
  router.use('/build', compiledAssets.handler());

  router.use(
    '/node_modules/:cachebuster',
    staticNodeModules('.', {
      // In dev mode, we assume that `node_modules` won't change while the server
      // is running, so we'll enable long-term caching.
      maxAge: '1y',
      immutable: true,
    }),
  );
  router.use(
    '/public/:cachebuster',
    express.static(path.join(APP_ROOT_PATH, 'public'), {
      // In dev mode, assets are likely to change while the server is running,
      // so we'll prevent them from being cached.
      maxAge: config.devMode ? 0 : '1y',
      immutable: !config.devMode,
    }),
  );
  router.use('/elements/:cachebuster', elementFiles);

  app.use(assetsPrefix, router);
}
