const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const async = require('async');

const { html } = require('@prairielearn/html');
const { logger } = require('@prairielearn/logger');
const error = require('@prairielearn/error');
const sqldb = require('@prairielearn/postgres');
const { idsEqual } = require('../../lib/id');

const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const sql = sqldb.loadSqlEquiv(__filename);

router.get('/', (req, res, next) => {
  if (!res.locals.authz_data.has_course_permission_own) {
    return next(error.make(403, 'Access denied (must be course owner)'));
  }

  sqldb.query(sql.select_course_users, { course_id: res.locals.course.id }, (err, result) => {
    if (ERR(err, next)) return;
    res.locals.course_users = result.rows;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  });
});

router.post('/', (req, res, next) => {
  if (!res.locals.authz_data.has_course_permission_own) {
    return next(error.make(403, 'Access denied (must be course owner)'));
  }

  if (req.body.__action === 'course_permissions_insert_by_user_uids') {
    // Get set of unique, non-empty UIDs with no leading or trailing whitespaces
    let uids = new Set(
      req.body.uid
        .split(/[\s,;]+/)
        .map((uid) => uid.trim())
        .filter((uid) => uid),
    );

    // Verify there is at least one UID
    if (uids.length === 0) return next(error.make(400, 'Empty list of UIDs'));

    // Verify the requested course role is valid - we choose to disallow Owner
    // because we want to discourage the assignment of this role to many users
    if (!['None', 'Previewer', 'Viewer', 'Editor'].includes(req.body.course_role)) {
      return next(error.make(400, `Invalid requested course role: ${req.body.course_role}`));
    }

    // Verify the course instance id associated with the requested course instance
    // role is valid (should such a role have been requested)
    let course_instance = null;
    if (req.body.course_instance_id) {
      course_instance = res.locals.authz_data.course_instances.find((ci) =>
        idsEqual(ci.id, req.body.course_instance_id),
      );
      if (!course_instance) return next(error.make(400, `Invalid requested course instance role`));
    }

    // Verify the requested course instance role is valid
    if (
      course_instance &&
      !['Student Data Viewer', 'Student Data Editor'].includes(req.body.course_instance_role)
    ) {
      return next(
        error.make(400, `Invalid requested course instance role: ${req.body.course_instance_role}`),
      );
    }
    // Iterate through UIDs
    async.reduce(
      uids,
      { given_cp: [], not_given_cp: [], not_given_cip: [], errors: [] },
      (memo, uid, callback) => {
        const c_params = [
          res.locals.course.id,
          uid,
          req.body.course_role,
          res.locals.authz_data.authn_user.user_id,
        ];
        sqldb.call('course_permissions_insert_by_user_uid', c_params, (err, result) => {
          if (
            ERR(err, (e) => logger.verbose(`Failed to insert course permission for uid: ${uid}`, e))
          ) {
            memo.not_given_cp.push(uid);
            memo.errors.push(`Failed to give course content access to ${uid}\n(${err.message})`);
            return callback(null, memo);
          }

          memo.given_cp.push(uid);

          if (!course_instance) return callback(null, memo);

          const ci_params = [
            res.locals.course.id,
            result.rows[0].user_id,
            course_instance.id,
            req.body.course_instance_role,
            res.locals.authz_data.authn_user.user_id,
          ];
          sqldb.call('course_instance_permissions_insert', ci_params, (err, _result) => {
            if (
              ERR(err, (e) =>
                logger.verbose(`Failed to insert course instance permission for uid: ${uid}`, e),
              )
            ) {
              memo.not_given_cip.push(uid);
              memo.errors.push(`Failed to give student data access to ${uid}\n(${err.message})`);
              return callback(null, memo);
            }

            callback(null, memo);
          });
        });
      },
      (err, result) => {
        if (ERR(err, next)) return;
        if (result.errors.length > 0) {
          err = error.make(409, 'Failed to grant access to some users');
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
                  The following users were added to the course staff, were given course content
                  access <strong>${req.body.course_role}</strong>, and were given student data
                  access <strong>${course_instance.short_name} (Viewer)</strong>:
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
                <pre class="bg-dark text-white rounded p-2">
${result.not_given_cip.join(',\n')}</pre
                >
              </div>
              <p>
                If you return to the <a href="${req.originalUrl}">access page</a>, you will find
                these users in the list of course staff and can add student data access to each of
                them.
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
                If you return to the <a href="${req.originalUrl}">access page</a>, you can try to
                add them again. However, you should first check the reason for each failure to grant
                access (see below). For example, it may be that a user you tried to add was already
                a member of the course staff, in which case you will find them in the list and can
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
          return next(err);
        }
        res.redirect(req.originalUrl);
      },
    );
  } else if (req.body.__action === 'course_permissions_update_role') {
    if (
      idsEqual(req.body.user_id, res.locals.user.user_id) &&
      !res.locals.authz_data.is_administrator
    ) {
      return next(error.make(403, 'Owners cannot change their own course content access'));
    }

    if (
      idsEqual(req.body.user_id, res.locals.authn_user.user_id) &&
      !res.locals.authz_data.is_administrator
    ) {
      return next(
        error.make(
          403,
          'Owners cannot change their own course content access even if they are emulating another user',
        ),
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
    sqldb.call('course_permissions_update_role', params, (err, _result) => {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else if (req.body.__action === 'course_permissions_delete') {
    if (
      idsEqual(req.body.user_id, res.locals.user.user_id) &&
      !res.locals.authz_data.is_administrator
    ) {
      return next(error.make(403, 'Owners cannot remove themselves from the course staff'));
    }

    if (
      idsEqual(req.body.user_id, res.locals.authn_user.user_id) &&
      !res.locals.authz_data.is_administrator
    ) {
      return next(
        error.make(
          403,
          'Owners cannot remove themselves from the course staff even if they are emulating another user',
        ),
      );
    }

    const params = [
      res.locals.course.id,
      req.body.user_id,
      res.locals.authz_data.authn_user.user_id,
    ];
    sqldb.call('course_permissions_delete', params, (err, _result) => {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else if (req.body.__action === 'course_instance_permissions_update_role_or_delete') {
    // Again, we could make some effort to verify that the user is still a
    // member of the course staff and that they still have student data access
    // in the given course instance. We choose not to do this for the same
    // reason as above (see handler for course_permissions_update_role).

    if (req.body.course_instance_id) {
      if (
        !res.locals.authz_data.course_instances.find((ci) =>
          idsEqual(ci.id, req.body.course_instance_id),
        )
      ) {
        return next(error.make(400, `Invalid requested course instance role`));
      }
    } else {
      return next(error.make(400, `Undefined course instance id`));
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
      sqldb.call('course_instance_permissions_update_role', params, (err, _result) => {
        if (ERR(err, next)) return;
        res.redirect(req.originalUrl);
      });
    } else {
      // In this case, we delete the course instance permission
      const params = [
        res.locals.course.id,
        req.body.user_id,
        req.body.course_instance_id,
        res.locals.authz_data.authn_user.user_id,
      ];
      sqldb.call('course_instance_permissions_delete', params, (err, _result) => {
        if (ERR(err, next)) return;
        res.redirect(req.originalUrl);
      });
    }
  } else if (req.body.__action === 'course_instance_permissions_insert') {
    // Again, we could make some effort to verify that the user is still a
    // member of the course staff. We choose not to do this for the same
    // reason as above (see handler for course_permissions_update_role).

    if (req.body.course_instance_id) {
      if (
        !res.locals.authz_data.course_instances.find((ci) =>
          idsEqual(ci.id, req.body.course_instance_id),
        )
      ) {
        return next(error.make(400, `Invalid requested course instance role`));
      }
    } else {
      return next(error.make(400, `Undefined course instance id`));
    }

    const params = [
      res.locals.course.id,
      req.body.user_id,
      req.body.course_instance_id,
      'Student Data Viewer',
      res.locals.authz_data.authn_user.user_id,
    ];
    sqldb.call('course_instance_permissions_insert', params, (err, _result) => {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else if (req.body.__action === 'delete_non_owners') {
    debug('Delete non-owners');
    const params = [res.locals.course.id, res.locals.authz_data.authn_user.user_id];
    sqldb.call('course_permissions_delete_non_owners', params, (err, _result) => {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else if (req.body.__action === 'delete_no_access') {
    debug('Delete users with no access');
    const params = [res.locals.course.id, res.locals.authz_data.authn_user.user_id];
    sqldb.call('course_permissions_delete_users_without_access', params, (err, _result) => {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else if (req.body.__action === 'remove_all_student_data_access') {
    debug('Remove all student data access');
    const params = [res.locals.course.id, res.locals.authz_data.authn_user.user_id];
    sqldb.call('course_instance_permissions_delete_all', params, (err, _result) => {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else {
    return next(
      error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      }),
    );
  }
});

module.exports = router;
