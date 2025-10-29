import { isValid, parseISO } from 'date-fns';
import debugfn from 'debug';
import { type Request, type Response } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import { AugmentedError, HttpStatusError } from '@prairielearn/error';
import { html } from '@prairielearn/html';
import * as sqldb from '@prairielearn/postgres';

import type { ResLocalsAuthnUser } from '../lib/authn.types.js';
import { buildAuthzData, selectAuthzData } from '../lib/authzData.js';
import type { FullAuthzDataSchema } from '../lib/authzData.types.js';
import { config } from '../lib/config.js';
import { clearCookie } from '../lib/cookie.js';
import { InstitutionSchema, UserSchema } from '../lib/db-types.js';
import { features } from '../lib/features/index.js';
import { idsEqual } from '../lib/id.js';
import { selectCourseHasCourseInstances } from '../models/course-instances.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const debug = debugfn('prairielearn:authzCourseOrInstance');

interface Override {
  name: string;
  value: string;
  cookie: string;
}

type FullAuthzData = z.infer<typeof FullAuthzDataSchema>;

/**
 * Removes all override cookies from the response.
 */
function clearOverrideCookies(res: Response, overrides: Override[]) {
  overrides.forEach((override) => {
    debug(`clearing cookie: ${override.cookie}`);
    const newName = override.cookie.replace(/^pl2_/, 'pl_');
    clearCookie(res, [override.cookie, newName]);
  });
}

const SelectUserSchema = z.object({
  user: UserSchema,
  institution: InstitutionSchema,
  is_administrator: z.boolean(),
  is_instructor: z.boolean(),
});

interface ResLocalsCourseAuthz {
  authn_user: ResLocalsAuthnUser['authn_user'];
  authn_mode: FullAuthzData['mode'];
  authn_mode_reason: FullAuthzData['mode_reason'];
  authn_is_administrator: ResLocalsAuthnUser['is_administrator'];
  authn_course_role: FullAuthzData['permissions_course']['course_role'];
  authn_has_course_permission_preview: FullAuthzData['permissions_course']['has_course_permission_preview'];
  authn_has_course_permission_view: FullAuthzData['permissions_course']['has_course_permission_view'];
  authn_has_course_permission_edit: FullAuthzData['permissions_course']['has_course_permission_edit'];
  authn_has_course_permission_own: FullAuthzData['permissions_course']['has_course_permission_own'];
  user: ResLocalsAuthnUser['authn_user'];
  mode: FullAuthzData['mode'];
  mode_reason: FullAuthzData['mode_reason'];
  is_administrator: ResLocalsAuthnUser['is_administrator'];
  course_role: FullAuthzData['permissions_course']['course_role'];
  has_course_permission_preview: FullAuthzData['permissions_course']['has_course_permission_preview'];
  has_course_permission_view: FullAuthzData['permissions_course']['has_course_permission_view'];
  has_course_permission_edit: FullAuthzData['permissions_course']['has_course_permission_edit'];
  has_course_permission_own: FullAuthzData['permissions_course']['has_course_permission_own'];
  overrides: Override[];
}

interface ResLocalsCourseInstanceAuthz extends ResLocalsCourseAuthz {
  authn_course_instance_role: FullAuthzData['permissions_course_instance']['course_instance_role'];
  authn_has_course_instance_permission_view: FullAuthzData['permissions_course_instance']['has_course_instance_permission_view'];
  authn_has_course_instance_permission_edit: FullAuthzData['permissions_course_instance']['has_course_instance_permission_edit'];
  authn_has_student_access: FullAuthzData['permissions_course_instance']['has_student_access'];
  authn_has_student_access_with_enrollment: FullAuthzData['permissions_course_instance']['has_student_access_with_enrollment'];
  course_instance_role: FullAuthzData['permissions_course_instance']['course_instance_role'];
  has_course_instance_permission_view: FullAuthzData['permissions_course_instance']['has_course_instance_permission_view'];
  has_course_instance_permission_edit: FullAuthzData['permissions_course_instance']['has_course_instance_permission_edit'];
  has_student_access_with_enrollment: FullAuthzData['permissions_course_instance']['has_student_access_with_enrollment'];
  has_student_access: FullAuthzData['permissions_course_instance']['has_student_access'];
  user_with_requested_uid_has_instructor_access_to_course_instance: boolean;
}

