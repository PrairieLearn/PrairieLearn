import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { userIsInstructorInAnyCourse } from '../../models/course-permissions.js';

import { NewsItemRowSchema, NewsItems } from './newsItems.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userIsInstructor = await userIsInstructorInAnyCourse({
      user_id: res.locals.authn_user.user_id,
    });

    const newsItems = await queryRows(
      sql.select_news_items,
      {
        user_id: res.locals.authn_user.user_id,
        course_instance_id: res.locals.course_instance?.id,
        course_id: res.locals.course?.id,
        all_items: userIsInstructor,
      },
      NewsItemRowSchema,
    );
    res.send(NewsItems({ resLocals: res.locals, newsItems, userIsInstructor }));
  }),
);

export default router;
