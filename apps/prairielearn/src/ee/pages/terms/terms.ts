import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';

import { clearCookie } from '../../../lib/cookie.js';

import { Terms } from './terms.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.send(Terms({ user: res.locals.authn_user, resLocals: res.locals }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'accept_terms') {
      await queryAsync(sql.user_accept_terms, { user_id: res.locals.authn_user.user_id });

      // This cookie would have been set by `redirectToTermsPage`.
      clearCookie(res, ['pl_pre_terms_url', 'pl2_pre_terms_url']);
      res.redirect(req.cookies.pl2_pre_terms_url || '/');
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
