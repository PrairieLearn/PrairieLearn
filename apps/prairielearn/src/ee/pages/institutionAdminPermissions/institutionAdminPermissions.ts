import { Router } from 'express';
import asyncHandler = require('express-async-handler');

import { InstitutionAdminPermissions } from './institutionAdminPermissions.html';
import { getInstitution } from '../../lib/institution';

const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // TODO: authenticate the the user can access this institution.
    // TODO: do the same on other institution admin pages as well.
    const institution = await getInstitution(req.params.institution_id);
    res.send(InstitutionAdminPermissions({ institution, resLocals: res.locals }));
  })
);

export default router;
