import * as crypto from 'crypto';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';

import { getPurchasesForUser } from '../../ee/lib/billing/purchases.js';
import { InstitutionSchema, UserSchema } from '../../lib/db-types.js';
import { ipToMode } from '../../lib/exam-mode.js';
import { features } from '../../lib/features/index.js';
import { isEnterprise } from '../../lib/license.js';

import { AccessTokenSchema, UserSettings } from './userSettings.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const authn_user = UserSchema.parse(res.locals.authn_user);
    const authn_institution = InstitutionSchema.parse(res.locals.authn_institution);

    const accessTokens = await sqldb.queryRows(
      sql.select_access_tokens,
      { user_id: authn_user.user_id },
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
      await sqldb.execute(sql.clear_tokens_for_user, {
        user_id: authn_user.user_id,
      });
    }

    const purchases = isEnterprise() ? await getPurchasesForUser(authn_user.user_id) : [];

    const { mode } = await ipToMode({
      ip: req.ip,
      date: res.locals.req_date,
      authn_user_id: authn_user.user_id,
    });

    const showEnhancedNavigationToggle = await features.enabled('legacy-navigation-user-toggle', {
      user_id: authn_user.user_id,
    });
    const usesLegacyNavigation = await features.enabled('legacy-navigation', {
      user_id: authn_user.user_id,
    });

    res.send(
      UserSettings({
        authn_user,
        authn_institution,
        authn_provider_name: res.locals.authn_provider_name,
        accessTokens,
        newAccessTokens,
        purchases,
        isExamMode: mode !== 'Public',
        showEnhancedNavigationToggle,
        enhancedNavigationEnabled: !usesLegacyNavigation,
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'update_features') {
      const context = { user_id: res.locals.authn_user.user_id };

      if (await features.enabled('legacy-navigation-user-toggle', context)) {
        // Checkbox indicates enhanced navigation ON when checked; legacy is inverse
        if (req.body.enhanced_navigation) {
          await features.disable('legacy-navigation', context);
        } else {
          await features.enable('legacy-navigation', context);
        }
      }

      flash('success', 'Features updated successfully.');
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'token_generate') {
      const { mode } = await ipToMode({
        ip: req.ip,
        date: res.locals.req_date,
        authn_user_id: res.locals.authn_user.user_id,
      });
      if (mode !== 'Public') {
        throw new HttpStatusError(403, 'Cannot generate access tokens in exam mode.');
      }

  const name = req.body.token_name;
  const token = crypto.randomUUID();
      const token_hash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');

      await sqldb.execute(sql.insert_access_token, {
        user_id: res.locals.authn_user.user_id,
        name,
        // The token will only be persisted until the next page render.
        // After that, we'll remove it from the database.
        token,
        token_hash,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'token_delete') {
      await sqldb.execute(sql.delete_access_token, {
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
