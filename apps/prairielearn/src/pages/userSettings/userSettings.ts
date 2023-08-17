import express = require('express');
import asyncHandler = require('express-async-handler');
import crypto = require('crypto');
import { v4 as uuidv4 } from 'uuid';

import error = require('@prairielearn/error');
import sqldb = require('@prairielearn/postgres');

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'token_generate') {
      const name = req.body.token_name;
      const token = uuidv4();
      const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');

      await sqldb.callAsync('access_tokens_insert', [
        res.locals.authn_user.user_id,
        name,
        // The token will only be persisted until the next page render.
        // After that, we'll remove it from the database.
        token,
        tokenHash,
      ]);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'token_delete') {
      await sqldb.callAsync('access_tokens_delete', [
        req.body.token_id,
        res.locals.authn_user.user_id,
      ]);
      res.redirect(req.originalUrl);
    } else {
      throw error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      });
    }
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const params = {
      user_id: res.locals.authn_user.user_id,
    };
    const result = await sqldb.queryAsync(sql.select_access_tokens, params);

    // If the raw tokens are present for any of these hashes, include them
    // in this response and then delete them from memory
    const newAccessTokens: string[] = [];
    result.rows.forEach((row) => {
      if (row.token) {
        newAccessTokens.push(row.token);
      }
    });

    res.locals.accessTokens = result.rows;
    res.locals.newAccessTokens = newAccessTokens;

    // Now that we've rendered these tokens, remove any tokens from the DB
    await sqldb.queryAsync(sql.clear_tokens_for_user, params);

    res.render(__filename.replace(/\.[jt]s$/, '.ejs'), res.locals);
  }),
);

export default router;
