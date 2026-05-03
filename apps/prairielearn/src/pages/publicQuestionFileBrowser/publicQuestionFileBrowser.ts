import { type Request, type Response, Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { createFileBrowser } from '../../components/FileBrowser.js';
import { UserSchema } from '../../lib/db-types.js';
import { idsEqual } from '../../lib/id.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { encodePath } from '../../lib/uri-util.js';
import { selectQuestionById } from '../../models/question.js';

const router = Router({ mergeParams: true });

async function setLocals(req: Request, res: Response) {
  res.locals.user = UserSchema.parse(res.locals.authn_user);
  res.locals.authz_data = { user: res.locals.user };
  res.locals.question = await selectQuestionById(req.params.question_id);

  if (
    res.locals.question.deleted_at != null ||
    !res.locals.question.share_source_publicly ||
    !idsEqual(res.locals.question.course_id, res.locals.course.id)
  ) {
    throw new error.HttpStatusError(404, 'Not Found');
  }
}

router.get(
  '/*',
  asyncHandler(async (req, res) => {
    await setLocals(req, res);

    const paths = getPaths(req.params[0], res.locals);

    try {
      const fileBrowser = await createFileBrowser({
        paths,
        resLocals: res.locals,
        isReadOnly: true,
      });
      res.send(fileBrowser);
    } catch (err: any) {
      if (err.code === 'ENOENT' && paths.branch.length > 1) {
        res.redirect(`${req.baseUrl}/${encodePath(paths.branch.slice(-2)[0].path)}`);
        return;
      }

      throw err;
    }
  }),
);

export default router;
