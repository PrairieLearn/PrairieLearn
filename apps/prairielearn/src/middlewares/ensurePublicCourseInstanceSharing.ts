import { HttpStatusError } from '@prairielearn/error';

import { typedAsyncHandler } from '../lib/res-locals.js';

export default typedAsyncHandler<'public-course-instance'>(async (_req, res, next) => {
  if (!res.locals.course_instance.share_source_publicly) {
    throw new HttpStatusError(404, 'Not Found');
  }
  next();
});
