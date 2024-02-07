//@ts-check
const ERR = require('async-stacktrace');
const path = require('path');
const fs = require('fs');
const express = require('express');
const router = express.Router();

const sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSqlEquiv(__filename);

router.get('/:news_item_id', function (req, res, next) {
  const params = {
    news_item_id: req.params.news_item_id,
    user_id: res.locals.authn_user.user_id,
    course_instance_id: res.locals.course_instance ? res.locals.course_instance.id : null,
    course_id: res.locals.course ? res.locals.course.id : null,
  };
  sqldb.queryZeroOrOneRow(sql.select_news_item_for_read, params, function (err, result) {
    if (ERR(err, next)) return;
    if (result.rowCount === 0) {
      return next(new Error(`invalid news_item_id: ${req.params.news_item_id}`));
    }

    res.locals.news_item = result.rows[0];

    const indexFilename = path.join(
      __dirname,
      '..',
      '..',
      'news_items',
      res.locals.news_item.directory,
      'index.html',
    );
    fs.readFile(indexFilename, (err, news_item_html) => {
      if (ERR(err, next)) return;

      res.locals.news_item_html = news_item_html;

      res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
  });
});

router.get('/:news_item_id/*', function (req, res, next) {
  const filename = req.params[0];
  const params = {
    news_item_id: req.params.news_item_id,
  };
  sqldb.queryZeroOrOneRow(sql.select_news_item, params, function (err, result) {
    if (ERR(err, next)) return;
    if (result.rowCount === 0) {
      return next(new Error(`invalid news_item_id: ${req.params.news_item_id}`));
    }

    res.locals.news_item = result.rows[0];
    const news_item_dir = path.join(
      __dirname,
      '..',
      '..',
      'news_items',
      res.locals.news_item.directory,
    );

    res.sendFile(filename, { root: news_item_dir });
  });
});

module.exports = router;
