import asyncHandler = require('express-async-handler');
import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '../lib/db-types';

const sql = sqldb.loadSqlEquiv(__filename);

export default asyncHandler(async (req, res, next) => {
  const userSessionId = await sqldb.queryOptionalRow(
    sql.select_session_id,
    { session_id: req.session.id, user_id: res.locals.user.user_id },
    IdSchema,
  );
  const params = {
    ip_address: req.ip,
    user_id: res.locals.authn_user.user_id,
    user_session_id: userSessionId,
    user_agent: req.headers['user-agent'],
    accept_language: req.headers['accept-language'],
    accept: req.headers['accept'],
  };

  let client_fingerprint_id = await sqldb.queryOptionalRow(
    sql.select_client_fingerprint,
    params,
    IdSchema,
  );

  if (!client_fingerprint_id) {
    client_fingerprint_id = await sqldb.queryRow(sql.insert_client_fingerprint, params, IdSchema);
    console.log('insert fingerprint', client_fingerprint_id);
  }
  if (
    res.locals.assessment_instance &&
    res.locals.assessment_instance?.last_client_fingerprint_id.toString() !== client_fingerprint_id
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
