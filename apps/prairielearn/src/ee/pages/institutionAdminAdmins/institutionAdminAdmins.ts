import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { selectAndAuthzInstitutionAsAdmin } from '../../lib/selectAndAuthz.js';

import { InstitutionAdminAdmins } from './institutionAdminAdmins.html.js';

const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institution = await selectAndAuthzInstitutionAsAdmin({
      institution_id: req.params.institution_id,
      user_id: res.locals.authn_user.user_id,
      access_as_administrator: res.locals.access_as_administrator,
    });

    res.send(InstitutionAdminAdmins({ institution, resLocals: res.locals }));
  }),
);

export default router;
