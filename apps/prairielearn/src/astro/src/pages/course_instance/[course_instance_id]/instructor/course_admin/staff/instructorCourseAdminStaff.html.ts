import { z } from 'zod';
import {
  selectCourseInstancesWithStaffAccess,
  type CourseInstanceAuthz,
} from '../../../../../../../../models/course-instances';
import { parseUidsString } from '../../../../../../../../lib/user';
import { MAX_UIDS } from './utils';
import * as error from '@prairielearn/error';
import { idsEqual } from '../../../../../../../../lib/id';
import async from 'async';
import { type HtmlSafeString, escapeHtml, html } from '@prairielearn/html';
import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';

import { type User } from '../../../../../../../../lib/db-types.js';
import { httpPrefixForCourseRepo } from '../../../../../../../../lib/github';
import {
  deleteAllCourseInstancePermissionsForCourse,
  deleteCourseInstancePermissions,
  deleteCoursePermissions,
  deleteCoursePermissionsForNonOwners,
  deleteCoursePermissionsForUsersWithoutAccess,
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
  updateCourseInstancePermissionsRole,
  updateCoursePermissionsRole,
} from '../../../../../../../../models/course-permissions.js';
import debugfn from 'debug';
import type { APIRoute } from 'astro';

// import {
//   InstructorCourseAdminStaff,
//   CourseUsersRowSchema,
// } from './instructorCourseAdminStaff.html.js';
const debug = debugfn('prairielearn:instructorCourseAdminStaff');

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const resLocals = locals as Record<string, any>;
  if (!resLocals.authz_data.has_course_permission_own) {
    throw new error.HttpStatusError(403, 'Access denied (must be course owner)');
  }
  const reqBody = await request.json();

  if (!reqBody || !reqBody.__action) {
    throw new error.HttpStatusError(400, 'No POST body');
  }

  if (reqBody.__action === 'course_permissions_insert_by_user_uids') {
    const uids = parseUidsString(reqBody.uid, MAX_UIDS);

    // Verify there is at least one UID
    if (uids.length === 0) throw new error.HttpStatusError(400, 'Empty list of UIDs');

    // Verify the requested course role is valid
    if (!['None', 'Previewer', 'Viewer', 'Editor', 'Owner'].includes(reqBody.course_role)) {
      throw new error.HttpStatusError(400, `Invalid requested course role: ${reqBody.course_role}`);
    }

    // Verify the course instance id associated with the requested course instance
    // role is valid (should such a role have been requested)
    const course_instances = await selectCourseInstancesWithStaffAccess({
      course_id: resLocals.course.id,
      user_id: resLocals.user.user_id,
      authn_user_id: resLocals.authn_user.user_id,
      is_administrator: resLocals.is_administrator,
      authn_is_administrator: resLocals.authz_data.authn_is_administrator,
    });
    let course_instance: CourseInstanceAuthz | undefined;
    if (reqBody.course_instance_id) {
      course_instance = course_instances.find((ci) => idsEqual(ci.id, reqBody.course_instance_id));
      if (!course_instance) {
        throw new error.HttpStatusError(400, 'Invalid requested course instance role');
      }
    }

    // Verify the requested course instance role is valid
    if (
      course_instance &&
      !['Student Data Viewer', 'Student Data Editor'].includes(reqBody.course_instance_role)
    ) {
      throw new error.HttpStatusError(
        400,
        `Invalid requested course instance role: ${reqBody.course_instance_role}`,
      );
    }
    // Iterate through UIDs
    type Memo = {
      given_cp: string[];
      not_given_cp: string[];
      not_given_cip: string[];
      errors: string[];
    };
    const result = await async.reduce(
      uids,
      { given_cp: [], not_given_cp: [], not_given_cip: [], errors: [] } as Memo,
      async (memo: Memo | undefined, uid) => {
        if (!memo) throw new Error('unexpected');

        let user: User;
        try {
          user = await insertCoursePermissionsByUserUid({
            course_id: resLocals.course.id,
            uid,
            course_role: reqBody.course_role,
            authn_user_id: resLocals.authz_data.authn_user.user_id,
          });
        } catch (err: any) {
          logger.verbose(`Failed to insert course permission for uid: ${uid}`, err);
          memo.not_given_cp.push(uid);
          memo.errors.push(`Failed to give course content access to ${uid}\n(${err.message})`);
          return memo;
        }

        memo.given_cp.push(uid);

        if (!course_instance) return memo;

        try {
          await insertCourseInstancePermissions({
            course_id: resLocals.course.id,
            user_id: user.user_id,
            course_instance_id: course_instance.id,
            course_instance_role: reqBody.course_instance_role,
            authn_user_id: resLocals.authz_data.authn_user.user_id,
          });
        } catch (err: any) {
          logger.verbose(`Failed to insert course instance permission for uid: ${uid}`, err);
          memo.not_given_cip.push(uid);
          memo.errors.push(`Failed to give student data access to ${uid}\n(${err.message})`);
        }

        return memo;
      },
    );

    if (result.errors.length > 0) {
      const info: HtmlSafeString[] = [];
      const given_cp_and_cip = result.given_cp.filter((uid) => !result.not_given_cip.includes(uid));
      debug(`given_cp: ${result.given_cp}`);
      debug(`not_given_cip: ${result.not_given_cip}`);
      debug(`given_cp_and_cip: ${given_cp_and_cip}`);
      if (given_cp_and_cip.length > 0) {
        if (course_instance) {
          info.push(html`
            <hr />
            <p>
              The following users were added to the course staff, were given course content access
              <strong>${reqBody.course_role}</strong>, and were given student data access
              <strong>${course_instance.short_name} (Viewer)</strong>:
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
              access <strong>${reqBody.course_role}</strong>:
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
            The following users were added to the course staff and were given course content access
            <strong>${reqBody.course_role}</strong>, but were <strong>not</strong> given student
            data access <strong>${course_instance.short_name} (Viewer)</strong>:
          </p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${result.not_given_cip.join(',\n')}</pre>
          </div>
          <p>
            If you return to the <a href="${resLocals.originalUrl}">access page</a>, you will find
            these users in the list of course staff and can add student data access to each of them.
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
            If you return to the <a href="${resLocals.originalUrl}">access page</a>, you can try to
            add them again. However, you should first check the reason for each failure to grant
            access (see below). For example, it may be that a user you tried to add was already a
            member of the course staff, in which case you will find them in the list and can update
            their course content access as appropriate.
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
    return redirect(resLocals.originalUrl);
  } else if (reqBody.__action === 'course_permissions_update_role') {
    if (
      idsEqual(reqBody.user_id, resLocals.user.user_id) &&
      !resLocals.authz_data.is_administrator
    ) {
      throw new error.HttpStatusError(403, 'Owners cannot change their own course content access');
    }

    if (
      idsEqual(reqBody.user_id, resLocals.authn_user.user_id) &&
      !resLocals.authz_data.is_administrator
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
      course_id: resLocals.course.id,
      user_id: reqBody.user_id,
      course_role: reqBody.course_role,
      authn_user_id: resLocals.authz_data.authn_user.user_id,
    });
    return redirect(resLocals.originalUrl);
  } else if (reqBody.__action === 'course_permissions_delete') {
    if (
      idsEqual(reqBody.user_id, resLocals.user.user_id) &&
      !resLocals.authz_data.is_administrator
    ) {
      throw new error.HttpStatusError(403, 'Owners cannot remove themselves from the course staff');
    }

    if (
      idsEqual(reqBody.user_id, resLocals.authn_user.user_id) &&
      !resLocals.authz_data.is_administrator
    ) {
      throw new error.HttpStatusError(
        403,
        'Owners cannot remove themselves from the course staff even if they are emulating another user',
      );
    }

    await deleteCoursePermissions({
      course_id: resLocals.course.id,
      user_id: reqBody.user_id,
      authn_user_id: resLocals.authz_data.authn_user.user_id,
    });
    return redirect(resLocals.originalUrl);
  } else if (reqBody.__action === 'course_instance_permissions_update_role_or_delete') {
    // Again, we could make some effort to verify that the user is still a
    // member of the course staff and that they still have student data access
    // in the given course instance. We choose not to do this for the same
    // reason as above (see handler for course_permissions_update_role).

    const course_instances = await selectCourseInstancesWithStaffAccess({
      course_id: resLocals.course.id,
      user_id: resLocals.user.user_id,
      authn_user_id: resLocals.authn_user.user_id,
      is_administrator: resLocals.is_administrator,
      authn_is_administrator: resLocals.authz_data.authn_is_administrator,
    });

    if (reqBody.course_instance_id) {
      if (!course_instances.find((ci) => idsEqual(ci.id, reqBody.course_instance_id))) {
        throw new error.HttpStatusError(400, 'Invalid requested course instance role');
      }
    } else {
      throw new error.HttpStatusError(400, 'Undefined course instance id');
    }

    if (reqBody.course_instance_role) {
      // In this case, we update the role associated with the course instance permission
      await updateCourseInstancePermissionsRole({
        course_id: resLocals.course.id,
        user_id: reqBody.user_id,
        course_instance_id: reqBody.course_instance_id,
        course_instance_role: reqBody.course_instance_role,
        authn_user_id: resLocals.authz_data.authn_user.user_id,
      });
      return redirect(resLocals.originalUrl);
    } else {
      // In this case, we delete the course instance permission
      await deleteCourseInstancePermissions({
        course_id: resLocals.course.id,
        user_id: reqBody.user_id,
        course_instance_id: reqBody.course_instance_id,
        authn_user_id: resLocals.authz_data.authn_user.user_id,
      });
      return redirect(resLocals.originalUrl);
    }
  } else if (reqBody.__action === 'course_instance_permissions_insert') {
    // Again, we could make some effort to verify that the user is still a
    // member of the course staff. We choose not to do this for the same
    // reason as above (see handler for course_permissions_update_role).

    const course_instances = await selectCourseInstancesWithStaffAccess({
      course_id: resLocals.course.id,
      user_id: resLocals.user.user_id,
      authn_user_id: resLocals.authn_user.user_id,
      is_administrator: resLocals.is_administrator,
      authn_is_administrator: resLocals.authz_data.authn_is_administrator,
    });

    if (reqBody.course_instance_id) {
      if (!course_instances.find((ci) => idsEqual(ci.id, reqBody.course_instance_id))) {
        throw new error.HttpStatusError(400, 'Invalid requested course instance role');
      }
    } else {
      throw new error.HttpStatusError(400, 'Undefined course instance id');
    }

    await insertCourseInstancePermissions({
      course_id: resLocals.course.id,
      user_id: reqBody.user_id,
      course_instance_id: reqBody.course_instance_id,
      course_instance_role: 'Student Data Viewer',
      authn_user_id: resLocals.authz_data.authn_user.user_id,
    });
    return redirect(resLocals.originalUrl);
  } else if (reqBody.__action === 'delete_non_owners') {
    debug('Delete non-owners');
    await deleteCoursePermissionsForNonOwners({
      course_id: resLocals.course.id,
      authn_user_id: resLocals.authz_data.authn_user.user_id,
    });
    return redirect(resLocals.originalUrl);
  } else if (reqBody.__action === 'delete_no_access') {
    debug('Delete users with no access');
    await deleteCoursePermissionsForUsersWithoutAccess({
      course_id: resLocals.course.id,
      authn_user_id: resLocals.authz_data.authn_user.user_id,
    });
    return redirect(resLocals.originalUrl);
  } else if (reqBody.__action === 'remove_all_student_data_access') {
    debug('Remove all student data access');
    await deleteAllCourseInstancePermissionsForCourse({
      course_id: resLocals.course.id,
      authn_user_id: resLocals.authz_data.authn_user.user_id,
    });
    return redirect(resLocals.originalUrl);
  } else {
    throw new error.HttpStatusError(400, `unknown __action: ${reqBody.__action}`);
  }
};
