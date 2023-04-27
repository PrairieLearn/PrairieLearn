const ERR = require('async-stacktrace');
const _ = require('lodash');
const async = require('async');

const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const { parseISO, isValid } = require('date-fns');
const { config } = require('../lib/config');
const error = require('@prairielearn/error');
const sqldb = require('@prairielearn/postgres');
const { idsEqual } = require('../lib/id');

const sql = sqldb.loadSqlEquiv(__filename);

module.exports = function (req, res, next) {
  const isCourseInstance = Boolean(req.params.course_instance_id);

  async.series(
    [
      (callback) => {
        // Note that req.params.course_id and req.params.course_instance_id are strings and not
        // numbers - this is why we can use the pattern "id || null" to check if they exist.
        //
        // We allow unit tests to override the req_mode. Unit tests may also override
        // the user (middlewares/authn.js) and the req_date (middlewares/date.js).
        const params = {
          user_id: res.locals.authn_user.user_id,
          course_id: req.params.course_id || null,
          course_instance_id: req.params.course_instance_id || null,
          is_administrator: res.locals.is_administrator,
          allow_example_course_override: true,
          ip: req.ip,
          req_date: res.locals.req_date,
          req_mode:
            config.authType === 'none' && req.cookies.pl_test_mode
              ? req.cookies.pl_test_mode
              : null,
          req_course_role: null,
          req_course_instance_role: null,
        };

        if (params.course_id == null && params.course_instance_id == null) {
          callback(
            error.make(403, 'Access denied (both course_id and course_instance_id are null)')
          );
        }

        sqldb.queryZeroOrOneRow(sql.select_authz_data, params, function (err, result) {
          if (ERR(err, callback)) return;
          if (result.rowCount === 0) return callback(error.make(403, 'Access denied'));

          // Now that we know the user has access, parse the authz data
          res.locals.course = result.rows[0].course;
          res.locals.institution = result.rows[0].institution;
          const authn_courses = result.rows[0].courses || [];
          const authn_course_instances = result.rows[0].course_instances || [];
          const permissions_course = result.rows[0].permissions_course;
          res.locals.authz_data = {
            authn_user: _.cloneDeep(res.locals.authn_user),
            authn_mode: result.rows[0].mode,
            authn_is_administrator: res.locals.is_administrator,
            authn_course_role: permissions_course.course_role,
            authn_has_course_permission_preview: permissions_course.has_course_permission_preview,
            authn_has_course_permission_view: permissions_course.has_course_permission_view,
            authn_has_course_permission_edit: permissions_course.has_course_permission_edit,
            authn_has_course_permission_own: permissions_course.has_course_permission_own,
            authn_courses: authn_courses,
            authn_course_instances: authn_course_instances,
            user: _.cloneDeep(res.locals.authn_user),
            mode: result.rows[0].mode,
            is_administrator: res.locals.is_administrator,
            course_role: permissions_course.course_role,
            has_course_permission_preview: permissions_course.has_course_permission_preview,
            has_course_permission_view: permissions_course.has_course_permission_view,
            has_course_permission_edit: permissions_course.has_course_permission_edit,
            has_course_permission_own: permissions_course.has_course_permission_own,
            courses: authn_courses,
            course_instances: authn_course_instances,
            editable_courses: authn_courses.filter(
              (course) => course.permissions_course.has_course_permission_edit
            ),
          };
          res.locals.user = res.locals.authz_data.user;
          if (isCourseInstance) {
            res.locals.course_instance = result.rows[0].course_instance;
            const permissions_course_instance = result.rows[0].permissions_course_instance;
            res.locals.authz_data.authn_course_instance_role =
              permissions_course_instance.course_instance_role;
            res.locals.authz_data.authn_has_course_instance_permission_view =
              permissions_course_instance.has_course_instance_permission_view;
            res.locals.authz_data.authn_has_course_instance_permission_edit =
              permissions_course_instance.has_course_instance_permission_edit;
            res.locals.authz_data.authn_has_student_access =
              permissions_course_instance.has_student_access;
            res.locals.authz_data.authn_has_student_access_with_enrollment =
              permissions_course_instance.has_student_access_with_enrollment;
            res.locals.authz_data.course_instance_role =
              permissions_course_instance.course_instance_role;
            res.locals.authz_data.has_course_instance_permission_view =
              permissions_course_instance.has_course_instance_permission_view;
            res.locals.authz_data.has_course_instance_permission_edit =
              permissions_course_instance.has_course_instance_permission_edit;
            res.locals.authz_data.has_student_access_with_enrollment =
              permissions_course_instance.has_student_access_with_enrollment;
            res.locals.authz_data.has_student_access =
              permissions_course_instance.has_student_access;
          }

          debug('authn user is authorized');

          callback(null);
        });
      },
    ],
    (err) => {
      if (ERR(err, next)) return;

      // Check if it is necessary to request a user data override - if not, return
      let overrides = [];
      if (req.cookies.pl_requested_uid) {
        // If the requested uid is the same as the authn user uid, then silently clear the cookie and continue
        if (req.cookies.pl_requested_uid === res.locals.authn_user.uid) {
          res.clearCookie('pl_requested_uid');
        } else {
          overrides.push({
            name: 'UID',
            value: req.cookies.pl_requested_uid,
            cookie: 'pl_requested_uid',
          });
        }
      }
      if (req.cookies.pl_requested_course_role) {
        overrides.push({
          name: 'Course role',
          value: req.cookies.pl_requested_course_role,
          cookie: 'pl_requested_course_role',
        });
      }
      if (req.cookies.pl_requested_course_instance_role) {
        overrides.push({
          name: 'Course instance role',
          value: req.cookies.pl_requested_course_instance_role,
          cookie: 'pl_requested_course_instance_role',
        });
      }
      if (req.cookies.pl_requested_mode) {
        overrides.push({
          name: 'Mode',
          value: req.cookies.pl_requested_mode,
          cookie: 'pl_requested_mode',
        });
      }
      if (req.cookies.pl_requested_date) {
        overrides.push({
          name: 'Date',
          value: req.cookies.pl_requested_date,
          cookie: 'pl_requested_date',
        });
      }
      if (overrides.length === 0) {
        debug('no requested overrides');
        return next();
      }

      // Cannot request a user data override without instructor permissions
      if (
        !(
          res.locals.authz_data.authn_has_course_permission_preview ||
          res.locals.authz_data.authn_has_course_instance_permission_view
        )
      ) {
        debug('requested overrides, but authn user does not have instructor permissions');

        // If on a student page route, silently exit and ignore effective user requests
        if ((res.locals.viewType || 'none') === 'student') {
          debug('on student page, so silently exit and ignore requested overrides');
          return next();
        }

        debug('not on student page, so clear all requested overrides and throw an error');

        overrides.forEach((override) => {
          debug(`clearing cookie: ${override.cookie}`);
          res.clearCookie(override.cookie);
        });

        let err = error.make(403, 'Access denied');
        err.info =
          `<p>You must be a member of the course staff in order to change the effective user. ` +
          `All requested changes to the effective user have been removed.</p>`;
        return next(err);
      }

      // We are trying to override the user data.
      debug('trying to override the user data');
      debug(req.cookies);

      let user = res.locals.authz_data.user;
      let is_administrator = res.locals.is_administrator;
      let user_with_requested_uid_has_instructor_access_to_course_instance = false;

      async.series(
        [
          (callback) => {
            // Verify course instance
            if (!isCourseInstance) return callback(null);

            // Verify student access
            if (!res.locals.authz_data.authn_has_student_access) return callback(null);

            // Verify non-enrollment
            if (res.locals.authz_data.authn_has_student_access_with_enrollment) {
              return callback(null);
            }

            // Enroll authenticated user in course instance
            const params = {
              course_instance_id: res.locals.course_instance.id,
              user_id: user.user_id,
            };
            sqldb.query(sql.ensure_enrollment, params, function (err, _result) {
              if (ERR(err, callback)) return;
              callback(null);
            });
          },
          (callback) => {
            // Verify requested UID
            if (!req.cookies.pl_requested_uid) return callback(null);

            const params = {
              uid: req.cookies.pl_requested_uid,
              course_instance_id: isCourseInstance ? res.locals.course_instance.id : null,
            };

            sqldb.queryZeroOrOneRow(sql.select_user, params, function (err, result) {
              // Something went wrong - immediately return with error
              if (ERR(err, callback)) return;

              // No user was found - remove all override cookies and return with error
              if (result.rowCount === 0) {
                overrides.forEach((override) => {
                  debug(`clearing cookie: ${override.cookie}`);
                  res.clearCookie(override.cookie);
                });

                let err = error.make(403, 'Access denied');
                err.info =
                  `<p>You have tried to change the effective user to one with uid ` +
                  `<code>${req.cookies.pl_requested_uid}</code>, when no such user exists. ` +
                  `All requested changes to the effective user have been removed.</p>`;

                if (config.devMode && is_administrator) {
                  err.info +=
                    `<div class="alert alert-warning" role="alert"><p>In Development Mode, ` +
                    `<a href="/pl/administrator/query/select_or_insert_user">go here to add the user</a> ` +
                    ` first and then try the emulation again.</p>`;
                  if (isCourseInstance) {
                    err.info +=
                      `<p>To auto-generate many users for testing, see ` +
                      `<a href="/pl/administrator/query/generate_and_enroll_users">Generate random users ` +
                      `and enroll them in a course instance<a> <br>` +
                      `(Hint your course_instance_id is <strong>${res.locals.course_instance.id}</strong>)</p>`;
                  }
                  err.info += `</div>`;
                }
                return callback(err);
              }

              // The effective user is an administrator and the authn user is not - remove
              // all override cookies and return with error
              if (result.rows[0].is_administrator && !is_administrator) {
                overrides.forEach((override) => {
                  debug(`clearing cookie: ${override.cookie}`);
                  res.clearCookie(override.cookie);
                });

                let err = error.make(403, 'Access denied');
                err.info =
                  `<p>You have tried to change the effective user to one who is an ` +
                  `administrator, when you are not an administrator. ` +
                  `All requested changes to the effective user have been removed.</p>`;
                return callback(err);
              }

              user = _.cloneDeep(result.rows[0].user);
              is_administrator = result.rows[0].is_administrator;
              user_with_requested_uid_has_instructor_access_to_course_instance =
                result.rows[0].is_instructor;
              debug(
                `requested uid has instructor access: ${user_with_requested_uid_has_instructor_access_to_course_instance}`
              );

              // FIXME: also override institution?
              return callback(null);
            });
          },
          (callback) => {
            let req_date = res.locals.req_date;
            if (req.cookies.pl_requested_date) {
              req_date = parseISO(req.cookies.pl_requested_date);
              if (!isValid(req_date)) {
                debug(`requested date is invalid: ${req.cookies.pl_requested_date}, ${req_date}`);
                overrides.forEach((override) => {
                  debug(`clearing cookie: ${override.cookie}`);
                  res.clearCookie(override.cookie);
                });

                let err = error.make(403, 'Access denied');
                err.info =
                  `<p>You have requested an invalid effective date: <code>${req.cookies.pl_requested_date}</code>. ` +
                  `All requested changes to the effective user have been removed.</p>`;
                return callback(err);
              }

              debug(`effective req_date = ${req_date}`);
            }

            const params = {
              user_id: user.user_id,
              course_id: req.params.course_id || null,
              course_instance_id: req.params.course_instance_id || null,
              is_administrator: is_administrator,
              allow_example_course_override: false,
              ip: req.ip,
              req_date: req_date,
              req_mode: req.cookies.pl_requested_mode || res.locals.authz_data.mode,
              req_course_role: req.cookies.pl_requested_course_role || null,
              req_course_instance_role: req.cookies.pl_requested_course_instance_role || null,
            };

            sqldb.queryZeroOrOneRow(sql.select_authz_data, params, function (err, result) {
              if (ERR(err, callback)) return;

              // If the authn user were denied access, then we would return an error. Here,
              // we simply return (without error). This allows the authn user to keep access
              // to pages (e.g., the effective user page) for which only authn permissions
              // are required.
              if (result.rowCount === 0) {
                debug(`effective user was denied access`);

                res.locals.authz_data.user = user;
                res.locals.authz_data.is_administrator = false;

                res.locals.authz_data.course_role = 'None';
                res.locals.authz_data.has_course_permission_preview = false;
                res.locals.authz_data.has_course_permission_view = false;
                res.locals.authz_data.has_course_permission_edit = false;
                res.locals.authz_data.has_course_permission_own = false;

                res.locals.authz_data.courses = [];
                res.locals.authz_data.course_instances = [];
                res.locals.authz_data.editable_courses = [];

                if (isCourseInstance) {
                  res.locals.authz_data.course_instance_role = 'None';
                  res.locals.authz_data.has_course_instance_permission_view = false;
                  res.locals.authz_data.has_course_instance_permission_edit = false;
                  res.locals.authz_data.has_student_access = false;
                  res.locals.authz_data.has_student_access_with_enrollment = false;

                  if (res.locals.authz_data.user.uid !== res.locals.authz_data.authn_user.uid) {
                    res.locals.authz_data.user_with_requested_uid_has_instructor_access_to_course_instance =
                      user_with_requested_uid_has_instructor_access_to_course_instance;
                  }
                }

                res.locals.authz_data.overrides = overrides;

                res.locals.user = res.locals.authz_data.user;
                res.locals.is_administrator = res.locals.authz_data.is_administrator;

                res.locals.authz_data.mode = params.req_mode;
                res.locals.req_date = req_date;

                return callback(null);
              }

              // Now that we know the effective user has access, parse the authz data

              // The effective user is a Previewer and the authn_user is not - remove
              // all override cookies and return with error
              if (
                !res.locals.authz_data.authn_has_course_permission_preview &&
                result.rows[0].permissions_course.has_course_permission_preview
              ) {
                overrides.forEach((override) => {
                  debug(`clearing cookie: ${override.cookie}`);
                  res.clearCookie(override.cookie);
                });

                let err = error.make(403, 'Access denied');
                err.info =
                  `<p>You have tried to change the effective user to one who is a ` +
                  `course previewer, when you are not a course previewer. ` +
                  `All requested changes to the effective user have been removed.</p>`;
                return callback(err);
              }

              // The effective user is a Viewer and the authn_user is not - remove
              // all override cookies and return with error
              if (
                !res.locals.authz_data.authn_has_course_permission_view &&
                result.rows[0].permissions_course.has_course_permission_view
              ) {
                overrides.forEach((override) => {
                  debug(`clearing cookie: ${override.cookie}`);
                  res.clearCookie(override.cookie);
                });

                let err = error.make(403, 'Access denied');
                err.info =
                  `<p>You have tried to change the effective user to one who is a ` +
                  `course viewer, when you are not a course viewer. ` +
                  `All requested changes to the effective user have been removed.</p>`;
                return callback(err);
              }

              // The effective user is an Editor and the authn_user is not - remove
              // all override cookies and return with error
              if (
                !res.locals.authz_data.authn_has_course_permission_edit &&
                result.rows[0].permissions_course.has_course_permission_edit
              ) {
                overrides.forEach((override) => {
                  debug(`clearing cookie: ${override.cookie}`);
                  res.clearCookie(override.cookie);
                });

                let err = error.make(403, 'Access denied');
                err.info =
                  `<p>You have tried to change the effective user to one who is a ` +
                  `course editor, when you are not a course editor. ` +
                  `All requested changes to the effective user have been removed.</p>`;
                return callback(err);
              }

              // The effective user is an Owner and the authn_user is not - remove
              // all override cookies and return with error
              if (
                !res.locals.authz_data.authn_has_course_permission_own &&
                result.rows[0].permissions_course.has_course_permission_own
              ) {
                overrides.forEach((override) => {
                  debug(`clearing cookie: ${override.cookie}`);
                  res.clearCookie(override.cookie);
                });

                let err = error.make(403, 'Access denied');
                err.info =
                  `<p>You have tried to change the effective user to one who is a ` +
                  `course owner, when you are not a course owner. ` +
                  `All requested changes to the effective user have been removed.</p>`;
                return callback(err);
              }

              if (isCourseInstance) {
                // The effective user is a Student Data Viewer and the authn_user is not -
                // remove all override cookies and return with error
                if (
                  !res.locals.authz_data.authn_has_course_instance_permission_view &&
                  result.rows[0].permissions_course_instance.has_course_instance_permission_view
                ) {
                  overrides.forEach((override) => {
                    debug(`clearing cookie: ${override.cookie}`);
                    res.clearCookie(override.cookie);
                  });

                  let err = error.make(403, 'Access denied');
                  err.info =
                    `<p>You have tried to change the effective user to one who can view ` +
                    `student data in the course instance <code>${res.locals.course_instance.short_name}</code>, when ` +
                    `you do not have permission to view these student data. ` +
                    `All requested changes to the effective user have been removed.</p>`;
                  return callback(err);
                }

                // The effective user is a Student Data Editor and the authn_user is not -
                // remove all override cookies and return with error
                if (
                  !res.locals.authz_data.authn_has_course_instance_permission_edit &&
                  result.rows[0].permissions_course_instance.has_course_instance_permission_edit
                ) {
                  overrides.forEach((override) => {
                    debug(`clearing cookie: ${override.cookie}`);
                    res.clearCookie(override.cookie);
                  });

                  let err = error.make(403, 'Access denied');
                  err.info =
                    `<p>You have tried to change the effective user to one who can edit ` +
                    `student data in the course instance <code>${res.locals.course_instance.short_name}</code>, when ` +
                    `you do not have permission to edit these student data. ` +
                    `All requested changes to the effective user have been removed.</p>`;
                  return callback(err);
                }

                // The effective user is a student (with no course or course instance role prior to
                // other overrides) with a different UID than the authn user (note UID is unique), and
                // the authn user is not a Student Data Editor - remove all override cookies and return
                // with error
                if (
                  user.uid !== res.locals.authn_user.uid && // effective uid is not the same as authn uid
                  result.rows[0].permissions_course_instance.has_student_access_with_enrollment && // effective user is enrolled with access
                  !user_with_requested_uid_has_instructor_access_to_course_instance && // effective user is not an instructor (i.e., is a student)
                  !res.locals.authz_data.authn_has_course_instance_permission_edit
                ) {
                  // authn user is not a Student Data Editor
                  debug('cannot emulate student if not student data editor');
                  overrides.forEach((override) => {
                    debug(`clearing cookie: ${override.cookie}`);
                    res.clearCookie(override.cookie);
                  });

                  let err = error.make(403, 'Access denied');
                  err.info =
                    `<p>You have tried to change the effective user to one who is a student in the ` +
                    `course instance <code>${res.locals.course_instance.short_name}</code>, when ` +
                    `you do not have permission to edit student data in this course instance. ` +
                    `All requested changes to the effective user have been removed.</p>`;
                  return callback(err);
                }
              }

              res.locals.authz_data.user = user;
              res.locals.authz_data.is_administrator = is_administrator;
              res.locals.authz_data.course_role = result.rows[0].permissions_course.course_role;
              res.locals.authz_data.has_course_permission_preview =
                result.rows[0].permissions_course.has_course_permission_preview;
              res.locals.authz_data.has_course_permission_view =
                result.rows[0].permissions_course.has_course_permission_view;
              res.locals.authz_data.has_course_permission_edit =
                result.rows[0].permissions_course.has_course_permission_edit;
              res.locals.authz_data.has_course_permission_own =
                result.rows[0].permissions_course.has_course_permission_own;

              // Effective users are confined to one course, so we discard all other
              // courses from the list of those to which the effective user has staff
              // access.
              //
              // Note that courses[0].permissions_course and course.permissions_course
              // will not, in general, be the same. Requested course and course instance
              // roles are ignored when generating the former but not when generating
              // the latter. So, we also replace permissions_course for the course that
              // remains in the list (the current course) with what it should be.
              //
              // We then update editable_courses as usual.
              res.locals.authz_data.courses = (result.rows[0].courses || []).filter((course) =>
                idsEqual(course.id, result.rows[0].course.id)
              );
              res.locals.authz_data.courses.forEach(
                (course) =>
                  (course.permissions_course = _.cloneDeep(result.rows[0].permissions_course))
              );
              res.locals.authz_data.editable_courses = res.locals.authz_data.courses.filter(
                (course) => course.permissions_course.has_course_permission_edit
              );

              // Use the course_instances for the effective user, but keeping only
              // those ones for which the authn user also has access.
              res.locals.authz_data.course_instances = result.rows[0].course_instances || [];
              res.locals.authz_data.course_instances =
                res.locals.authz_data.course_instances.filter((ci) =>
                  res.locals.authz_data.authn_course_instances.some((authn_ci) =>
                    idsEqual(authn_ci.id, ci.id)
                  )
                );

              if (isCourseInstance) {
                res.locals.authz_data.course_instance_role =
                  result.rows[0].permissions_course_instance.course_instance_role;
                res.locals.authz_data.has_course_instance_permission_view =
                  result.rows[0].permissions_course_instance.has_course_instance_permission_view;
                res.locals.authz_data.has_course_instance_permission_edit =
                  result.rows[0].permissions_course_instance.has_course_instance_permission_edit;
                res.locals.authz_data.has_student_access =
                  result.rows[0].permissions_course_instance.has_student_access;
                res.locals.authz_data.has_student_access_with_enrollment =
                  result.rows[0].permissions_course_instance.has_student_access_with_enrollment;

                if (!idsEqual(user.user_id, res.locals.authn_user.user_id)) {
                  res.locals.authz_data.user_with_requested_uid_has_instructor_access_to_course_instance =
                    user_with_requested_uid_has_instructor_access_to_course_instance;
                }
              }

              res.locals.authz_data.overrides = overrides;

              res.locals.user = res.locals.authz_data.user;
              res.locals.is_administrator = res.locals.authz_data.is_administrator;

              res.locals.authz_data.mode = result.rows[0].mode;
              res.locals.req_date = req_date;

              return callback(null);
            });
          },
        ],
        (err) => {
          if (ERR(err, next)) return;
          next();
        }
      );
    }
  );
};
