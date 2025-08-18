import { Router } from 'express';

import { HttpStatusError } from '@prairielearn/error';

const router = Router();

router.get('/*', (req, res) => {
  if (!res.locals.authz_data.has_course_permission_view) {
    throw new HttpStatusError(403, 'Access denied (must be course viewer)');
  }
  if (req.query.type) res.type(req.query.type.toString());
  if (req.query.attachment) res.attachment(req.query.attachment.toString());
  res.sendFile(req.params[0], { root: res.locals.course.path });
});

export default router;
