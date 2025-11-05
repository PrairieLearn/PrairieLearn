import * as fs from 'node:fs/promises';
import * as path from 'path';

import _ from 'lodash';

import { logger } from '@prairielearn/logger';
import * as namedLocks from '@prairielearn/named-locks';
import * as sqldb from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';

import { NewsItemJsonSchema, type NewsItemJson } from '../schemas/index.js';

const DIRECTORY_REGEX = /^([0-9]+)_.+$/;

async function loadNewsItems() {
  const news_items: (NewsItemJson & { directory: string; index: string })[] = [];
  const dirs = await fs.readdir(import.meta.dirname);
  for (const dir of dirs) {
    // Skip anything that doesn't match the expected directory name format.
    const match = DIRECTORY_REGEX.exec(dir);
    if (!match) continue;

    const rawInfo = await fs.readFile(path.join(import.meta.dirname, dir, 'info.json'), {
      encoding: 'utf8',
    });
    const info = NewsItemJsonSchema.parse(JSON.parse(rawInfo));

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

interface InitOptions {
  notifyIfPreviouslyEmpty: boolean;
  errorIfLockNotAcquired?: boolean;
}

export async function init({
  notifyIfPreviouslyEmpty,
  errorIfLockNotAcquired = false,
}: InitOptions) {
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
 */
export async function initInBackground(options: InitOptions) {
  init(options).catch((err) => {
    logger.error('Error initializing news items', err);
    Sentry.captureException(err);
  });
}
