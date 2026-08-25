import { type Request, type Response, Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { createFileBrowser } from '../../components/FileBrowser.js';
import { UserSchema } from '../../lib/db-types.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { encodePath } from '../../lib/uri-util.js';
import { selectOptionalAssessmentById } from '../../models/assessment.js';

const router = Router({ mergeParams: true });

async function setLocals(req: Request, res: Response) {
  res.locals.user = UserSchema.parse(res.locals.authn_user);
  res.locals.authz_data = { user: res.locals.user };
  const assessment = await selectOptionalAssessmentById(req.params.assessment_id);

  if (
    !assessment?.share_source_publicly ||
    assessment.course_instance_id !== res.locals.course_instance.id
  ) {
    throw new error.HttpStatusError(404, 'Not Found');
  }

  res.locals.assessment = assessment;
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
