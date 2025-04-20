import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { getInstitution } from '../../lib/institution.js';

import { AdministratorInstitutionAdmins } from './administratorInstitutionAdmins.html.js';

const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institution = await getInstitution(req.params.institution_id);
    res.send(AdministratorInstitutionAdmins({ institution, resLocals: res.locals }));
  }),
);

export default router;
