import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import * as error from '@prairielearn/error';
import lti13InstancePages from '../pages/lti13Instance/lti13Instance.js';
import lti13Auth from '../auth/lti13/lti13Auth.js';
import lti13CourseNavigation from '../pages/lti13CourseNavigation/lti13CourseNavigation.js';
import { features } from '../../lib/features/index.js';
import authnMiddleware from '../../middlewares/authn.js';
import csrfToken from '../../middlewares/csrfToken.js';
import { selectLti13Instance } from '../models/lti13Instance.js';

const router = Router({ mergeParams: true });

router.use(
  '/:lti13_instance_id/',
  asyncHandler(async (req, res, next) => {
    const lti13_instance = await selectLti13Instance(req.params.lti13_instance_id);
    if (
      await features.enabled('lti13', {
        institution_id: lti13_instance.institution_id,
      })
    ) {
      next();
    } else {
      throw new error.HttpStatusError(403, 'Access denied. LTI 1.3 feature not enabled');
    }
  }),
);

router.use('/:lti13_instance_id/auth', lti13Auth);
router.use(
  '/:lti13_instance_id/course_navigation',
  authnMiddleware, // authentication, set res.locals.authn_user
  csrfToken,
  lti13CourseNavigation,
);

// lti13InstancePages is a catch all for some small pages so put it last
router.use('/:lti13_instance_id/', lti13InstancePages);

export default router;
