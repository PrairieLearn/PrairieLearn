// @ts-check
const asyncHandler = require('express-async-handler');
const express = require('express');
const util = require('util');

const error = require('@prairielearn/error');
const chunks = require('../../lib/chunks');
const cache = require('../../lib/cache');
const { AdministratorSettings } = require('./administratorSettings.html');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.send(AdministratorSettings({ resLocals: res.locals }));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.is_administrator) throw new Error('Insufficient permissions');

    if (req.body.__action === 'invalidate_question_cache') {
      await util.promisify(cache.reset)();
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'generate_chunks') {
      const course_ids_string = req.body.course_ids || '';
      const authn_user_id = res.locals.authn_user.user_id;

      let course_ids;
      try {
        course_ids = course_ids_string.split(',').map((x) => parseInt(x));
      } catch (err) {
        throw error.make(
          400,
          `could not split course_ids into an array of integers: ${course_ids_string}`
        );
      }
      const jobSequenceId = await chunks.generateAllChunksForCourseList(course_ids, authn_user_id);
      res.redirect(res.locals.urlPrefix + '/administrator/jobSequence/' + jobSequenceId);
    } else {
      throw error.make(400, 'unknown __action', { locals: res.locals, body: req.body });
    }
  })
);

module.exports = router;
