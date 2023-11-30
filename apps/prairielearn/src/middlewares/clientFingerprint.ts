import asyncHandler = require('express-async-handler');
import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '../lib/db-types';
import { idsEqual } from '../lib/id';

const sql = sqldb.loadSqlEquiv(__filename);

export default asyncHandler(async (req, res, next) => {
  if (!res.locals.assessment_instance) {
    throw new Error('Assessment Instance is not pressent');
  }

  const user_session_id = await sqldb.queryOptionalRow(
    sql.select_user_session_id,
    { session_id: req.session.id },
    IdSchema,
  );

  const params = {
    ip_address: req.ip,
    // We are passing the authn user id here. However, we are checking in the SQL query 'update_assessment_instance_fingerprint' that the authn user is the owner of the assessment. This will keep us from inadvertently recording a fingerprint change for an instructor viewing the assessment instance.
    user_id: res.locals.authn_user.user_id,
    user_session_id: user_session_id,
    user_agent: req.headers['user-agent'],
    accept_language: req.headers['accept-language'],
  };
  let client_fingerprint_id = await sqldb.queryOptionalRow(
    sql.select_client_fingerprint,
    params,
    IdSchema,
  );

  if (!client_fingerprint_id) {
    client_fingerprint_id = await sqldb.queryRow(sql.insert_client_fingerprint, params, IdSchema);
  }
  if (
    !idsEqual(res.locals.assessment_instance?.last_client_fingerprint_id, client_fingerprint_id)
  ) {
    await sqldb.queryAsync(sql.update_assessment_instance_fingerprint, {
      client_fingerprint_id,
      assessment_instance_id: res.locals.assessment_instance?.id,
      authn_user_id: res.locals.authn_user.user_id,
    });
  }

  res.locals.client_fingerprint_id = client_fingerprint_id;
  next();
});
