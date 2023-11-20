import { Router } from 'express';
import lti13InstancePages from '../pages/lti13Instance/lti13Instance';
import lti13Auth from '../auth/lti13/lti13Auth';
import lti13CourseNavigation from '../pages/lti13CourseNavigation/lti13CourseNavigation';
import asyncHandler = require('express-async-handler');
import { features } from '../../lib/features';
import middlewareAuthn = require('../../middlewares/authn');
import csrfToken = require('../../middlewares/csrfToken');

const router = Router({ mergeParams: true });

router.use(
  '/:lti13_instance_id/',
  asyncHandler(async (req, res, next) => {
    if (
      await features.enabled('lti13', {
        institution_id: req.params.institution_id,
      })
    ) {
      next();
    } else {
      next(new Error('Access denied. LTI 1.3 feature not enabled'));
    }
  }),
);

router.use('/:lti13_instance_id/auth', lti13Auth);
router.use(
  '/:lti13_instance_id/course_navigation',
  middlewareAuthn, // authentication, set res.locals.authn_user
  csrfToken,
  lti13CourseNavigation,
);

// lti13InstancePages is a catch all for some small pages so put it last
router.use('/:lti13_instance_id/', lti13InstancePages);

export default router;
