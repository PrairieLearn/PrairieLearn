import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { selectLti13InstanceIdentitiesForCourseInstance } from '../../models/lti13-user.js';

import { AuthzRequireLinkedLtiUser } from './linkedLtiUserRequired.html.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const lti13InstanceIdentities = await selectLti13InstanceIdentitiesForCourseInstance({
      course_instance: res.locals.course_instance,
      user: res.locals.authn_user,
    });

    console.log(lti13InstanceIdentities);

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
