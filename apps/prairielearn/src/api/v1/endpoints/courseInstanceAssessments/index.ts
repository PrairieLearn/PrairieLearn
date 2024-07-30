import * as path from 'node:path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSql(path.join(import.meta.dirname, '..', 'queries.sql'));
const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryOneRowAsync(sql.select_assessments, {
      course_instance_id: res.locals.course_instance.id,
      unsafe_assessment_id: null,
    });
    res.status(200).send(result.rows[0].item);
  }),
);

router.get(
  '/:unsafe_assessment_id(\\d+)',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryOneRowAsync(sql.select_assessments, {
      course_instance_id: res.locals.course_instance.id,
      unsafe_assessment_id: req.params.unsafe_assessment_id,
    });
    const data = result.rows[0].item;
    if (data.length === 0) {
      res.status(404).send({
        message: 'Not Found',
      });
    } else {
      res.status(200).send(data[0]);
    }
  }),
);

router.get(
  '/:unsafe_assessment_id(\\d+)/assessment_instances',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryOneRowAsync(sql.select_assessment_instances, {
      course_instance_id: res.locals.course_instance.id,
      unsafe_assessment_id: req.params.unsafe_assessment_id,
      unsafe_assessment_instance_id: null,
    });
    res.status(200).send(result.rows[0].item);
  }),
);

router.get(
  '/:unsafe_assessment_id(\\d+)/assessment_access_rules',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryOneRowAsync(sql.select_assessment_access_rules, {
      course_instance_id: res.locals.course_instance.id,
      unsafe_assessment_id: req.params.unsafe_assessment_id,
    });
    res.status(200).send(result.rows[0].item);
  }),
);

export default router;
