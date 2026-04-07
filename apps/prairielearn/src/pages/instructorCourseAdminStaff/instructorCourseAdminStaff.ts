import * as async from 'async';
import debugfn from 'debug';
import { Router } from 'express';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { type HtmlSafeString, html } from '@prairielearn/html';
import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';
import { UniqueUidsFromStringSchema } from '@prairielearn/zod';

import { extractPageContext } from '../../lib/client/page-context.js';
import { type User } from '../../lib/db-types.js';
import { httpPrefixForCourseRepo } from '../../lib/github.js';
import { idsEqual } from '../../lib/id.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getUrl } from '../../lib/url.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import {
  type CourseInstanceAuthz,
  selectCourseInstancesWithStaffAccess,
} from '../../models/course-instances.js';
import {
  deleteCourseInstancePermissions,
  deleteCoursePermissions,
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
  updateCourseInstancePermissionsRole,
  updateCoursePermissionsRole,
} from '../../models/course-permissions.js';

import { InstructorCourseAdminStaff } from './instructorCourseAdminStaff.html.js';
import { CourseUsersRowSchema } from './instructorCourseAdminStaff.types.js';

const debug = debugfn('prairielearn:instructorCourseAdminStaff');

const sql = sqldb.loadSqlEquiv(import.meta.url);
const router = Router();

/**
 * The maximum number of UIDs that can be provided in a single request.
 */
