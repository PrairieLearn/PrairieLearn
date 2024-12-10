import * as express from 'express';
import asyncHandler from 'express-async-handler';

import { selectTopicsByCourseId } from '../../models/topics.js';

import { InstructorCourseAdminTopics } from './instructorCourseAdminTopics.html.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const topics = await selectTopicsByCourseId(res.locals.course.id);

    res.send(InstructorCourseAdminTopics({ resLocals: res.locals, topics }));
  }),
);

export default router;
