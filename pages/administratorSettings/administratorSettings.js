const ERR = require('async-stacktrace');
const _ = require('lodash');
const express = require('express');
const router = express.Router();

const error = require('../../prairielib/error');
const sqldb = require('@prairielearn/postgres');

const cache = require('../../lib/cache');

const sql = sqldb.loadSqlEquiv(__filename);

router.get('/', (req, res, next) => {
  sqldb.queryOneRow(sql.select, [], (err, result) => {
    if (ERR(err, next)) return;

    _.assign(res.locals, result.rows[0]);
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  });
});

router.post('/', (req, res, next) => {
  if (!res.locals.is_administrator) return next(new Error('Insufficient permissions'));
  if (req.body.__action === 'invalidate_question_cache') {
    cache.reset((err) => {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else {
    return next(error.make(400, 'unknown __action', { locals: res.locals, body: req.body }));
  }
});

module.exports = router;
