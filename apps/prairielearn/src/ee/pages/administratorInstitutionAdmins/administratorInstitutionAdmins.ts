import { Router } from 'express';

import { getInstitution } from '../../lib/institution.js';
import { typedAsyncHandler } from '../../../lib/res-locals.js';

import { AdministratorInstitutionAdmins } from './administratorInstitutionAdmins.html.js';

const router = Router({ mergeParams: true });

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const institution = await getInstitution(req.params.institution_id);
    res.send(AdministratorInstitutionAdmins({ institution, resLocals: res.locals }));
  }),
);

export default router;
