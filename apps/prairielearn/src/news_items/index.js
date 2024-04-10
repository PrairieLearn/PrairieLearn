// @ts-check
import * as fs from 'node:fs/promises';
import * as path from 'path';
import * as _ from 'lodash';

import { logger } from '@prairielearn/logger';
import * as namedLocks from '@prairielearn/named-locks';
import * as sqldb from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';

import * as schemas from '../schemas';
import * as jsonLoad from '../lib/json-load';

const DIRECTORY_REGEX = /^([0-9]+)_.+$/;

async function loadNewsItems() {
  const news_items = [];
  const dirs = await fs.readdir(__dirname);
  for (const dir of dirs) {
    // Skip anything that doesn't match the expected directory name format.
    const match = DIRECTORY_REGEX.exec(dir);
    if (!match) continue;

    const info = await jsonLoad.readInfoJSON(
      path.join(__dirname, dir, 'info.json'),
      schemas.infoNewsItem,
    );

    news_items.push({
      ...info,
      directory: dir,
      index: match[1],
    });
  }

  // Check for duplicate UUIDs
  Object.entries(_.groupBy(news_items, 'uuid')).forEach(([uuid, items]) => {
    if (items.length > 1) {
      const directories = items.map((a) => a.directory).join(', ');
      throw new Error(`UUID ${uuid} is used in multiple news items: ${directories}`);
    }
  });

  // Check for duplicate indexes
  Object.entries(_.groupBy(news_items, 'index')).forEach(([index, items]) => {
    if (items.length > 1) {
      const directories = items.map((a) => a.directory).join(', ');
      throw new Error(`News item index ${index} is used in multiple news items: ${directories}`);
    }
  });

  return _.sortBy(news_items, 'directory');
}

/**
 * @typedef {Object} InitOptions
 * @property {boolean} notifyIfPreviouslyEmpty
 * @property {boolean} [errorIfLockNotAcquired]
 */

/**
 * @param {InitOptions} options
 */
export async function init({ notifyIfPreviouslyEmpty, errorIfLockNotAcquired = false }) {
  await namedLocks.doWithLock(
    'news_items',
    {
      autoRenew: true,
      onNotAcquired: () => {
        if (errorIfLockNotAcquired) {
          throw new Error('Could not acquire lock for news items initialization.');
        } else {
          logger.info('Another instance is already initializing news items. Skipping.');
        }
      },
    },
    async () => {
      const news_items = await loadNewsItems();
      await sqldb.callAsync('sync_news_items', [
        JSON.stringify(news_items),
        notifyIfPreviouslyEmpty,
      ]);
    },
  );
}

/**
 * Initializes news
 * @param {InitOptions} options
 */
export async function initInBackground(options) {
  init(options).catch((err) => {
    logger.error('Error initializing news items', err);
    Sentry.captureException(err);
  });
}
