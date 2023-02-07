const ERR = require('async-stacktrace');
const _ = require('lodash');
const express = require('express');
const util = require('util');

const chunks = require('../../lib/chunks');
const error = require('../../prairielib/error');
const sqldb = require('@prairielearn/postgres');

const cache = require('../../lib/cache');

const router = express.Router();
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
  } else if (req.body.__action === 'generate_chunks') {
    const course_ids_string = req.body.course_ids || '';
    const authn_user_id = res.locals.authn_user.user_id;

    let course_ids;
    try {
      course_ids = course_ids_string.split(',').map((x) => parseInt(x));
    } catch (err) {
      return next(
        error.make(
          400,
          `could not split course_ids into an array of integers: ${course_ids_string}`
        )
      );
    }
    util.callbackify(chunks.generateAllChunksForCourseList)(
      course_ids,
      authn_user_id,
      (err, job_sequence_id) => {
        if (ERR(err, next)) return;
        res.redirect(res.locals.urlPrefix + '/administrator/jobSequence/' + job_sequence_id);
      }
    );
  } else {
    return next(error.make(400, 'unknown __action', { locals: res.locals, body: req.body }));
  }
});

module.exports = router;
