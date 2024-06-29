import * as crypto from 'crypto';

import express from 'express';
import asyncHandler from 'express-async-handler';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { getPurchasesForUser } from '../../ee/lib/billing/purchases.js';
import { InstitutionSchema, EnumModeSchema, UserSchema } from '../../lib/db-types.js';
import { isEnterprise } from '../../lib/license.js';

import { AccessTokenSchema, UserSettings } from './userSettings.html.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

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

    const { mode } = await sqldb.callRow(
      'ip_to_mode',
      [req.ip, res.locals.req_date, authn_user.user_id],
      z.object({ mode: EnumModeSchema }),
    );

    res.send(
      UserSettings({
        authn_user,
        authn_institution,
        authn_provider_name: res.locals.authn_provider_name,
        accessTokens,
        newAccessTokens,
        purchases,
        isExamMode: mode !== 'Public',
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'token_generate') {
      const { mode } = await sqldb.callRow(
        'ip_to_mode',
        [req.ip, res.locals.req_date, res.locals.authn_user.user_id],
        z.object({ mode: EnumModeSchema }),
      );
      if (mode !== 'Public') {
        throw new HttpStatusError(403, 'Cannot generate access tokens in exam mode.');
      }

      const name = req.body.token_name;
      const token = uuidv4();
      const token_hash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');

      await sqldb.queryAsync(sql.insert_access_token, {
        user_id: res.locals.authn_user.user_id,
        name,
        // The token will only be persisted until the next page render.
        // After that, we'll remove it from the database.
        token,
        token_hash,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'token_delete') {
      await sqldb.queryAsync(sql.delete_access_token, {
        token_id: req.body.token_id,
        user_id: res.locals.authn_user.user_id,
      });
      res.redirect(req.originalUrl);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
