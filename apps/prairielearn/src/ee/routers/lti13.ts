import { Router } from 'express';
import lti13InstanceRouter from '../pages/lti13Instance/lti13Instance';
import { Lti13InstanceSchema } from '../../lib/db-types';
import asyncHandler = require('express-async-handler');
import logRequest = require('../../middlewares/logRequest');
import { features } from '../../lib/features';

import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

const sql = loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

router.use(
  asyncHandler(async (req, res, next) => {
    // The navbar relies on this property.
    res.locals.urlPrefix = req.baseUrl;
    next();
  }),
);

router.use(logRequest);

//
// Middleware to load the lti13_instance and error check
//
router.use(
  '/:lti13_instance_id/',
  asyncHandler(async (req, res, next) => {
    const lti13Instance = await queryOptionalRow(
      sql.get_instances,
      {
        lti13_instance_id: req.params.lti13_instance_id,
      },
      Lti13InstanceSchema,
    );

    if (!lti13Instance) {
      throw new Error(`LTI 1.3 instance ID ${req.params.lti13_instance_id} is unavailable`);
    }

    res.locals.lti13_instance = lti13Instance;

    if (
      await features.enabled('lti13', {
        institution_id: res.locals.lti13_instance.institution_id,
      })
    ) {
      next();
    } else {
      next(new Error('Access denied. LTI 1.3 feature not enabled'));
    }
  }),
);

// router is a catch all for some small pages so put it last (or explicitly route them)
router.use('/:lti13_instance_id/', lti13InstanceRouter);

export default router;
