//@ts-check
import * as express from 'express';
import * as error from '@prairielearn/error';

import { decodePath } from '../../lib/uri-util';

const router = express.Router();

router.get('/*', function (req, res, next) {
  if (!res.locals.authz_data.has_course_permission_view) {
    return next(error.make(403, 'Access denied (must be course viewer)'));
  }
  if (req.query.type) res.type(req.query.type.toString());
  if (req.query.attachment) res.attachment(req.query.attachment.toString());
  res.sendFile(decodePath(req.params[0]), { root: res.locals.course.path });
});

export default router;
