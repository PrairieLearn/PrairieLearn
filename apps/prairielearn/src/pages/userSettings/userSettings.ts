import express = require('express');
import asyncHandler = require('express-async-handler');
import crypto = require('crypto');
import { v4 as uuidv4 } from 'uuid';
import error = require('@prairielearn/error');
import sqldb = require('@prairielearn/postgres');

import { AccessTokenSchema, UserSettings } from './userSettings.html';
import { InstitutionSchema, UserSchema } from '../../lib/db-types';
import { isEnterprise } from '../../lib/license';
import { getPurchasesForUser } from '../../ee/lib/billing/purchases';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const authn_user = UserSchema.parse(res.locals.authn_user);
    const authn_institution = InstitutionSchema.parse(res.locals.authn_institution);

    const accessTokens = await sqldb.queryRows(
      sql.select_access_tokens,
      {
        user_id: authn_user.user_id,
      },
      AccessTokenSchema,
    );

    // If the raw tokens are present for any of these hashes, include them
    // in this response and then delete them from memory
    const newAccessTokens: string[] = [];
    accessTokens.forEach((accessToken) => {
      if (accessToken.token) {
        newAccessTokens.push(accessToken.token);
      }
    });

    // Now that we've rendered these tokens, remove any tokens from the DB
    if (newAccessTokens.length > 0) {
      await sqldb.queryAsync(sql.clear_tokens_for_user, {
        user_id: authn_user.user_id,
      });
    }

    const purchases = isEnterprise() ? await getPurchasesForUser(authn_user.user_id) : [];

    res.send(
      UserSettings({
        authn_user,
        authn_institution,
        authn_provider_name: res.locals.authn_provider_name,
        accessTokens,
        newAccessTokens,
        purchases,
        resLocals: res.locals,
      }),
    );
  }),
);

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

export default router;
