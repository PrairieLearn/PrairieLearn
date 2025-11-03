import { isValid, parseISO } from 'date-fns';
import debugfn from 'debug';
import { type Request, type Response } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import { AugmentedError, HttpStatusError } from '@prairielearn/error';
import { html } from '@prairielearn/html';
import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import type { ResLocalsAuthnUser } from '../lib/authn.types.js';
import type { FullAuthzData } from '../lib/authz-data-lib.js';
import {
  type CalculateAuthDataSuccessResult,
  calculateAuthData,
  calculateFallbackAuthData,
} from '../lib/authz-data.js';
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

function verifyAuthnAuthResult(
  authnAuthResult: CalculateAuthDataSuccessResult['authResult'],
  viewType: 'student' | 'instructor' | 'none',
) {
  // Cannot request a user data override without instructor permissions
  if (
    !authnAuthResult.has_course_permission_preview ||
    !authnAuthResult.has_course_instance_permission_view
  ) {
    debug('requested overrides, but authn user does not have instructor permissions');
    if (viewType === 'student') {
      debug('on student page, so silently exit and ignore requested overrides');
      return {
        success: false,
        error: null,
      };
    }
    debug('not on student page, so clear all requested overrides and throw an error');
    return {
      success: false,
      error: new AugmentedError('Access denied', {
        status: 403,
        info: html`
          <p>
            You must be a member of the course staff in order to change the effective user. All
            requested changes to the effective user have been removed.
          </p>
        `,
      }),
    };
  }

  return {
    success: true,
    error: null,
  };
}

/**
 * Verifies that the effective user has the permissions to override the authenticated user.
 *
 * @param authnAuthzData - The authorization data for the authenticated user.
 * @param effectiveAuthzData - The authorization data for the effective user.
 * @returns An error if the permissions are not valid, or null if the override is allowed.
 */
