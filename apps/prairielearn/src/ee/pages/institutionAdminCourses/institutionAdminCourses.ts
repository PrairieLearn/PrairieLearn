import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { selectAndAuthzInstitutionAsAdmin } from '../../lib/selectAndAuthz';
import { InstitutionAdminCourses } from './institutionAdminCourses.html';
import { CourseSchema } from '../../../lib/db-types';

const sql = loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institution = await selectAndAuthzInstitutionAsAdmin({
      institution_id: req.params.institution_id,
      user_id: res.locals.authn_user.user_id,
      access_as_administrator: res.locals.access_as_administrator,
    });

    const courses = await queryRows(
      sql.select_courses,
      { institution_id: institution.id },
      CourseSchema,
    );

    res.send(InstitutionAdminCourses({ institution, courses, resLocals: res.locals }));
  }),
);

export default router;
