import { Router } from 'express';

import { flash } from '@prairielearn/flash';

import { extractPageContext } from '../../lib/client/page-context.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import authzHasCoursePreview from '../../middlewares/authzHasCoursePreview.js';
import { courseFileUrl } from '../lib/course-agent/course-file-url.js';

const router = Router({ mergeParams: true });

// Course agent replies link to files by their course-relative path; open each in its page.
router.get(
  '/*',
  authzHasCoursePreview,
  typedAsyncHandler<'course'>(async (req, res) => {
    const { course } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });
    const { url, found } = await courseFileUrl(course, req.params[0]);
    if (!found) {
      flash(
        'warning',
        'That file is not in the course. It may be part of course agent changes that have not been approved.',
      );
    }
    res.redirect(url);
  }),
);

export default router;
