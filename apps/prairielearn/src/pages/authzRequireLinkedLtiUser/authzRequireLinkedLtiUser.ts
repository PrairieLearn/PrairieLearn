import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { AuthzRequireLinkedLtiUser } from './authzRequireLinkedLtiUser.html.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // The platformName and message should be set by the middleware before rendering.
    // We provide defaults here as a fallback.
    res.send(
      AuthzRequireLinkedLtiUser({
        platformName: res.locals.platformName || 'your learning management system',
        message: res.locals.message || 'Please access this course through your LMS first.',
        resLocals: res.locals,
      }),
    );
  }),
);

export default router;