function canBecomeEffectiveUser(
  authnAuthzData: CalculateAuthDataSuccessResult,
  effectiveAuthzData: CalculateAuthDataSuccessResult,
  effectiveUserHasInstructorAccessToCourseInstance: boolean,
): { success: false; error: AugmentedError } | { success: true; error: null } {
  // The effective user is a Previewer and the authn_user is not
  if (
    !authnAuthzData.authResult.has_course_permission_preview &&
    effectiveAuthzData.authResult.has_course_permission_preview
  ) {
    return {
      success: false,
      error: new AugmentedError('Access denied', {
        status: 403,
        info: html`
          <p>
            You have tried to change the effective user to one who is a course previewer, when you
            are not a course previewer. All requested changes to the effective user have been
            removed.
          </p>
        `,
      }),
    };
  }

  // The effective user is a Viewer and the authn_user is not
  if (
    !authnAuthzData.authResult.has_course_permission_view &&
    effectiveAuthzData.authResult.has_course_permission_view
  ) {
    return {
      success: false,
      error: new AugmentedError('Access denied', {
        status: 403,
        info: html`
          <p>
            You have tried to change the effective user to one who is a course viewer, when you are
            not a course viewer. All requested changes to the effective user have been removed.
          </p>
        `,
      }),
    };
  }

  // The effective user is an Editor and the authn_user is not
  if (
    !authnAuthzData.authResult.has_course_permission_edit &&
    effectiveAuthzData.authResult.has_course_permission_edit
  ) {
    return {
      success: false,
      error: new AugmentedError('Access denied', {
        status: 403,
        info: html`
          <p>
            You have tried to change the effective user to one who is a course editor, when you are
            not a course editor. All requested changes to the effective user have been removed.
          </p>
        `,
      }),
    };
  }

  // The effective user is an Owner and the authn_user is not
  if (
    !authnAuthzData.authResult.has_course_permission_own &&
    effectiveAuthzData.authResult.has_course_permission_own
  ) {
    return {
      success: false,
      error: new AugmentedError('Access denied', {
        status: 403,
        info: html`
          <p>
            You have tried to change the effective user to one who is a course owner, when you are
            not a course owner. All requested changes to the effective user have been removed.
          </p>
        `,
      }),
    };
  }

  if (effectiveAuthzData.courseInstance) {
    // The effective user is a Student Data Viewer and the authn_user is not
    if (
      !authnAuthzData.authResult.has_course_instance_permission_view &&
      effectiveAuthzData.authResult.has_course_instance_permission_view
    ) {
      return {
        success: false,
        error: new AugmentedError('Access denied', {
          status: 403,
          info: html`
            <p>
              You have tried to change the effective user to one who is a student data viewer in the
              course instance <code>${effectiveAuthzData.courseInstance.short_name}</code>, when you
              are not a student data viewer. All requested changes to the effective user have been
              removed.
            </p>
          `,
        }),
      };
    }

    // The effective user is a Student Data Editor and the authn_user is not
    if (
      !authnAuthzData.authResult.has_course_instance_permission_edit &&
      effectiveAuthzData.authResult.has_course_instance_permission_edit
    ) {
      return {
        success: false,
        error: new AugmentedError('Access denied', {
          status: 403,
          info: html`
            <p>
              You have tried to change the effective user to one who is a student data editor in the
              course instance <code>${effectiveAuthzData.courseInstance.short_name}</code>, when you
              are not a student data editor. All requested changes to the effective user have been
              removed.
            </p>
          `,
        }),
      };
    }

    // The effective user is a student (with no course or course instance role prior to
    // other overrides) with a different UID than the authn user (note UID is unique), and
    // the authn user is not a Student Data Editor
    if (
      effectiveAuthzData.authResult.user.uid !== authnAuthzData.authResult.user.uid && // effective uid is not the same as authn uid
      effectiveAuthzData.authResult.has_student_access_with_enrollment && // effective user is enrolled with access
      !effectiveUserHasInstructorAccessToCourseInstance && // effective user is not an instructor (i.e., is a student)
      !authnAuthzData.authResult.has_course_instance_permission_edit
    ) {
      // authn user is not a Student Data Editor
      debug('cannot emulate student if not student data editor');
      return {
        success: false,
        error: new AugmentedError('Access denied', {
          status: 403,
          info: html`
            <p>
              You have tried to change the effective user to one who is a student in the course
              instance
              <code>${effectiveAuthzData.courseInstance.short_name}</code>, when you do not have
              permission to edit student data in this course instance. All requested changes to the
              effective user have been removed.
            </p>
          `,
        }),
      };
    }

    // The effective user is not enrolled in the course instance and is also not
    // either a course instructor or a course instance instructor
    //
    // Note that we skip this check if the effective user is the same as the
    // authenticated user, since an instructor may want to view their course
    // as a student without enrolling in their own course.
    if (
      !idsEqual(
        effectiveAuthzData.authResult.user.user_id,
        authnAuthzData.authResult.user.user_id,
      ) &&
      !effectiveAuthzData.authResult.has_course_permission_preview &&
      !effectiveAuthzData.authResult.has_course_instance_permission_view &&
      !effectiveAuthzData.authResult.has_student_access_with_enrollment
    ) {
      return {
        success: false,
        error: new AugmentedError('Access denied', {
          status: 403,
          info: html`
            <p>
              You have tried to change the effective user to one who is not enrolled in this course
              instance. All required changes to the effective user have been removed.
            </p>
          `,
        }),
      };
    }
  }
  return {
    success: true,
    error: null,
  };
}

