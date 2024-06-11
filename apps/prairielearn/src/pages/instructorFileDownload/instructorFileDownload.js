// @ts-check
import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

const router = express.Router();

router.get(
  '/*',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be course viewer)');
    }
    if (req.query.type) res.type(req.query.type.toString());
    if (req.query.attachment) res.attachment(req.query.attachment.toString());
    res.sendFile(req.params[0], { root: res.locals.course.path });
  }),
);

export default router;
