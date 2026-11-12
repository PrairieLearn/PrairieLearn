import { Router } from 'express';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { parseRequestQuery } from '@prairielearn/zod';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { getCourseQuestionAuthorshipReport } from '../../lib/question-authorship-report.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';

import { InstructorCourseAuthorship } from './instructorCourseAuthorship.html.js';

const router = Router();
const QuerySchema = z.object({
  author: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
});

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_preview'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'course' | 'course-instance'>(async (req, res) => {
    const query = parseRequestQuery(req, QuerySchema);
    const { course, urlPrefix } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });
    const report = await getCourseQuestionAuthorshipReport(course, {
      authorUid: query.author,
      page: query.page,
    });
    if (query.author !== undefined && !report.author) {
      throw new error.HttpStatusError(404, 'Author not found in this course');
    }
    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Question authorship',
        navContext: { type: 'instructor', page: 'course_admin', subPage: 'questions' },
        content: <InstructorCourseAuthorship report={report} urlPrefix={urlPrefix} />,
      }),
    );
  }),
);

export default router;
