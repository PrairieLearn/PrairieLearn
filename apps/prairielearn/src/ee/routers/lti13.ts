import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { features } from '../../lib/features/index.js';
import authnMiddleware from '../../middlewares/authn.js';
import csrfToken from '../../middlewares/csrfToken.js';
import lti13Auth from '../auth/lti13/lti13Auth.js';
import { getInstitutionAuthenticationProviders } from '../lib/institution.js';
import { selectLti13Instance } from '../models/lti13Instance.js';
import lti13Config from '../pages/lti13Config/lti13Config.js';
import lti13CourseNavigation from '../pages/lti13CourseNavigation/lti13CourseNavigation.js';
import lti13Jwks from '../pages/lti13Jwks/lti13Jwks.js';

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

router.use('/:lti13_instance_id/config', lti13Config);
router.use('/:lti13_instance_id/jwks', lti13Jwks);

// Everything past this middleware requires LTI 1.3 SSO to be configured
router.use(
  '/:lti13_instance_id/',
  asyncHandler(async (req, res, next) => {
    const lti13_instance = await selectLti13Instance(req.params.lti13_instance_id);
    const instAuthProviders = await getInstitutionAuthenticationProviders(
      lti13_instance.institution_id,
    );

    if (!instAuthProviders.some((a) => a.name === 'LTI 1.3')) {
      throw new Error('Institution does not support LTI 1.3 SSO authentication');
    }
    next();
  }),
);

router.use('/:lti13_instance_id/auth', lti13Auth);
router.use(
  '/:lti13_instance_id/course_navigation',
  authnMiddleware, // authentication, set res.locals.authn_user
  csrfToken,
  lti13CourseNavigation,
);

export default router;
