import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { createFileBrowser } from '../../components/FileBrowser.html.js';
import { UserSchema } from '../../lib/db-types.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { encodePath } from '../../lib/uri-util.js';
import { selectCourseById } from '../../models/course.js';
import { selectQuestionById } from '../../models/question.js';

const router = Router({ mergeParams: true });

async function setLocals(req, res) {
  res.locals.user = UserSchema.parse(res.locals.authn_user);
  res.locals.authz_data = { user: res.locals.user };
  res.locals.course = await selectCourseById(req.params.course_id);
  res.locals.question = await selectQuestionById(req.params.question_id);

  if (
    !res.locals.question.share_source_publicly ||
    res.locals.course.id !== res.locals.question.course_id
  ) {
    throw new error.HttpStatusError(404, 'Not Found');
  }
}

router.get(
  '/*',
  asyncHandler(async (req, res) => {
    await setLocals(req, res);

    const paths = getPaths(req.params[0], res.locals);
    // The public browser does not implement editing functionality, so even if "getPaths"
    // determined that the user has the necessary permissions, the features are disabled here
    paths.hasEditPermission = false;

    try {
      res.send(createFileBrowser({ paths, resLocals: res.locals }));
    } catch (err) {
      if (err.code === 'ENOENT' && paths.branch.length > 1) {
        res.redirect(`${req.baseUrl}/${encodePath(paths.branch.slice(-2)[0].path)}`);
        return;
      }

      throw err;
    }
  }),
);

export default router;
