import * as crypto from 'node:crypto';

import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';
import { IdSchema } from '@prairielearn/zod';

import { UserSchema } from '../lib/db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export default asyncHandler(async (req, res, next) => {
  const token = req.header('Private-Token');

  if (token === undefined) {
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

  const authnData = await sqldb.queryOptionalRow(
    sql.select_user_from_token_hash,
    {
      token_hash: crypto.createHash('sha256').update(token, 'utf8').digest('hex'),
    },
    z.object({
      user: UserSchema,
      is_administrator: z.boolean(),
      token_id: IdSchema,
    }),
  );
  if (authnData == null) {
    // Invalid token received
    res.status(401).send({
      message: 'The provided authentication token was invalid',
    });
    return;
  }

  res.locals.authn_user = authnData.user;
  res.locals.is_administrator = authnData.is_administrator;

  // Let's note that this token was used, but don't wait for this
  // to continue handling the request
  next();

  sqldb
    .execute(sql.update_token_last_used, {
      token_id: authnData.token_id,
    })
    .catch((err) => {
      Sentry.captureException(err);
      logger.error('Error in sql.update_token_last_used', err);
    });
});
