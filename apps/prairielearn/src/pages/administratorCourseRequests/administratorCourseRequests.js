// @ts-check
const asyncHandler = require('express-async-handler');
import * as express from 'express';
import * as error from '@prairielearn/error';

import { config } from '../../lib/config';
import {
  createCourseFromRequest,
  selectAllCourseRequests,
  updateCourseRequest,
} from '../../lib/course-request';
import { selectAllInstitutions } from '../../models/institution';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.locals.coursesRoot = config.coursesRoot;
    res.locals.course_requests = await selectAllCourseRequests();
    res.locals.institutions = await selectAllInstitutions();
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.is_administrator) throw error.make(403, 'Insufficient permissions');

    if (req.body.__action === 'approve_deny_course_request') {
      await updateCourseRequest(req, res);
    } else if (req.body.__action === 'create_course_from_request') {
      await createCourseFromRequest(req, res);
    } else {
      throw error.make(400, 'unknown __action');
    }
  }),
);

export default router;
