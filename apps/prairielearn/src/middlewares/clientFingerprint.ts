import asyncHandler from 'express-async-handler';
import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(__filename);

export default asyncHandler(async (req, res, next) => {
  const params = {
    ip_address: req.ip,
    user_id: res.locals.user.user_id,
    user_agent: req.headers['user-agent'],
    accept_language: req.headers['accept-language'],
    accept: req.headers['accept'],
  };
  // Need a better way to find or insert a fingerprint. Currently doing this through two calls but would probably be better to do it in one.
  const selectFingerprint = await sqldb.queryZeroOrOneRowAsync(
    sql.select_client_fingerprint,
    params,
  );
  res.locals.client_fingerprint_id = selectFingerprint.rows[0].id;
  if (selectFingerprint.rows.length === 0) {
    const client_fingerprint_id = (
      await sqldb.queryOneRowAsync(sql.insert_client_fingerprint, params)
    ).rows[0].id;
    res.locals.client_fingerprint_id = client_fingerprint_id;
  }
  next();
});
