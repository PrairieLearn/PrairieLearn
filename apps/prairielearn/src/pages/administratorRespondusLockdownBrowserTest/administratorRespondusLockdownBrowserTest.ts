import { Router } from 'express';

import { typedAsyncHandler } from '../../lib/res-locals.js';
import { requireLibrary } from '../../lib/respondus-lockdown-browser-library.js';

const router = Router();

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    /**
     * This endpoint is used to test the Respondus LockDown Browser library in staging/production.
     *
     * It should be removed once the functionality is proven out.
     */
    const library = requireLibrary();
    const url = library.getExamUrl({
      baseUrl: 'https://example.com',
      securityLevel: 'low',
    });
    res.type('text/plain').send(url);
  }),
);

export default router;
