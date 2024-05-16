// @ts-check
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const router = Router();

router.get(
  '/:news_item_id(\\d+)',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryZeroOrOneRowAsync(sql.select_news_item_for_read, {
      news_item_id: req.params.news_item_id,
      user_id: res.locals.authn_user.user_id,
      course_instance_id: res.locals.course_instance ? res.locals.course_instance.id : null,
      course_id: res.locals.course ? res.locals.course.id : null,
    });
    if (result.rowCount === 0) {
      throw new Error(`invalid news_item_id: ${req.params.news_item_id}`);
    }

    res.locals.news_item = result.rows[0];

    const indexFilename = path.join(
      import.meta.dirname,
      '..',
      '..',
      'news_items',
      res.locals.news_item.directory,
      'index.html',
    );
    res.locals.news_item_html = await fs.readFile(indexFilename, 'utf8');

    res.render(import.meta.filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

router.get(
  '/:news_item_id(\\d+)/*',
  asyncHandler(async (req, res) => {
    const filename = req.params[0];
    const result = await sqldb.queryZeroOrOneRowAsync(sql.select_news_item, {
      news_item_id: req.params.news_item_id,
    });
    if (result.rowCount === 0) {
      throw new Error(`invalid news_item_id: ${req.params.news_item_id}`);
    }

    res.locals.news_item = result.rows[0];
    const news_item_dir = path.join(
      import.meta.dirname,
      '..',
      '..',
      'news_items',
      res.locals.news_item.directory,
    );

    res.sendFile(filename, { root: news_item_dir });
  }),
);

export default router;
