//@ts-check
const asyncHandler = require('express-async-handler');
const express = require('express');
const router = express.Router();
const async = require('async');

const { html } = require('@prairielearn/html');
const { logger } = require('@prairielearn/logger');
const error = require('@prairielearn/error');
const sqldb = require('@prairielearn/postgres');
const { idsEqual } = require('../../lib/id');
const { selectCourseInstancesWithStaffAccess } = require('../../models/course-instances');

const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_own) {
      throw error.make(403, 'Access denied (must be course owner)');
    }

    const course_instances = await selectCourseInstancesWithStaffAccess({
      course_id: res.locals.course.id,
      user_id: res.locals.user.user_id,
      authn_user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.is_administrator,
      authn_is_administrator: res.locals.authz_data.authn_is_administrator,
    });

    const course_users = await sqldb.queryAsync(sql.select_course_users, {
      course_id: res.locals.course.id,
    });

    res.locals.course_users = course_users.rows;
    res.locals.course_instances = course_instances;

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_own) {
      throw error.make(403, 'Access denied (must be course owner)');
    }

    if (req.body.__action === 'course_permissions_insert_by_user_uids') {
      // Get set of unique, non-empty UIDs with no leading or trailing whitespace.
      let uids = new Set(
        req.body.uid
          .split(/[\s,;]+/)
          .map((uid) => uid.trim())
          .filter((uid) => uid),
      );

      // Verify there is at least one UID
      if (uids.size === 0) throw error.make(400, 'Empty list of UIDs');

      // Verify the requested course role is valid - we choose to disallow Owner
      // because we want to discourage the assignment of this role to many users
      if (!['None', 'Previewer', 'Viewer', 'Editor'].includes(req.body.course_role)) {
        throw error.make(400, `Invalid requested course role: ${req.body.course_role}`);
      }

      // Verify the course instance id associated with the requested course instance
      // role is valid (should such a role have been requested)
      const course_instances = await selectCourseInstancesWithStaffAccess({
        course_id: res.locals.course.id,
        user_id: res.locals.user.user_id,
        authn_user_id: res.locals.authn_user.user_id,
        is_administrator: res.locals.is_administrator,
        authn_is_administrator: res.locals.authz_data.authn_is_administrator,
      });
      let course_instance = null;
      if (req.body.course_instance_id) {
        course_instance = course_instances.find((ci) =>
          idsEqual(ci.id, req.body.course_instance_id),
        );
        if (!course_instance) {
          throw error.make(400, `Invalid requested course instance role`);
        }
      }

      // Verify the requested course instance role is valid
      if (
        course_instance &&
        !['Student Data Viewer', 'Student Data Editor'].includes(req.body.course_instance_role)
      ) {
        throw error.make(
          400,
          `Invalid requested course instance role: ${req.body.course_instance_role}`,
        );
      }
      // Iterate through UIDs
      const result = await async.reduce(
        [...uids],
        { given_cp: [], not_given_cp: [], not_given_cip: [], errors: [] },
        /**
         * @param {{ given_cp: string[], not_given_cp: string[], not_given_cip: string[], errors: string[] }} memo
         */
        async (memo, uid) => {
          let result;
          try {
            const c_params = [
              res.locals.course.id,
              uid,
              req.body.course_role,
              res.locals.authz_data.authn_user.user_id,
            ];
            result = await sqldb.callAsync('course_permissions_insert_by_user_uid', c_params);
          } catch (err) {
            logger.verbose(`Failed to insert course permission for uid: ${uid}`, err);
            memo.not_given_cp.push(uid);
            memo.errors.push(`Failed to give course content access to ${uid}\n(${err.message})`);
            return memo;
          }

          memo.given_cp.push(uid);

          if (!course_instance) return memo;

          try {
            const ci_params = [
              res.locals.course.id,
              result.rows[0].user_id,
              course_instance.id,
              req.body.course_instance_role,
              res.locals.authz_data.authn_user.user_id,
            ];
            await sqldb.callAsync('course_instance_permissions_insert', ci_params);
          } catch (err) {
            logger.verbose(`Failed to insert course instance permission for uid: ${uid}`, err);
            memo.not_given_cip.push(uid);
            memo.errors.push(`Failed to give student data access to ${uid}\n(${err.message})`);
          }

          return memo;
        },
      );

      if (result.errors.length > 0) {
        /**
         * @type {Error & { info?: string }}
         */
        const err = error.make(409, 'Failed to grant access to some users');
        err.info = '';
        const given_cp_and_cip = result.given_cp.filter(
          (uid) => !result.not_given_cip.includes(uid),
        );
        debug(`given_cp: ${result.given_cp}`);
        debug(`not_given_cip: ${result.not_given_cip}`);
        debug(`given_cp_and_cip: ${given_cp_and_cip}`);
        if (given_cp_and_cip.length > 0) {
          if (course_instance) {
            err.info += html`
              <hr />
              <p>
                The following users were added to the course staff, were given course content access
                <strong>${req.body.course_role}</strong>, and were given student data access
                <strong>${course_instance.short_name} (Viewer)</strong>:
              </p>
              <div class="container">
                <pre class="bg-dark text-white rounded p-2">${given_cp_and_cip.join(',\n')}</pre>
              </div>
            `.toString();
          } else {
            err.info += html`
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
            `.toString();
          }
        }
        if (course_instance && result.not_given_cip.length > 0) {
          err.info += html`
            <hr />
            <p>
              The following users were added to the course staff and were given course content
              access <strong>${req.body.course_role}</strong>, but were <strong>not</strong> given
              student data access <strong>${course_instance.short_name} (Viewer)</strong>:
            </p>
            <div class="container">
              <pre class="bg-dark text-white rounded p-2">${result.not_given_cip.join(',\n')}</pre>
            </div>
            <p>
              If you return to the <a href="${req.originalUrl}">access page</a>, you will find these
              users in the list of course staff and can add student data access to each of them.
            </p>
          `.toString();
        }
        if (result.not_given_cp.length > 0) {
          err.info += html`
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
          `.toString();
        }
        err.info += html`
          <hr />
          <p>Here is the reason for each failure to grant access:</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${result.errors.join('\n\n')}</pre>
          </div>
        `.toString();
        throw err;
      }
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'course_permissions_update_role') {
      if (
        idsEqual(req.body.user_id, res.locals.user.user_id) &&
        !res.locals.authz_data.is_administrator
      ) {
        throw error.make(403, 'Owners cannot change their own course content access');
      }

      if (
        idsEqual(req.body.user_id, res.locals.authn_user.user_id) &&
        !res.locals.authz_data.is_administrator
      ) {
        throw error.make(
          403,
          'Owners cannot change their own course content access even if they are emulating another user',
        );
      }

      // Before proceeding, we *could* make some effort to verify that the user
      // is still a member of the course staff. The reason we might want to do so
      // is that sql.update_course_permissions will throw an "incorrect row count"
      // error if the user has been removed from the course staff, and we might
      // want to throw a more informative error beforehand.
      //
      // We are making the design choice *not* to do this verification, because
      // it is unlikely that a course will have many owners all making changes to
      // permissions simultaneously, and so we are choosing to prioritize speed
      // in responding to the POST request.

      const params = [
        res.locals.course.id,
        req.body.user_id,
        req.body.course_role,
        res.locals.authz_data.authn_user.user_id,
      ];
      await sqldb.callAsync('course_permissions_update_role', params);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'course_permissions_delete') {
      if (
        idsEqual(req.body.user_id, res.locals.user.user_id) &&
        !res.locals.authz_data.is_administrator
      ) {
        throw error.make(403, 'Owners cannot remove themselves from the course staff');
      }

      if (
        idsEqual(req.body.user_id, res.locals.authn_user.user_id) &&
        !res.locals.authz_data.is_administrator
      ) {
        throw error.make(
          403,
          'Owners cannot remove themselves from the course staff even if they are emulating another user',
        );
      }

      const params = [
        res.locals.course.id,
        req.body.user_id,
        res.locals.authz_data.authn_user.user_id,
      ];
      await sqldb.callAsync('course_permissions_delete', params);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'course_instance_permissions_update_role_or_delete') {
      // Again, we could make some effort to verify that the user is still a
      // member of the course staff and that they still have student data access
      // in the given course instance. We choose not to do this for the same
      // reason as above (see handler for course_permissions_update_role).

      const course_instances = await selectCourseInstancesWithStaffAccess({
        course_id: res.locals.course.id,
        user_id: res.locals.user.user_id,
        authn_user_id: res.locals.authn_user.user_id,
        is_administrator: res.locals.is_administrator,
        authn_is_administrator: res.locals.authz_data.authn_is_administrator,
      });

      if (req.body.course_instance_id) {
        if (!course_instances.find((ci) => idsEqual(ci.id, req.body.course_instance_id))) {
          throw error.make(400, `Invalid requested course instance role`);
        }
      } else {
        throw error.make(400, `Undefined course instance id`);
      }

      if (req.body.course_instance_role) {
        // In this case, we update the role associated with the course instance permission
        const params = [
          res.locals.course.id,
          req.body.user_id,
          req.body.course_instance_id,
          req.body.course_instance_role,
          res.locals.authz_data.authn_user.user_id,
        ];
        await sqldb.callAsync('course_instance_permissions_update_role', params);
        res.redirect(req.originalUrl);
      } else {
        // In this case, we delete the course instance permission
        const params = [
          res.locals.course.id,
          req.body.user_id,
          req.body.course_instance_id,
          res.locals.authz_data.authn_user.user_id,
        ];
        await sqldb.callAsync('course_instance_permissions_delete', params);
        res.redirect(req.originalUrl);
      }
    } else if (req.body.__action === 'course_instance_permissions_insert') {
      // Again, we could make some effort to verify that the user is still a
      // member of the course staff. We choose not to do this for the same
      // reason as above (see handler for course_permissions_update_role).

      const course_instances = await selectCourseInstancesWithStaffAccess({
        course_id: res.locals.course.id,
        user_id: res.locals.user.user_id,
        authn_user_id: res.locals.authn_user.user_id,
        is_administrator: res.locals.is_administrator,
        authn_is_administrator: res.locals.authz_data.authn_is_administrator,
      });

      if (req.body.course_instance_id) {
        if (!course_instances.find((ci) => idsEqual(ci.id, req.body.course_instance_id))) {
          throw error.make(400, `Invalid requested course instance role`);
        }
      } else {
        throw error.make(400, `Undefined course instance id`);
      }

      const params = [
        res.locals.course.id,
        req.body.user_id,
        req.body.course_instance_id,
        'Student Data Viewer',
        res.locals.authz_data.authn_user.user_id,
      ];
      await sqldb.callAsync('course_instance_permissions_insert', params);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_non_owners') {
      debug('Delete non-owners');
      const params = [res.locals.course.id, res.locals.authz_data.authn_user.user_id];
      await sqldb.callAsync('course_permissions_delete_non_owners', params);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_no_access') {
      debug('Delete users with no access');
      const params = [res.locals.course.id, res.locals.authz_data.authn_user.user_id];
      await sqldb.callAsync('course_permissions_delete_users_without_access', params);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'remove_all_student_data_access') {
      debug('Remove all student data access');
      const params = [res.locals.course.id, res.locals.authz_data.authn_user.user_id];
      await sqldb.callAsync('course_instance_permissions_delete_all', params);
      res.redirect(req.originalUrl);
    } else {
      throw error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      });
    }
  }),
);

module.exports = router;
