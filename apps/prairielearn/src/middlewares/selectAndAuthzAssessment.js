// @ts-check
const asyncHandler = require('express-async-handler');
import * as _ from 'lodash';

import * as sqldb from '@prairielearn/postgres';
import * as error from '@prairielearn/error';

import { features } from '../lib/features';

const sql = sqldb.loadSqlEquiv(__filename);

module.exports = asyncHandler(async (req, res, next) => {
  res.locals.assessment_access_overrides_enabled = await features.enabledFromLocals(
    'assessment-access-overrides',
    res.locals,
  );

  const result = await sqldb.queryZeroOrOneRowAsync(sql.select_and_auth, {
    assessment_id: req.params.assessment_id,
    course_instance_id: res.locals.course_instance.id,
    authz_data: res.locals.authz_data,
    req_date: res.locals.req_date,
  });
  if (result.rowCount === 0) throw error.make(403, 'Access denied');
  _.assign(res.locals, result.rows[0]);
  next();
});
