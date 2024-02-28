import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';

import { Terms } from './terms.html';

const sql = loadSqlEquiv(__filename);
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
      res.clearCookie('preTermsUrl');
      res.redirect(req.cookies.preTermsUrl || '/');
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
