// @ts-check
const asyncHandler = require('express-async-handler');
import * as express from 'express';
import * as error from '@prairielearn/error';

import { config } from '../../lib/config';
import { createCourseFromRequest, getCourseRequests, updateCourseRequest } from '../../models/course-request';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.locals.coursesRoot = config.coursesRoot;
    const {institutions, course_requests} = await getCourseRequests(true);
    res.locals.institutions = institutions
    res.locals.course_requests = course_requests
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.is_administrator) throw error.make(403, 'Insufficient permissions');

    if (req.body.__action === 'approve_deny_course_request') {
      updateCourseRequest(req, res);
    } else if (req.body.__action === 'create_course_from_request') {
      createCourseFromRequest(req, res);
    } else {
      throw error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      });
    }
  }),
);

export default router;
