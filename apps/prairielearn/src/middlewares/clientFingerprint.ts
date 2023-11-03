import asyncHandler from 'express-async-handler';
import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(__filename);

export default asyncHandler(async (req, res, next) => {
  const params = {
    ip_address: req.ip,
    user_id: res.locals.user.user_id,
    session_id: req.session.id,
    user_agent: req.headers['user-agent'],
    accept_language: req.headers['accept-language'],
    accept: req.headers['accept'],
  };
  // Need a better way to find or insert a fingerprint. Currently doing this through two calls but would probably be better to do it in one.
  // First call, check if fingerprint exists in the database
  let client_fingerprint_id: number | null =
    parseInt(
      (await sqldb.queryZeroOrOneRowAsync(sql.select_client_fingerprint, params)).rows[0]?.id,
    ) ?? null;
  //if the fingerprint doesn't exist, create a new fingerprint
  if (!client_fingerprint_id) {
    client_fingerprint_id = (await sqldb.queryOneRowAsync(sql.insert_client_fingerprint, params))
      .rows[0].id;
  }

  // Check if the client fingerprint matches the last fingerprint on the assessment id. If not, update the assessment instance with the new fingerprint and increment the fingerprint count.
  if (
    res.locals.assessment_instance &&
    res.locals.assessment_instance?.last_client_fingerprint_id !== client_fingerprint_id
  ) {
    await sqldb.queryAsync(sql.update_assessment_instance_fingerprint, {
      client_fingerprint_id,
      assessment_instance_id: res.locals.assessment_instance?.id,
      client_fingerprint_id_change_count:
        res.locals.assessment_instance.client_fingerprint_id_change_count + 1,
    });
  }

  res.locals.client_fingerprint_id = client_fingerprint_id;
  next();
});
