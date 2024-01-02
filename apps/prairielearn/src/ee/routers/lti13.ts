import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import * as error from '@prairielearn/error';
import lti13InstancePages from '../pages/lti13Instance/lti13Instance';
import { features } from '../../lib/features';

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
      throw error.make(403, 'Access denied. LTI 1.3 feature not enabled');
    }
  }),
);

router.use('/:lti13_instance_id/', lti13InstancePages);

export default router;
