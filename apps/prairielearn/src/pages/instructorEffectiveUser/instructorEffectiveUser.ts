import { parseISO, isValid } from 'date-fns';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { clearCookie, setCookie } from '../../lib/cookie.js';

import { InstructorEffectiveUser, CourseRolesSchema } from './instructorEffectiveUser.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (
      !(
        res.locals.authz_data.authn_has_course_permission_preview ||
        res.locals.authz_data.authn_has_course_instance_permission_view
      )
    ) {
      throw new HttpStatusError(
        403,
        'Access denied (must be course previewer or student data viewer)',
      );
    }

    const courseRoles = await queryRow(
      sql.select,
      {
        course_id: res.locals.course.id,
        authn_course_role: res.locals.authz_data.authn_course_role,
        authn_course_instance_role: res.locals.authz_data.authn_course_instance_role || 'None',
      },
      CourseRolesSchema,
    );

    let ipAddress = req.ip;
    // Trim out IPv6 wrapper on IPv4 addresses
    if (ipAddress.substring(0, 7) === '::ffff:') {
      ipAddress = ipAddress.substring(7);
    }

    res.send(InstructorEffectiveUser({ resLocals: res.locals, ipAddress, courseRoles }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (
      !(
        res.locals.authz_data.authn_has_course_permission_preview ||
        res.locals.authz_data.authn_has_course_instance_permission_view
      )
    ) {
      throw new HttpStatusError(
        403,
        'Access denied (must be course previewer or student data viewer)',
      );
    }

    if (req.body.__action === 'reset') {
      clearCookie(res, ['pl_requested_uid', 'pl2_requested_uid']);
      clearCookie(res, ['pl_requested_course_role', 'pl2_requested_course_role']);
      clearCookie(res, ['pl_requested_course_instance_role', 'pl2_requested_course_instance_role']);
      clearCookie(res, ['pl_requested_date', 'pl2_requested_date']);
      setCookie(res, ['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'changeUid') {
      setCookie(res, ['pl_requested_uid', 'pl2_requested_uid'], req.body.pl_requested_uid, {
        maxAge: 60 * 60 * 1000,
      });
      setCookie(res, ['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'changeCourseRole') {
      setCookie(
        res,
        ['pl_requested_course_role', 'pl2_requested_course_role'],
        req.body.pl_requested_course_role,
        { maxAge: 60 * 60 * 1000 },
      );
      setCookie(res, ['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'changeCourseInstanceRole') {
      setCookie(
        res,
        ['pl_requested_course_instance_role', 'pl2_requested_course_instance_role'],
        req.body.pl_requested_course_instance_role,
        { maxAge: 60 * 60 * 1000 },
      );
      setCookie(res, ['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'changeDate') {
      const date = parseISO(req.body.pl_requested_date);
      if (!isValid(date)) {
        throw new HttpStatusError(400, `invalid requested date: ${req.body.pl_requested_date}`);
      }
      setCookie(res, ['pl_requested_date', 'pl2_requested_date'], date.toISOString(), {
        maxAge: 60 * 60 * 1000,
      });
      setCookie(res, ['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
      res.redirect(req.originalUrl);
    } else {
      throw new HttpStatusError(400, 'unknown action: ' + res.locals.__action);
    }
  }),
);

export default router;
