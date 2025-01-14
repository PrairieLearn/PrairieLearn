import * as express from 'express';
import asyncHandler from 'express-async-handler';

import { InstructorCourseAdminOnboarding } from './instructorCourseAdminOnboarding.html.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.send(InstructorCourseAdminOnboarding({ resLocals: res.locals }));
  }),
);

export default router;
