import asyncHandler = require('express-async-handler');
import * as express from 'express';
import * as error from '@prairielearn/error';

import { config } from '../../lib/config';
import {
  createCourseFromRequest,
  selectAllCourseRequests,
  updateCourseRequest,
} from '../../lib/course-request';
import { selectAllInstitutions } from '../../models/institution';
import { AdministratorCourseRequests } from './administratorCourseRequests.html';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await selectAllCourseRequests();
    const institutions = await selectAllInstitutions();
    res.send(
      AdministratorCourseRequests({
        rows,
        institutions,
        coursesRoot: config.coursesRoot,
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'approve_deny_course_request') {
      await updateCourseRequest(req, res);
    } else if (req.body.__action === 'create_course_from_request') {
      await createCourseFromRequest(req, res);
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
