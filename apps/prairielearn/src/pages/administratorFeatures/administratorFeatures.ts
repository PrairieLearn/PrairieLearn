import asyncHandler = require('express-async-handler');
import { Router } from 'express';
import { loadSqlEquiv, queryValidatedRows } from '@prairielearn/postgres';

import { features } from '../../lib/features';
import {
  AdministratorFeatures,
  AdministratorFeature,
  FeatureGrantRowSchema,
} from './administratorFeatures.html';

const router = Router();
const sql = loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.send(
      AdministratorFeatures({
        features: features.allFeatures().sort(),
        resLocals: res.locals,
      }),
    );
  }),
);

router.get(
  '/:feature',
  asyncHandler(async (req, res) => {
    const feature = req.params.feature;

    const featureGrants = await queryValidatedRows(
      sql.select_feature_grants,
      { name: feature },
      FeatureGrantRowSchema,
    );

    res.send(
      AdministratorFeature({
        feature: req.params.feature,
        featureGrants,
        resLocals: res.locals,
      }),
    );
  }),
);

export default router;
