import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { createFileBrowser } from '../../components/FileBrowser.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { setPublicAssessmentLocals } from '../../lib/publicAssessment.js';
import { encodePath } from '../../lib/uri-util.js';

const router = Router({ mergeParams: true });

router.get(
  '/*',
  asyncHandler(async (req, res) => {
    await setPublicAssessmentLocals(req, res);

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
