// @ts-check
import * as crypto from 'node:crypto';

import asyncHandler from 'express-async-handler';

import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export default asyncHandler(async (req, res, next) => {
  let token;
  if (req.query.private_token !== undefined) {
    // Token was provided in a query param
    token = req.query.private_token;
  } else if (req.header('Private-Token') !== undefined) {
    // Token was provided in a header
    token = req.header('Private-Token');
  } else {
    // No authentication token present
    res.status(401).send({
      message: 'An authentication token must be provided',
    });
    return;
  }

  if (typeof token !== 'string') {
    res.status(401).send({
      message: 'The provided authentication token was invalid',
    });
    return;
  }

  const result = await sqldb.queryZeroOrOneRowAsync(sql.select_user_from_token_hash, {
    token_hash: crypto.createHash('sha256').update(token, 'utf8').digest('hex'),
  });
  if (result.rows.length === 0) {
    // Invalid token received
    res.status(401).send({
      message: 'The provided authentication token was invalid',
    });
    return;
  }

  res.locals.authn_user = result.rows[0].user;
  res.locals.is_administrator = result.rows[0].is_administrator;

  // Let's note that this token was used, but don't wait for this
  // to continue handling the request
  next();

  sqldb
    .queryAsync(sql.update_token_last_used, {
      token_id: result.rows[0].token_id,
    })
    .catch((err) => {
      Sentry.captureException(err);
      logger.error('Error in sql.update_token_last_used', err);
    });
});
