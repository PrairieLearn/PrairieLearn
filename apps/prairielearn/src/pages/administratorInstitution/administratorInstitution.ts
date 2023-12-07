import asyncHandler = require('express-async-handler');
import express = require('express');
import sqldb = require('@prairielearn/postgres');

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

import { AdministratorInstitution, InstitutionRowSchema } from './administratorInstitution.html';

router.get(
  '/:institution_id',
  asyncHandler(async (req, res) => {
    const institutionRow = await sqldb.queryRow(
      sql.select_institution,
      { id: req.params.institution_id },
      InstitutionRowSchema,
    );
    res.send(AdministratorInstitution({ institutionRow, resLocals: res.locals }));
  }),
);

router.post(
  '/:institution_id',
  asyncHandler(async (req, res) => {
    if (!res.locals.is_administrator) throw new Error('Insufficient permissions');

    if (req.body.__action === 'edit_institution') {
      await sqldb.queryAsync(sql.edit_institution, {
        id: req.body.id,
        short_name: req.body.short_name,
        long_name: req.body.long_name,
        display_timezone: req.body.display_timezone,
        course_instance_enrollment_limit: req.body.course_instance_enrollment_limit,
        yearly_enrollment_limit: req.body.yearly_enrollment_limit,
        uid_regexp: req.body.uid_regexp,
      });
      if (req.body.authn_providers !== req.body.original_authn_providers) {
        const original_authn_providers = req.body.original_authn_providers.split(', ');
        const new_authn_providers = req.body.authn_providers?.split(', ');
        if (new_authn_providers.length > original_authn_providers.length) {
          new_authn_providers.forEach(async (provider, i) => {
            if (original_authn_providers[i] !== provider) {
              await sqldb.queryAsync(sql.remove_institution_authn_provider, {
                institution_id: req.body.id,
                authn_provider_name: original_authn_providers[i],
              });
            }
            await sqldb.queryAsync(sql.add_institution_authn_provider, {
              institution_id: req.body.id,
              authn_provider_name: provider,
            });
          });
        } else {
          original_authn_providers.forEach(async (provider, i) => {
            if (new_authn_providers[i] !== provider) {
              await sqldb.queryAsync(sql.remove_institution_authn_provider, {
                institution_id: req.body.id,
                authn_provider_name: provider,
              });
              if (new_authn_providers[i]) {
                await sqldb.queryAsync(sql.add_institution_authn_provider, {
                  institution_id: req.body.id,
                  authn_provider_name: new_authn_providers[i],
                });
              }
            }
          });
        }
      }
    }
    res.redirect('../institutions');
  }),
);

export default router;