export interface ResLocalsCourse {
  course: FullAuthzData['course'];
  institution: FullAuthzData['institution'];
  side_nav_expanded: boolean;
  authz_data: ResLocalsCourseAuthz;
  user: ResLocalsCourseAuthz['user'];
  course_has_course_instances: boolean;
  has_enhanced_navigation: boolean;
  question_sharing_enabled: boolean;
}

export interface ResLocalsCourseInstance extends ResLocalsCourse {
  course_instance: NonNullable<FullAuthzData['course_instance']>;
  authz_data: ResLocalsCourseInstanceAuthz;
  user: ResLocalsCourseInstanceAuthz['user'];
}

export async function authzCourseOrInstance(req: Request, res: Response) {
  if (!req.params.course_id && !req.params.course_instance_id) {
    throw new HttpStatusError(
      403,
      'Access denied (both course_id and course_instance_id are null)',
    );
  }

  const { authzData, authzCourse, authzInstitution, authzCourseInstance } = await buildAuthzData({
    authn_user: res.locals.authn_user,
    // Note that req.params.course_id and req.params.course_instance_id are strings and not
    // numbers - this is why we can use the pattern "id || null" to check if they exist.
    course_id: req.params.course_id || null,
    course_instance_id: req.params.course_instance_id || null,
    is_administrator: res.locals.is_administrator,
    ip: req.ip || null,
    req_date: res.locals.req_date,
    // We allow unit tests to override the req_mode. Unit tests may also override
    // the user (middlewares/authn.ts) and the req_date (middlewares/date.ts).
    req_mode: config.devMode && req.cookies.pl_test_mode ? req.cookies.pl_test_mode : null,
  });

  if (authzData === null) {
    throw new HttpStatusError(403, 'Access denied');
  }

  debug('authn user is authorized');
  res.locals.authz_data = authzData;
  res.locals.course = authzCourse;
  res.locals.institution = authzInstitution;
  res.locals.user = authzData.user;
  if (req.params.course_instance_id) {
    res.locals.course_instance = authzCourseInstance;
  }
  // The session middleware does not run for API requests.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  res.locals.side_nav_expanded = req.session?.side_nav_expanded ?? true; // The side nav is expanded by default.

  res.locals.course_has_course_instances = await selectCourseHasCourseInstances({
    course: res.locals.course,
  });

  const usesLegacyNavigation = await features.enabledFromLocals('legacy-navigation', res.locals);
  res.locals.has_enhanced_navigation = !usesLegacyNavigation;
  res.locals.question_sharing_enabled = await features.enabledFromLocals(
    'question-sharing',
    res.locals,
  );

  // Check if it is necessary to request a user data override - if not, return
  const overrides: Override[] = [];
  if (req.cookies.pl2_requested_uid) {
    // If the requested uid is the same as the authn user uid, then silently clear the cookie and continue
    if (req.cookies.pl2_requested_uid === res.locals.authn_user.uid) {
      clearCookie(res, ['pl_requested_uid', 'pl2_requested_uid']);
    } else {
      overrides.push({
        name: 'UID',
        value: req.cookies.pl2_requested_uid,
        cookie: 'pl2_requested_uid',
      });
    }
  }
  if (req.cookies.pl2_requested_course_role) {
    overrides.push({
      name: 'Course role',
      value: req.cookies.pl2_requested_course_role,
      cookie: 'pl2_requested_course_role',
    });
  }
  if (req.cookies.pl2_requested_course_instance_role) {
    overrides.push({
      name: 'Course instance role',
      value: req.cookies.pl2_requested_course_instance_role,
      cookie: 'pl2_requested_course_instance_role',
    });
  }
  if (req.cookies.pl2_requested_date) {
    overrides.push({
      name: 'Date',
      value: req.cookies.pl2_requested_date,
      cookie: 'pl2_requested_date',
    });
  }
  if (overrides.length === 0) {
    debug('no requested overrides');
    return;
  }

  // If this is an example course, only allow overrides if the user is an administrator.
  if (res.locals.course.example_course && !res.locals.is_administrator) {
    clearOverrideCookies(res, overrides);

    throw new AugmentedError('Access denied', {
      status: 403,
      info: html`
        <p>
          You are not allowed to request an effective user in the example course unless you are an
          administrator or you are running PrairieLearn in development mode. All requested changes
          to the effective user have been removed.
        </p>
      `,
    });
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
      return;
    }

    debug('not on student page, so clear all requested overrides and throw an error');
    clearOverrideCookies(res, overrides);

    throw new AugmentedError('Access denied', {
      status: 403,
      info: html`
        <p>
          You must be a member of the course staff in order to change the effective user. All
          requested changes to the effective user have been removed.
        </p>
      `,
    });
  }

  // We are trying to override the user data.
  debug('trying to override the user data');
  debug(req.cookies);

  let user = res.locals.authz_data.user;
  let is_administrator = res.locals.is_administrator;
  let user_with_requested_uid_has_instructor_access_to_course_instance = false;

  // Verify requested UID
  if (req.cookies.pl2_requested_uid) {
    const userData = await sqldb.queryOptionalRow(
      sql.select_user,
      {
        uid: req.cookies.pl2_requested_uid,
        course_instance_id: req.params.course_instance_id ? res.locals.course_instance.id : null,
      },
      SelectUserSchema,
    );

    // No user was found - remove all override cookies and return with error
    if (userData === null) {
      clearOverrideCookies(res, overrides);

      throw new AugmentedError('Access denied', {
        status: 403,
        info: html`
          <p>
            You have tried to change the effective user to one with uid
            <code>${req.cookies.pl2_requested_uid}</code>, when no such user exists. All requested
            changes to the effective user have been removed.
          </p>
          ${config.devMode && is_administrator
            ? html`
                <div class="alert alert-warning" role="alert">
                  In Development Mode,
                  <a href="/pl/administrator/query/select_or_insert_user">
                    go here to add the user
                  </a>
                  first and then try the emulation again.
                </div>
                ${req.params.course_instance_id
                  ? html`
                      <p>
                        To auto-generate many users for testing, see
                        <a href="/pl/administrator/query/generate_and_enroll_users"
                          >Generate random users and enroll them in a course instance</a
                        >
                        <br />
                        (Hint your course_instance_id is
                        <strong>${res.locals.course_instance.id}</strong>)
                      </p>
                    `
                  : ''}
              `
            : ''}
        `,
      });
    }

    // The effective user is an administrator and the authn user is not - remove
    // all override cookies and return with error
    if (userData.is_administrator && !is_administrator) {
      clearOverrideCookies(res, overrides);

      throw new AugmentedError('Access denied', {
        status: 403,
        info: html`
          <p>
            You have tried to change the effective user to one who is an administrator, when you are
            not an administrator. All requested changes to the effective user have been removed.
          </p>
        `,
      });
    }

    user = structuredClone(userData.user);
    is_administrator = userData.is_administrator;
    user_with_requested_uid_has_instructor_access_to_course_instance = userData.is_instructor;
    debug(
      `requested uid has instructor access: ${user_with_requested_uid_has_instructor_access_to_course_instance}`,
    );

    // FIXME: also override institution?
  }

  let req_date = res.locals.req_date;
  if (req.cookies.pl2_requested_date) {
    req_date = parseISO(req.cookies.pl2_requested_date);
    if (!isValid(req_date)) {
      debug(`requested date is invalid: ${req.cookies.pl2_requested_date}, ${req_date}`);
      clearOverrideCookies(res, overrides);

      throw new AugmentedError('Access denied', {
        status: 403,
        info: html`
          <p>
            You have requested an invalid effective date:
            <code>${req.cookies.pl2_requested_date}</code>. All requested changes to the effective
            user have been removed.
          </p>
        `,
      });
    }

    debug(`effective req_date = ${req_date}`);
  }

  const effectiveAuthzData = await selectAuthzData({
    user_id: user.user_id,
    course_id: req.params.course_id || null,
    course_instance_id: req.params.course_instance_id || null,
    is_administrator,
    allow_example_course_override: false,
    ip: req.ip || null,
    req_date,
    req_mode: res.locals.authz_data.mode,
    req_course_role: req.cookies.pl2_requested_course_role || null,
    req_course_instance_role: req.cookies.pl2_requested_course_instance_role || null,
  });

  // If the authn user were denied access, then we would return an error. Here,
  // we simply return (without error). This allows the authn user to keep access
  // to pages (e.g., the effective user page) for which only authn permissions
  // are required.
  if (effectiveAuthzData === null) {
    debug('effective user was denied access');

    res.locals.authz_data.user = user;
    res.locals.authz_data.is_administrator = false;

    res.locals.authz_data.course_role = 'None';
    res.locals.authz_data.has_course_permission_preview = false;
    res.locals.authz_data.has_course_permission_view = false;
    res.locals.authz_data.has_course_permission_edit = false;
    res.locals.authz_data.has_course_permission_own = false;

    if (req.params.course_instance_id) {
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
    // After this middleware runs, `is_administrator` is set to the effective user's
    // administrator status, and not the authn user's administrator status.
    res.locals.is_administrator = res.locals.authz_data.is_administrator;

    res.locals.req_date = req_date;
    return;
  }

  // Now that we know the effective user has access, parse the authz data

  // The effective user is a Previewer and the authn_user is not - remove
  // all override cookies and return with error
  if (
    !res.locals.authz_data.authn_has_course_permission_preview &&
    effectiveAuthzData.permissions_course.has_course_permission_preview
  ) {
    clearOverrideCookies(res, overrides);

    throw new AugmentedError('Access denied', {
      status: 403,
      info: html`
        <p>
          You have tried to change the effective user to one who is a course previewer, when you are
          not a course previewer. All requested changes to the effective user have been removed.
        </p>
      `,
    });
  }

  // The effective user is a Viewer and the authn_user is not - remove
  // all override cookies and return with error
  if (
    !res.locals.authz_data.authn_has_course_permission_view &&
    effectiveAuthzData.permissions_course.has_course_permission_view
  ) {
    clearOverrideCookies(res, overrides);

    throw new AugmentedError('Access denied', {
      status: 403,
      info: html`
        <p>
          You have tried to change the effective user to one who is a course viewer, when you are
          not a course viewer. All requested changes to the effective user have been removed.
        </p>
      `,
    });
  }

  // The effective user is an Editor and the authn_user is not - remove
  // all override cookies and return with error
  if (
    !res.locals.authz_data.authn_has_course_permission_edit &&
    effectiveAuthzData.permissions_course.has_course_permission_edit
  ) {
    clearOverrideCookies(res, overrides);

    throw new AugmentedError('Access denied', {
      status: 403,
      info: html`
        <p>
          You have tried to change the effective user to one who is a course editor, when you are
          not a course editor. All requested changes to the effective user have been removed.
        </p>
      `,
    });
  }

  // The effective user is an Owner and the authn_user is not - remove
  // all override cookies and return with error
  if (
    !res.locals.authz_data.authn_has_course_permission_own &&
    effectiveAuthzData.permissions_course.has_course_permission_own
  ) {
    clearOverrideCookies(res, overrides);

    throw new AugmentedError('Access denied', {
      status: 403,
      info: html`
        <p>
          You have tried to change the effective user to one who is a course owner, when you are not
          a course owner. All requested changes to the effective user have been removed.
        </p>
      `,
    });
  }

  if (req.params.course_instance_id) {
    // The effective user is a Student Data Viewer and the authn_user is not -
    // remove all override cookies and return with error
    if (
      !res.locals.authz_data.authn_has_course_instance_permission_view &&
      effectiveAuthzData.permissions_course_instance.has_course_instance_permission_view
    ) {
      clearOverrideCookies(res, overrides);

      throw new AugmentedError('Access denied', {
        status: 403,
        info: html`
          <p>
            You have tried to change the effective user to one who is a student data viewer in the
            course instance <code>${res.locals.course_instance.short_name}</code>, when you are not
            a student data viewer. All requested changes to the effective user have been removed.
          </p>
        `,
      });
    }

    // The effective user is a Student Data Editor and the authn_user is not -
    // remove all override cookies and return with error
    if (
      !res.locals.authz_data.authn_has_course_instance_permission_edit &&
      effectiveAuthzData.permissions_course_instance.has_course_instance_permission_edit
    ) {
      clearOverrideCookies(res, overrides);

      throw new AugmentedError('Access denied', {
        status: 403,
        info: html`
          <p>
            You have tried to change the effective user to one who is a student data editor in the
            course instance <code>${res.locals.course_instance.short_name}</code>, when you are not
            a student data editor. All requested changes to the effective user have been removed.
          </p>
        `,
      });
    }

    // The effective user is a student (with no course or course instance role prior to
    // other overrides) with a different UID than the authn user (note UID is unique), and
    // the authn user is not a Student Data Editor - remove all override cookies and return
    // with error
    if (
      user.uid !== res.locals.authn_user.uid && // effective uid is not the same as authn uid
      effectiveAuthzData.permissions_course_instance.has_student_access_with_enrollment && // effective user is enrolled with access
      !user_with_requested_uid_has_instructor_access_to_course_instance && // effective user is not an instructor (i.e., is a student)
      !res.locals.authz_data.authn_has_course_instance_permission_edit
    ) {
      // authn user is not a Student Data Editor
      debug('cannot emulate student if not student data editor');
      clearOverrideCookies(res, overrides);

      throw new AugmentedError('Access denied', {
        status: 403,
        info: html`
          <p>
            You have tried to change the effective user to one who is a student in the course
            instance
            <code>${res.locals.course_instance.short_name}</code>, when you do not have permission
            to edit student data in this course instance. All requested changes to the effective
            user have been removed.
          </p>
        `,
      });
    }

    // The effective user is not enrolled in the course instance and is also not
    // either a course instructor or a course instance instructor - remove all
    // override cookies and return with error.
    //
    // Note that we skip this check if the effective user is the same as the
    // authenticated user, since an instructor may want to view their course
    // as a student without enrolling in their own course.
    if (
      !idsEqual(user.user_id, res.locals.authn_user.user_id) &&
      !effectiveAuthzData.permissions_course.has_course_permission_preview &&
      !effectiveAuthzData.permissions_course_instance.has_course_instance_permission_view &&
      !effectiveAuthzData.permissions_course_instance.has_student_access_with_enrollment
    ) {
      clearOverrideCookies(res, overrides);

      throw new AugmentedError('Access denied', {
        status: 403,
        info: html`
          <p>
            You have tried to change the effective user to one who is not enrolled in this course
            instance. All required changes to the effective user have been removed.
          </p>
        `,
      });
    }
  }

  res.locals.authz_data.user = user;
  res.locals.authz_data.is_administrator = is_administrator;
  res.locals.authz_data.course_role = effectiveAuthzData.permissions_course.course_role;
  res.locals.authz_data.has_course_permission_preview =
    effectiveAuthzData.permissions_course.has_course_permission_preview;
  res.locals.authz_data.has_course_permission_view =
    effectiveAuthzData.permissions_course.has_course_permission_view;
  res.locals.authz_data.has_course_permission_edit =
    effectiveAuthzData.permissions_course.has_course_permission_edit;
  res.locals.authz_data.has_course_permission_own =
    effectiveAuthzData.permissions_course.has_course_permission_own;

  if (req.params.course_instance_id) {
    res.locals.authz_data.course_instance_role =
      effectiveAuthzData.permissions_course_instance.course_instance_role;
    res.locals.authz_data.has_course_instance_permission_view =
      effectiveAuthzData.permissions_course_instance.has_course_instance_permission_view;
    res.locals.authz_data.has_course_instance_permission_edit =
      effectiveAuthzData.permissions_course_instance.has_course_instance_permission_edit;
    res.locals.authz_data.has_student_access =
      effectiveAuthzData.permissions_course_instance.has_student_access;
    res.locals.authz_data.has_student_access_with_enrollment =
      effectiveAuthzData.permissions_course_instance.has_student_access_with_enrollment;

    if (!idsEqual(user.user_id, res.locals.authn_user.user_id)) {
      res.locals.authz_data.user_with_requested_uid_has_instructor_access_to_course_instance =
        user_with_requested_uid_has_instructor_access_to_course_instance;
    }

    // If the effective user is the same as the authenticated user and the
    // effective user has not requested any specific role, we'll treat them
    // as though they're enrolled in the course instance as a student. This is
    // important because we no longer automatically enroll instructors in their
    // own course instances when they view them.
    if (
      idsEqual(user.user_id, res.locals.authn_user.user_id) &&
      !res.locals.authz_data.has_course_instance_permission_view &&
      !res.locals.authz_data.has_course_permission_view
    ) {
      res.locals.authz_data.has_student_access_with_enrollment = true;
    }
  }

  res.locals.authz_data.overrides = overrides;

  res.locals.user = res.locals.authz_data.user;
  res.locals.is_administrator = res.locals.authz_data.is_administrator;

  res.locals.authz_data.mode = effectiveAuthzData.mode;
  res.locals.authz_data.mode_reason = effectiveAuthzData.mode_reason;
  res.locals.req_date = req_date;
}

export default asyncHandler(async (req, res, next) => {
  await authzCourseOrInstance(req, res);
  next();
});
