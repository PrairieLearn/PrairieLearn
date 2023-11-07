import asyncHandler from 'express-async-handler';
import * as sqldb from '@prairielearn/postgres';
import { z } from 'zod';

const sql = sqldb.loadSqlEquiv(__filename);

const ClientFingerprintSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  user_id: z.string(),
  ip_address: z.string(),
  user_agent: z.string(),
  accept_language: z.string(),
  accept: z.string(),
  created_at: z.date(),
});

export default asyncHandler(async (req, res, next) => {
  const sessionId = await sqldb.queryOptionalRow(
    sql.select_session_id,
    { session_id: req.session.id, user_id: res.locals.user.user_id },
    z.string(),
  );
  const params = {
    ip_address: req.ip,
    user_id: res.locals.authn_user.user_id,
    session_id: sessionId,
    user_agent: req.headers['user-agent'],
    accept_language: req.headers['accept-language'],
    accept: req.headers['accept'],
  };

  let client_fingerprint_id = (
    await sqldb.queryOptionalRow(sql.select_client_fingerprint, params, ClientFingerprintSchema)
  )?.id;

  if (!client_fingerprint_id) {
    client_fingerprint_id = (
      await sqldb.queryOptionalRow(sql.insert_client_fingerprint, params, z.any())
    ).id;
  }

  // Check if the client fingerprint matches the last fingerprint on the assessment id. If not, update the assessment instance with the new fingerprint and increment the fingerprint count.
  if (
    res.locals.assessment_instance &&
    res.locals.assessment_instance?.last_client_fingerprint_id !== client_fingerprint_id
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
