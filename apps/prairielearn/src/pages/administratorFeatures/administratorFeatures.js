// @ts-check
const asyncHandler = require('express-async-handler');
const express = require('express');
const { z } = require('zod');
const { loadSqlEquiv, queryValidatedRows } = require('@prairielearn/postgres');

const { features } = require('../../lib/features');
const { AdministratorFeatures, AdministratorFeature } = require('./administratorFeatures.html');

const router = express.Router();
const sql = loadSqlEquiv(__filename);

const FeatureGrantRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['default', 'manual', 'subscription']),
  institution_id: z.string().nullable(),
  institution_short_name: z.string().nullable(),
  institution_long_name: z.string().nullable(),
  course_id: z.string().nullable(),
  course_title: z.string().nullable(),
  course_short_name: z.string().nullable(),
  course_instance_id: z.string().nullable(),
  course_instance_short_name: z.string().nullable(),
  course_instance_long_name: z.string().nullable(),
  user_id: z.string().nullable(),
  user_uid: z.string().nullable(),
  user_name: z.string().nullable(),
});

/** @typedef {z.infer<FeatureGrantRowSchema>} FeatureGrantRow */

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.send(
      AdministratorFeatures({
        features: features.allFeatures().sort(),
        resLocals: res.locals,
      })
    );
  })
);

router.get(
  '/:feature',
  asyncHandler(async (req, res) => {
    const feature = req.params.feature;

    const featureGrants = await queryValidatedRows(
      sql.select_feature_grants,
      { name: feature },
      FeatureGrantRowSchema
    );

    res.send(
      AdministratorFeature({
        feature: req.params.feature,
        featureGrants,
        resLocals: res.locals,
      })
    );
  })
);

module.exports = router;