const MAX_UIDS = 100;

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_own'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'course'>(async (req, res) => {
    const { authz_data: authzData, course } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    const courseInstances = await selectCourseInstancesWithStaffAccess({
      course,
      authzData,
      requiredRole: ['Owner'],
    });

    const courseUsers = await sqldb.queryRows(
      sql.select_course_users,
      { course_id: res.locals.course.id },
      CourseUsersRowSchema,
    );

    let githubAccessLink: string | null = null;
    if (!res.locals.course.example_course) {
      const githubPrefix = httpPrefixForCourseRepo(res.locals.course.repository);
      if (githubPrefix) {
        githubAccessLink = `${githubPrefix}/settings/access`;
      }
    }

    res.send(
      InstructorCourseAdminStaff({
        resLocals: res.locals,
        courseInstances,
        courseUsers,
        uidsLimit: MAX_UIDS,
        githubAccessLink,
        search: getUrl(req).search,
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'course'>(async (req, res) => {
    const { authz_data: authzData, course } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    if (!authzData.has_course_permission_own) {
      throw new error.HttpStatusError(403, 'Access denied (must be course owner)');
    }

    if (req.body.__action === 'course_permissions_insert_by_user_uids') {
      const uidParseResult = UniqueUidsFromStringSchema(MAX_UIDS).safeParse(req.body.uid);
      if (!uidParseResult.success) {
        flash(
          'error',
          html`${uidParseResult.error.issues.map((issue) => issue.message).join('; ')}`,
        );
        return res.redirect(req.originalUrl);
      }
      const uids = uidParseResult.data;

      // Verify the requested course role is valid
      if (!['None', 'Previewer', 'Viewer', 'Editor', 'Owner'].includes(req.body.course_role)) {
        throw new error.HttpStatusError(
          400,
          `Invalid requested course role: ${req.body.course_role}`,
        );
      }

      // Verify the course instance id associated with the requested course instance
      // role is valid (should such a role have been requested)
      const course_instances = await selectCourseInstancesWithStaffAccess({
        course,
        authzData,
        requiredRole: ['Owner'],
      });
      let course_instance: CourseInstanceAuthz | undefined;
      if (req.body.course_instance_id) {
        course_instance = course_instances.find((ci) =>
          idsEqual(ci.id, req.body.course_instance_id),
        );
        if (!course_instance) {
          throw new error.HttpStatusError(400, 'Invalid requested course instance role');
        }
      }

      // Verify the requested course instance role is valid
      if (
        course_instance &&
        !['Student Data Viewer', 'Student Data Editor'].includes(req.body.course_instance_role)
      ) {
        throw new error.HttpStatusError(
          400,
          `Invalid requested course instance role: ${req.body.course_instance_role}`,
        );
      }

      const initialMemo = {
        given_cp: [] as string[],
        not_given_cp: [] as string[],
        not_given_cip: [] as string[],
        unknown_users: [] as string[],
        errors: [] as string[],
      };

      // Iterate through UIDs
      const result = await async.reduce(uids, initialMemo, async (memo, uid) => {
        memo = memo ?? initialMemo;

        let user: User;
        try {
          user = await insertCoursePermissionsByUserUid({
            course_id: res.locals.course.id,
            uid,
            course_role: req.body.course_role,
            authn_user_id: res.locals.authz_data.authn_user.id,
          });
        } catch (err: any) {
          logger.verbose(`Failed to insert course permission for uid: ${uid}`, err);
          memo.not_given_cp.push(uid);
          memo.errors.push(`Failed to give course content access to ${uid}\n(${err.message})`);
          return memo;
        }

        memo.given_cp.push(uid);

        if (user.name == null) {
          memo.unknown_users.push(uid);
        }

        if (!course_instance) return memo;

        try {
          await insertCourseInstancePermissions({
            course_id: res.locals.course.id,
            user_id: user.id,
            course_instance_id: course_instance.id,
            course_instance_role: req.body.course_instance_role,
            authn_user_id: res.locals.authz_data.authn_user.id,
          });
        } catch (err: any) {
          logger.verbose(`Failed to insert course instance permission for uid: ${uid}`, err);
          memo.not_given_cip.push(uid);
          memo.errors.push(`Failed to give student data access to ${uid}\n(${err.message})`);
        }

        return memo;
      });

      if (result.errors.length > 0) {
        const info: HtmlSafeString[] = [];
        const given_cp_and_cip = result.given_cp.filter(
          (uid) => !result.not_given_cip.includes(uid),
        );
        debug(`given_cp: ${result.given_cp.join(', ')}`);
        debug(`not_given_cip: ${result.not_given_cip.join(', ')}`);
        debug(`given_cp_and_cip: ${given_cp_and_cip.join(', ')}`);
        if (given_cp_and_cip.length > 0) {
          if (course_instance) {
            info.push(html`
              <hr />
              <p>
                The following users were added to the course staff, were given course content access
                <strong>${req.body.course_role}</strong>, and were given student data access
                <strong>${course_instance.short_name} (${req.body.course_instance_role})</strong>:
              </p>
              <div class="container">
                <pre class="bg-dark text-white rounded p-2">${given_cp_and_cip.join(',\n')}</pre>
              </div>
            `);
          } else {
            info.push(html`
              <hr />
              <p>
                The following users were added to the course staff and were given course content
                access <strong>${req.body.course_role}</strong>:
              </p>
              <div class="container">
                <pre class="bg-dark text-white rounded p-2">
${given_cp_and_cip.join(',\n')}
                </pre
                >
              </div>
            `);
          }
        }
        if (course_instance && result.not_given_cip.length > 0) {
          info.push(html`
            <hr />
            <p>
              The following users were added to the course staff and were given course content
              access <strong>${req.body.course_role}</strong>, but were <strong>not</strong> given
              student data access
              <strong>${course_instance.short_name} (${req.body.course_instance_role})</strong>:
            </p>
            <div class="container">
              <pre class="bg-dark text-white rounded p-2">${result.not_given_cip.join(',\n')}</pre>
            </div>
            <p>
              If you return to the <a href="${req.originalUrl}">access page</a>, you will find these
              users in the list of course staff and can add student data access to each of them.
            </p>
          `);
        }
        if (result.not_given_cp.length > 0) {
          info.push(html`
            <hr />
            <p>The following users were <strong>not</strong> added to the course staff:</p>
            <div class="container">
              <pre class="bg-dark text-white rounded p-2">${result.not_given_cp.join(',\n')}</pre>
            </div>
            <p>
              If you return to the <a href="${req.originalUrl}">access page</a>, you can try to add
              them again. However, you should first check the reason for each failure to grant
              access (see below). For example, it may be that a user you tried to add was already a
              member of the course staff, in which case you will find them in the list and can
              update their course content access as appropriate.
            </p>
          `);
        }
        info.push(html`
          <hr />
          <p>Here is the reason for each failure to grant access:</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${result.errors.join('\n\n')}</pre>
          </div>
        `);
        throw new error.AugmentedError('Failed to grant access to some users', {
          status: 409,
          info: html`${info}`,
        });
      }

      if (result.unknown_users.length > 0) {
        flash(
          'warning',
          html`The following UIDs were added to the course staff, but they do not match any user who
          has previously logged in: ${result.unknown_users.join(', ')}.`,
        );
      }

      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'course_permissions_update_role') {
      if (
        idsEqual(req.body.user_id, res.locals.user.id) &&
        !res.locals.authz_data.is_administrator
      ) {
        throw new error.HttpStatusError(
          403,
          'Owners cannot change their own course content access',
        );
      }

      if (
        idsEqual(req.body.user_id, res.locals.authn_user.id) &&
        !res.locals.authz_data.is_administrator
      ) {
        throw new error.HttpStatusError(
          403,
          'Owners cannot change their own course content access even if they are emulating another user',
        );
      }

      // Before proceeding, we *could* make some effort to verify that the user
      // is still a member of the course staff. The reason we might want to do
      // so is that updateCoursePermissionsRole will throw an error if the user
      // has been removed from the course staff, and we might want to throw a
      // more informative error beforehand.
      //
      // We are making the design choice *not* to do this verification, because
      // it is unlikely that a course will have many owners all making changes
      // to permissions simultaneously, and so we are choosing to prioritize
      // speed in responding to the POST request.

      await updateCoursePermissionsRole({
        course_id: res.locals.course.id,
        user_id: req.body.user_id,
        course_role: req.body.course_role,
        authn_user_id: res.locals.authz_data.authn_user.id,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'course_permissions_delete') {
      if (
        idsEqual(req.body.user_id, res.locals.user.id) &&
        !res.locals.authz_data.is_administrator
      ) {
        throw new error.HttpStatusError(
          403,
          'Owners cannot remove themselves from the course staff',
        );
      }

      if (
        idsEqual(req.body.user_id, res.locals.authn_user.id) &&
        !res.locals.authz_data.is_administrator
      ) {
        throw new error.HttpStatusError(
          403,
          'Owners cannot remove themselves from the course staff even if they are emulating another user',
        );
      }

      await deleteCoursePermissions({
        course_id: res.locals.course.id,
        user_id: req.body.user_id,
        authn_user_id: res.locals.authz_data.authn_user.id,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'course_instance_permissions_update_role_or_delete') {
      // Again, we could make some effort to verify that the user is still a
      // member of the course staff and that they still have student data access
      // in the given course instance. We choose not to do this for the same
      // reason as above (see handler for course_permissions_update_role).

      const course_instances = await selectCourseInstancesWithStaffAccess({
        course,
        authzData,
        requiredRole: ['Owner'],
      });

      if (req.body.course_instance_id) {
        if (!course_instances.some((ci) => idsEqual(ci.id, req.body.course_instance_id))) {
          throw new error.HttpStatusError(400, 'Invalid requested course instance role');
        }
      } else {
        throw new error.HttpStatusError(400, 'Undefined course instance id');
      }

      if (['Student Data Viewer', 'Student Data Editor'].includes(req.body.course_instance_role)) {
        // In this case, we update the role associated with the course instance permission
        await updateCourseInstancePermissionsRole({
          course_id: course.id,
          user_id: req.body.user_id,
          course_instance_id: req.body.course_instance_id,
          course_instance_role: req.body.course_instance_role,
          authn_user_id: authzData.authn_user.id,
        });
        res.redirect(req.originalUrl);
      } else if (req.body.course_instance_role === 'None' || !req.body.course_instance_role) {
        // In this case, we delete the course instance permission
        await deleteCourseInstancePermissions({
          course_id: course.id,
          user_id: req.body.user_id,
          course_instance_id: req.body.course_instance_id,
          authn_user_id: authzData.authn_user.id,
        });
        res.redirect(req.originalUrl);
      } else {
        throw new error.HttpStatusError(
          400,
          `Invalid requested course instance role: ${req.body.course_instance_role}`,
        );
      }
    } else if (req.body.__action === 'course_instance_permissions_insert') {
      // Again, we could make some effort to verify that the user is still a
      // member of the course staff. We choose not to do this for the same
      // reason as above (see handler for course_permissions_update_role).

      const course_instances = await selectCourseInstancesWithStaffAccess({
        course,
        authzData,
        requiredRole: ['Owner'],
      });

      if (req.body.course_instance_id) {
        if (!course_instances.some((ci) => idsEqual(ci.id, req.body.course_instance_id))) {
          throw new error.HttpStatusError(400, 'Invalid requested course instance role');
        }
      } else {
        throw new error.HttpStatusError(400, 'Undefined course instance id');
      }

      const insertRole = req.body.course_instance_role ?? 'Student Data Viewer';
      if (!['Student Data Viewer', 'Student Data Editor'].includes(insertRole)) {
        throw new error.HttpStatusError(
          400,
          `Invalid requested course instance role: ${insertRole}`,
        );
      }

      await insertCourseInstancePermissions({
        course_id: res.locals.course.id,
        user_id: req.body.user_id,
        course_instance_id: req.body.course_instance_id,
        course_instance_role: insertRole,
        authn_user_id: res.locals.authz_data.authn_user.id,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'bulk_course_permissions_delete') {
      if (!req.body.user_ids || req.body.user_ids === '') {
        throw new error.HttpStatusError(400, 'No users selected');
      }

      const userIds: string[] = (
        Array.isArray(req.body.user_ids) ? req.body.user_ids : [req.body.user_ids]
      )
        .map((id: unknown) => String(id ?? '').trim())
        .filter((id: string) => id !== '');

      if (userIds.length === 0) throw new error.HttpStatusError(400, 'No users selected');

      for (const userId of userIds) {
        if (idsEqual(userId, res.locals.user.id) && !res.locals.authz_data.is_administrator) {
          throw new error.HttpStatusError(
            403,
            'Owners cannot remove themselves from the course staff',
          );
        }
        if (idsEqual(userId, res.locals.authn_user.id) && !res.locals.authz_data.is_administrator) {
          throw new error.HttpStatusError(
            403,
            'Owners cannot remove themselves from the course staff even if they are emulating another user',
          );
        }

        await deleteCoursePermissions({
          course_id: res.locals.course.id,
          user_id: userId,
          authn_user_id: res.locals.authz_data.authn_user.id,
        });
      }
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'bulk_edit_access') {
      if (!req.body.user_ids || req.body.user_ids === '') {
        throw new error.HttpStatusError(400, 'No users selected');
      }

      const userIds: string[] = (
        Array.isArray(req.body.user_ids) ? req.body.user_ids : [req.body.user_ids]
      )
        .map((id: unknown) => String(id ?? '').trim())
        .filter((id: string) => id !== '');

      if (userIds.length === 0) throw new error.HttpStatusError(400, 'No users selected');

      const isUniqueConstraintViolation = (err: unknown): boolean => {
        if (!err || typeof err !== 'object') return false;
        const maybeAny = err as any;
        if (maybeAny.code === '23505') return true;
        const message = typeof maybeAny.message === 'string' ? maybeAny.message : '';
        return /duplicate key value|unique constraint/i.test(message);
      };

      // Handle course role change if specified
      const courseRole = req.body.course_role;
      // Handle course instance role changes if specified
      const rawCiIds = req.body.course_instance_ids;
      const rawCiRoles = req.body.course_instance_roles;
      const willEditCourseInstances = Boolean(rawCiIds) || Boolean(rawCiRoles);

      // Validate *entire* bulk payload before mutating anything
      if (
        courseRole &&
        courseRole !== '' &&
        !['None', 'Previewer', 'Viewer', 'Editor', 'Owner'].includes(courseRole)
      ) {
        throw new error.HttpStatusError(400, `Invalid requested course role: ${courseRole}`);
      }

      let courseInstanceIds: string[] = [];
      let courseInstanceRoles: string[] = [];
      let accessibleInstances: CourseInstanceAuthz[] = [];

      if (willEditCourseInstances) {
        if (!rawCiIds || !rawCiRoles) {
          throw new error.HttpStatusError(400, 'Mismatched course instance ids and roles');
        }

        courseInstanceIds = (Array.isArray(rawCiIds) ? rawCiIds : [rawCiIds])
          .map((id: unknown) => String(id ?? '').trim())
          .filter((id: string) => id !== '');
        courseInstanceRoles = (Array.isArray(rawCiRoles) ? rawCiRoles : [rawCiRoles])
          .map((r: unknown) => String(r ?? '').trim())
          .filter((r: string) => r !== '');

        if (courseInstanceIds.length !== courseInstanceRoles.length) {
          throw new error.HttpStatusError(400, 'Mismatched course instance ids and roles');
        }

        accessibleInstances = await selectCourseInstancesWithStaffAccess({
          course,
          authzData,
          requiredRole: ['Owner'],
        });

        for (let i = 0; i < courseInstanceIds.length; i++) {
          const ciId = courseInstanceIds[i];
          const role = courseInstanceRoles[i];

          if (!accessibleInstances.some((ci) => idsEqual(ci.id, ciId))) {
            throw new error.HttpStatusError(400, 'Invalid requested course instance');
          }

          if (!['None', 'Student Data Viewer', 'Student Data Editor'].includes(role)) {
            throw new error.HttpStatusError(400, `Invalid requested course instance role: ${role}`);
          }
        }
      }

      // Mutations start only after full validation succeeds
      if (courseRole && courseRole !== '') {
        for (const userId of userIds) {
          if (idsEqual(userId, res.locals.user.id) && !res.locals.authz_data.is_administrator) {
            throw new error.HttpStatusError(
              403,
              'Owners cannot change their own course content access',
            );
          }
          if (
            idsEqual(userId, res.locals.authn_user.id) &&
            !res.locals.authz_data.is_administrator
          ) {
            throw new error.HttpStatusError(
              403,
              'Owners cannot change their own course content access even if they are emulating another user',
            );
          }

          await updateCoursePermissionsRole({
            course_id: res.locals.course.id,
            user_id: userId,
            course_role: courseRole,
            authn_user_id: res.locals.authz_data.authn_user.id,
          });
        }
      }

      if (willEditCourseInstances) {
        for (let i = 0; i < courseInstanceIds.length; i++) {
          const ciId = courseInstanceIds[i];
          const role = courseInstanceRoles[i] as
            | 'None'
            | 'Student Data Viewer'
            | 'Student Data Editor';

          for (const userId of userIds) {
            if (role === 'None') {
              await deleteCourseInstancePermissions({
                course_id: course.id,
                user_id: userId,
                course_instance_id: ciId,
                authn_user_id: authzData.authn_user.id,
              });
            } else {
              try {
                await insertCourseInstancePermissions({
                  course_id: res.locals.course.id,
                  user_id: userId,
                  course_instance_id: ciId,
                  course_instance_role: role,
                  authn_user_id: res.locals.authz_data.authn_user.id,
                });
              } catch (err: unknown) {
                if (!isUniqueConstraintViolation(err)) throw err;
                await updateCourseInstancePermissionsRole({
                  course_id: res.locals.course.id,
                  user_id: userId,
                  course_instance_id: ciId,
                  course_instance_role: role,
                  authn_user_id: res.locals.authz_data.authn_user.id,
                });
              }
            }
          }
        }
      }

      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