async function getOverrideUserData(
  requestedUid: string,
  is_administrator: boolean,
  courseInstanceId: string | null,
): Promise<{ success: false; error: AugmentedError } | { success: true; userData: SelectUser }> {
  // Verify requested UID
  const userData = await sqldb.queryOptionalRow(
    sql.select_user,
    {
      uid: requestedUid,
      course_instance_id: courseInstanceId,
    },
    SelectUserSchema,
  );

  // No user was found
  if (userData === null) {
    return {
      success: false,
      error: new AugmentedError('Access denied', {
        status: 403,
        info: html`
          <p>
            You have tried to change the effective user to one with uid
            <code>${requestedUid}</code>, when no such user exists. All requested changes to the
            effective user have been removed.
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
                ${courseInstanceId
                  ? html`
                      <p>
                        To auto-generate many users for testing, see
                        <a href="/pl/administrator/query/generate_and_enroll_users"
                          >Generate random users and enroll them in a course instance</a
                        >
                        <br />
                        (Hint your course_instance_id is
                        <strong>${courseInstanceId}</strong>)
                      </p>
                    `
                  : ''}
              `
            : ''}
        `,
      }),
    };
  }

  // The effective user is an administrator and the authn user is not
  if (userData.is_administrator && !is_administrator) {
    return {
      success: false,
      error: new AugmentedError('Access denied', {
        status: 403,
        info: html`
          <p>
            You have tried to change the effective user to one who is an administrator, when you are
            not an administrator. All requested changes to the effective user have been removed.
          </p>
        `,
      }),
    };
  }

  debug(`requested uid has instructor access: ${userData.is_instructor}`);

  return {
    success: true,
    userData,
  };

  // FIXME: also override institution?
}

const SelectUserSchema = z.object({
  user: UserSchema,
  institution: InstitutionSchema,
  is_administrator: z.boolean(),
  is_instructor: z.boolean(),
});
type SelectUser = z.infer<typeof SelectUserSchema>;

interface ResLocalsCourseAuthz {
  authn_user: ResLocalsAuthnUser['authn_user'];
  authn_mode: FullAuthzData['mode'];
  authn_mode_reason: FullAuthzData['mode_reason'];
  authn_is_administrator: ResLocalsAuthnUser['is_administrator'];
  authn_course_role: FullAuthzData['permissions_course']['course_role'];
  authn_has_course_permission_preview: boolean;
  authn_has_course_permission_view: boolean;
  authn_has_course_permission_edit: boolean;
  authn_has_course_permission_own: boolean;
  user: ResLocalsAuthnUser['authn_user'];
  mode: FullAuthzData['mode'];
  mode_reason: FullAuthzData['mode_reason'];
  is_administrator: ResLocalsAuthnUser['is_administrator'];
  course_role: FullAuthzData['permissions_course']['course_role'];
  has_course_permission_preview: boolean;
  has_course_permission_view: boolean;
  has_course_permission_edit: boolean;
  has_course_permission_own: boolean;
  overrides: Override[];
}

interface ResLocalsCourseInstanceAuthz extends ResLocalsCourseAuthz {
  authn_course_instance_role: FullAuthzData['permissions_course_instance']['course_instance_role'];
  authn_has_course_instance_permission_view: boolean;
  authn_has_course_instance_permission_edit: boolean;
  authn_has_student_access: FullAuthzData['permissions_course_instance']['has_student_access'];
  authn_has_student_access_with_enrollment: FullAuthzData['permissions_course_instance']['has_student_access_with_enrollment'];
  course_instance_role: FullAuthzData['permissions_course_instance']['course_instance_role'];
  has_course_instance_permission_view: boolean;
  has_course_instance_permission_edit: boolean;
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

  const {
    authResult: authnAuthResult,
    course: authnCourse,
    institution: authnInstitution,
    courseInstance: authnCourseInstance,
  } = await calculateAuthData({
    user: res.locals.authn_user,
    // Note that req.params.course_id and req.params.course_instance_id are strings and not
    // numbers - this is why we can use the pattern "id || null" to check if they exist.
    course_id: req.params.course_id || null,
    course_instance_id: req.params.course_instance_id || null,
    ip: req.ip || null,
    req_date: res.locals.req_date,
    overrides: {
      is_administrator: res.locals.is_administrator,
      // We allow unit tests to override the req_mode. Unit tests may also override
      // the user (middlewares/authn.ts) and the req_date (middlewares/date.ts).
      req_mode: config.devMode ? req.cookies.pl_test_mode : null,
    },
  });

  if (authnAuthResult === null) {
    throw new HttpStatusError(403, 'Access denied');
  }

  debug('authn user is authorized');

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

  // If this is an example course, only allow overrides if the user is an administrator.
  if (authnCourse.example_course && !res.locals.is_administrator) {
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

  const req_date = run(() => {
    if (req.cookies.pl2_requested_date) {
      const req_date = parseISO(req.cookies.pl2_requested_date);
      if (!isValid(req_date)) {
        debug(
          `requested date is invalid: ${req.cookies.pl2_requested_date}, ${req_date.toISOString()}`,
        );
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

      debug(`effective req_date = ${req_date.toISOString()}`);
      return req_date;
    }

    return res.locals.req_date;
  });

  const effectiveUserData = await run(async () => {
    if (!req.cookies.pl2_requested_uid) {
      return null;
    }
    const result = await getOverrideUserData(
      req.cookies.pl2_requested_uid,
      res.locals.is_administrator,
      req.params.course_instance_id || null,
    );
    if (!result.success) {
      clearOverrideCookies(res, overrides);
      throw result.error;
    }
    return result.userData;
  });

  const verifyAuthnAuthResultResult = verifyAuthnAuthResult(
    authnAuthResult,
    res.locals.view_type || 'none',
  );

  if (!verifyAuthnAuthResultResult.success && verifyAuthnAuthResultResult.error !== null) {
    clearOverrideCookies(res, overrides);
    throw verifyAuthnAuthResultResult.error;
  }

  const {
    authResult: effectiveAuthResult,
    course: effectiveCourse,
    institution: effectiveInstitution,
    courseInstance: effectiveCourseInstance,
  } = await run(async () => {
    // Check if we even have an effective user to override.
    if (effectiveUserData === null) {
      return {
        authResult: null,
        course: null,
        institution: null,
        courseInstance: null,
      };
    }

    // Check if it is necessary to request a user data override
    if (overrides.length === 0) {
      debug('no requested overrides');
      return {
        authResult: null,
        course: null,
        institution: null,
        courseInstance: null,
      };
    }

    // If we didn't throw an error and we can't set the effective user, return all nulls.
    if (!verifyAuthnAuthResultResult.success) {
      return {
        authResult: null,
        course: null,
        institution: null,
        courseInstance: null,
      };
    }

    // We are trying to override the user data.
    debug('trying to override the user data');
    debug(req.cookies);

    const {
      authResult: effectiveAuthResult,
      course: effectiveCourse,
      institution: effectiveInstitution,
      courseInstance: effectiveCourseInstance,
    } = await calculateAuthData({
      user: effectiveUserData.user,
      course_id: req.params.course_id || null,
      course_instance_id: req.params.course_instance_id || null,
      ip: req.ip || null,
      req_date,
      overrides: {
        is_administrator: effectiveUserData.is_administrator,
        allow_example_course_override: false,
        req_mode: config.devMode ? req.cookies.pl_test_mode : null,
        req_course_role: req.cookies.pl2_requested_course_role || null,
        req_course_instance_role: req.cookies.pl2_requested_course_instance_role || null,
      },
    });

    // If the authn user were denied access, then we would return an error. Here,
    // we simply return (without error). This allows the authn user to keep access
    // to pages (e.g., the effective user page) for which only authn permissions
    // are required.
    if (effectiveAuthResult === null) {
      return {
        authResult: {
          ...(await calculateFallbackAuthData(
            effectiveUserData.user,
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            req.params.course_instance_id !== null,
          )),
          user_with_requested_uid_has_instructor_access_to_course_instance:
            effectiveUserData.is_instructor,
        },
        course: null,
        institution: null,
        courseInstance: null,
      };
    }

    if (req.params.course_instance_id) {
      // If the effective user is the same as the authenticated user and the
      // effective user has not requested any specific role, we'll treat them
      // as though they're enrolled in the course instance as a student. This is
      // important because we no longer automatically enroll instructors in their
      // own course instances when they view them.
      if (
        idsEqual(effectiveAuthResult.user.user_id, authnAuthResult.user.user_id) &&
        !effectiveAuthResult.has_course_instance_permission_view &&
        !effectiveAuthResult.has_course_permission_view
      ) {
        effectiveAuthResult.has_student_access_with_enrollment = true;
      }
    }
    return {
      authResult: {
        ...effectiveAuthResult,
        user_with_requested_uid_has_instructor_access_to_course_instance:
          effectiveUserData.is_instructor,
      },
      course: effectiveCourse,
      institution: effectiveInstitution,
      courseInstance: effectiveCourseInstance,
    };
  });

  // If `effectiveCourse` is null, this is the fallback set of permissions.
  // We don't need to check the permissions if this is the fallback set of permissions.
  if (effectiveCourse) {
    const canBecomeEffectiveUserResult = canBecomeEffectiveUser(
      {
        authResult: authnAuthResult,
        course: authnCourse,
        institution: authnInstitution,
        courseInstance: authnCourseInstance,
      },
      {
        authResult: effectiveAuthResult,
        course: effectiveCourse,
        institution: effectiveInstitution,
        courseInstance: effectiveCourseInstance,
      },
      effectiveAuthResult.user_with_requested_uid_has_instructor_access_to_course_instance,
    );
    if (!canBecomeEffectiveUserResult.success) {
      clearOverrideCookies(res, overrides);
      throw canBecomeEffectiveUserResult.error;
    }
  }

  /*********************************************/
  //   Assign all information to res.locals
  /*********************************************/

  res.locals.authz_data.overrides = overrides;
  // After this middleware runs, `is_administrator` is set to the effective user's
  // administrator status, and not the authn user's administrator status.
  res.locals.req_date = req_date;

  res.locals.authz_data = {
    // Authn user data
    authn_user: authnAuthResult.user,
    authn_mode: authnAuthResult.mode,
    authn_mode_reason: authnAuthResult.mode_reason,
    authn_is_administrator: res.locals.is_administrator,
    authn_course_role: authnAuthResult.course_role,
    authn_has_course_permission_preview: authnAuthResult.has_course_permission_preview,
    authn_has_course_permission_view: authnAuthResult.has_course_permission_view,
    authn_has_course_permission_edit: authnAuthResult.has_course_permission_edit,
    authn_has_course_permission_own: authnAuthResult.has_course_permission_own,
    // Effective user data
    ...effectiveAuthResult,
    is_administrator: effectiveUserData?.is_administrator ?? res.locals.is_administrator,
    // Other data
    overrides,
  };
  res.locals.is_administrator = effectiveUserData?.is_administrator ?? res.locals.is_administrator;

  res.locals.course = effectiveCourse ?? authnCourse;
  res.locals.institution = effectiveInstitution ?? authnInstitution;
  res.locals.user = effectiveAuthResult?.user ?? authnAuthResult.user;
  res.locals.course_instance = effectiveCourseInstance ?? authnCourseInstance;

  // The session middleware does not run for API requests.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  res.locals.side_nav_expanded = req.session?.side_nav_expanded ?? true; // The side nav is expanded by default.

  res.locals.course_has_course_instances = await selectCourseHasCourseInstances({
    course: res.locals.course,
  });

  res.locals.has_enhanced_navigation = !(await features.enabledFromLocals(
    'legacy-navigation',
    res.locals,
  ));
  res.locals.question_sharing_enabled = await features.enabledFromLocals(
    'question-sharing',
    res.locals,
  );
}

export default asyncHandler(async (req, res, next) => {
  await authzCourseOrInstance(req, res);
  next();
});
