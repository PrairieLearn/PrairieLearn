import * as crypto from 'crypto';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/react/server';

import { PageLayout } from '../../components/PageLayout.js';
import { UserSettingsPurchasesCard } from '../../ee/lib/billing/components/UserSettingsPurchasesCard.js';
import { getPurchasesForUser } from '../../ee/lib/billing/purchases.js';
import { UserAccessTokenSchema } from '../../lib/client/safe-db-types.js';
import { AccessTokenSchema, InstitutionSchema, UserSchema } from '../../lib/db-types.js';
import { ipToMode } from '../../lib/exam-mode.js';
import { isEnterprise } from '../../lib/license.js';

import { UserSettingsPage } from './components/UserSettingsPage.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const authn_user = UserSchema.parse(res.locals.authn_user);
    const authn_institution = InstitutionSchema.parse(res.locals.authn_institution);

    const accessTokens = await sqldb.queryRows(
      sql.select_access_tokens,
      { user_id: authn_user.id },
      AccessTokenSchema,
    );

    // If the raw tokens are present for any of these hashes, include them
    // in this response and then delete them from memory
    const newAccessTokens = accessTokens
      .map(({ token }) => token)
      .filter((token) => token !== null);

    // Now that we've rendered these tokens, remove any tokens from the DB
    if (newAccessTokens.length > 0) {
      await sqldb.execute(sql.clear_tokens_for_user, {
        user_id: authn_user.id,
      });
    }

    const purchases = isEnterprise() ? await getPurchasesForUser(authn_user.id) : [];

    const { mode } = await ipToMode({
      ip: req.ip,
      date: res.locals.req_date,
      authn_user_id: authn_user.id,
    });

    const isExamMode = mode !== 'Public';

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'User Settings',
        navContext: {
          page: 'user_settings',
          type: 'plain',
        },
        content: (
          <>
            <Hydrate>
              <UserSettingsPage
                user={{
                  uid: authn_user.uid,
                  name: authn_user.name,
                  uin: authn_user.uin,
                  email: authn_user.email,
                }}
                institution={{
                  long_name: authn_institution.long_name,
                  short_name: authn_institution.short_name,
                }}
                authnProviderName={res.locals.authn_provider_name}
                accessTokens={isExamMode ? [] : UserAccessTokenSchema.array().parse(accessTokens)}
                newAccessTokens={isExamMode ? [] : newAccessTokens}
                isExamMode={isExamMode}
                csrfToken={res.locals.__csrf_token}
              />
            </Hydrate>
            {
              // TODO: if/when we start hydrating this, we'll need to make sure we're
              // only sending safe data to the client.
              isEnterprise() && <UserSettingsPurchasesCard purchases={purchases} />
            }
          </>
        ),
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'token_generate') {
      const { mode } = await ipToMode({
        ip: req.ip,
        date: res.locals.req_date,
        authn_user_id: res.locals.authn_user.id,
      });
      if (mode !== 'Public') {
        throw new HttpStatusError(403, 'Cannot generate access tokens in exam mode.');
      }

      const name = req.body.token_name;
      const token = crypto.randomUUID();
      const token_hash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');

      await sqldb.execute(sql.insert_access_token, {
        user_id: res.locals.authn_user.id,
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
        user_id: res.locals.authn_user.id,
      });
      res.redirect(req.originalUrl);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
