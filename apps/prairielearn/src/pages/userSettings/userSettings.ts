import express = require('express');
import asyncHandler = require('express-async-handler');
import crypto = require('crypto');
import { v4 as uuidv4 } from 'uuid';
import error = require('@prairielearn/error');
import sqldb = require('@prairielearn/postgres');

import { AccessTokenSchema, PurchaseRowSchema, UserSettings } from './userSettings.html';
import { InstitutionSchema, UserSchema } from '../../lib/db-types';

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

    // Get all purchases for this user.
    const allPurchases = await sqldb.queryRows(
      sql.select_purchases,
      { user_id: authn_user.user_id },
      PurchaseRowSchema,
    );

    // Only show completed checkout Sessions. If the user clicks through to
    // Stripe but never actually fills in their payment info and completes
    // the checkout, we'll still have a session in the database but we don't
    // want to show it to the user.
    //
    // Note that the status we check for here is independent of if the payment
    // has actually come through; that's stored in the `payment_status` field.
    const completedPurchases = allPurchases.filter(
      (purchase) => purchase.stripe_checkout_session.data.status === 'complete',
    );

    res.send(
      UserSettings({
        authn_user,
        authn_institution,
        authn_provider_name: res.locals.authn_provider_name,
        accessTokens,
        newAccessTokens,
        purchases: completedPurchases,
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
