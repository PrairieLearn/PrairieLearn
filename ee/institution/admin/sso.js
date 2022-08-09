// @ts-check
const { Router } = require('express');
const asyncHandler = require('express-async-handler');

const { InstitutionAdminSso } = require('./sso.html');
const { getInstitution } = require('./utils');

const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institution = await getInstitution(req.params.institution_id);
    res.send(InstitutionAdminSso({ institution, resLocals: res.locals }));
  })
);

module.exports = router;
