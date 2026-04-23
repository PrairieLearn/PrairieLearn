import { Router } from 'express';

import { requireRespondusLockdownBrowser } from '../../ee/lib/respondus-lockdown-browser-library.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';

const router = Router();

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    /**
     * This endpoint is used to test the Respondus LockDown Browser library in staging/production.
     *
     * It should be removed once the functionality is proven out.
     */
    const library = requireRespondusLockdownBrowser();
    const url = library.getExamUrl({
      baseUrl: 'https://example.com',
      securityLevel: 'low',
    });
    res.type('text/plain').send(url);
  }),
);

export default router;
