import { isValid, parseISO } from 'date-fns';
import { type Request, type Response } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import { AugmentedError, HttpStatusError } from '@prairielearn/error';
import { html } from '@prairielearn/html';
import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import type { ResLocalsAuthnUser } from '../lib/authn.types.js';
import {
  type ConstructedCourseOrInstanceSuccessContext,
  type CourseOrInstanceContextData,
  type PlainAuthzData,
  calculateCourseInstanceRolePermissions,
  calculateCourseRolePermissions,
} from '../lib/authz-data-lib.js';
import {
  CourseOrInstanceOverridesSchema,
  constructCourseOrInstanceContext,
} from '../lib/authz-data.js';
import { config } from '../lib/config.js';
import { clearCookie } from '../lib/cookie.js';
import {
  type EnumCourseInstanceRole,
  type EnumCourseRole,
  InstitutionSchema,
  UserSchema,
} from '../lib/db-types.js';
import { features } from '../lib/features/index.js';
import { idsEqual } from '../lib/id.js';
import { type Result, withBrand } from '../lib/types.js';
import { selectCourseHasCourseInstances } from '../models/course-instances.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export interface Override {
  name: string;
  value: string;
  cookie: string;
}

/**
 * Removes all override cookies from the response.
 */
function clearOverrideCookies(res: Response, overrides: Override[]) {
  overrides.forEach((override) => {
    const newName = override.cookie.replace(/^pl2_/, 'pl_');
    clearCookie(res, [override.cookie, newName]);
  });
}

/**
 * Verifies that the authenticated user has sufficient permissions to become the effective user.
 *
 * Security model:
 * - Users cannot escalate to a higher permission level than they have
 * - Student Data Editors can emulate students, but lower roles cannot
 * - Administrators can emulate other administrators
 * - Effective users must be enrolled or have instructor access to the course instance
 * @param params
 * @param params.authnAuthzData - Authorization data for the authenticated (real) user
 * @param params.authnCourseInstance - Course instance for the authenticated (real) user
 * @param params.effectiveAuthzData - Authorization data for the requested effective user
 * @param params.effectiveUserHasInstructorAccessToCourseInstance - Whether the effective user has instructor-level access
 * @returns Success status with error if validation fails
 */
function canBecomeEffectiveUser({
  authnAuthzData,
  authnCourseInstance,
  effectiveAuthzData,
  effectiveUserHasInstructorAccessToCourseInstance,
}: {
  authnAuthzData: ConstructedCourseOrInstanceSuccessContext['authzData'];
  authnCourseInstance: ConstructedCourseOrInstanceSuccessContext['courseInstance'];
  effectiveAuthzData: ConstructedCourseOrInstanceSuccessContext['authzData'];
  effectiveUserHasInstructorAccessToCourseInstance: boolean | null;
}): Result<void> {
  const failedPermissionCheck = [
    {
      hasFailedCheck:
        !authnAuthzData.has_course_permission_preview &&
        effectiveAuthzData.has_course_permission_preview,
      errorMessage: () => html`
        <p>
          You have tried to change the effective user to one who is a course previewer, when you are
          not a course previewer. All requested changes to the effective user have been removed.
        </p>
      `,
    },
    {
      hasFailedCheck:
        !authnAuthzData.has_course_permission_view && effectiveAuthzData.has_course_permission_view,
      errorMessage: () => html`
        <p>
          You have tried to change the effective user to one who is a course viewer, when you are
          not a course viewer. All requested changes to the effective user have been removed.
        </p>
      `,
    },
    {
      hasFailedCheck:
        !authnAuthzData.has_course_permission_edit && effectiveAuthzData.has_course_permission_edit,
      errorMessage: () => html`
        <p>
          You have tried to change the effective user to one who is a course editor, when you are
          not a course editor. All requested changes to the effective user have been removed.
        </p>
      `,
    },
    {
      hasFailedCheck:
        !authnAuthzData.has_course_permission_own && effectiveAuthzData.has_course_permission_own,
      errorMessage: () => html`
        <p>
          You have tried to change the effective user to one who is a course owner, when you are not
          a course owner. All requested changes to the effective user have been removed.
        </p>
      `,
    },
    {
      hasFailedCheck:
        !authnAuthzData.has_course_instance_permission_view &&
        effectiveAuthzData.has_course_instance_permission_view &&
        authnCourseInstance !== null,
      errorMessage: () => html`
        <p>
          You have tried to change the effective user to one who is a student data viewer in the
          course instance <code>${authnCourseInstance!.short_name}</code>, when you are not a
          student data viewer. All requested changes to the effective user have been removed.
        </p>
      `,
    },
    {
      hasFailedCheck:
        !authnAuthzData.has_course_instance_permission_edit &&
        effectiveAuthzData.has_course_instance_permission_edit &&
        authnCourseInstance !== null,
      errorMessage: () => html`
        <p>
          You have tried to change the effective user to one who is a student data editor in the
          course instance <code>${authnCourseInstance!.short_name}</code>, when you are not a
          student data editor. All requested changes to the effective user have been removed.
        </p>
      `,
    },
    {
      // The effective user is a student (with no course or course instance role prior to
      // other overrides) with a different UID than the authn user (note UID is unique), and
      // the authn user is not a Student Data Editor
      hasFailedCheck:
        effectiveAuthzData.user.uid !== authnAuthzData.user.uid && // effective uid is not the same as authn uid
        effectiveAuthzData.has_student_access_with_enrollment && // effective user is enrolled with access
        effectiveUserHasInstructorAccessToCourseInstance != null &&
        !effectiveUserHasInstructorAccessToCourseInstance && // effective user is not an instructor (i.e., is a student)
        !authnAuthzData.has_course_instance_permission_edit &&
        authnCourseInstance !== null,
      errorMessage: () => html`
        <p>
          You have tried to change the effective user to one who is a student in the course instance
          <code>${authnCourseInstance!.short_name}</code>, when you do not have permission to edit
          student data in this course instance. All requested changes to the effective user have
          been removed.
        </p>
      `,
    },
    {
      // The effective user is not enrolled in the course instance and is also not
      // either a course instructor or a course instance instructor
      //
      // Note that we skip this check if the effective user is the same as the
      // authenticated user, since an instructor may want to view their course
      // as a student without enrolling in their own course.
      hasFailedCheck:
        !idsEqual(effectiveAuthzData.user.user_id, authnAuthzData.user.user_id) &&
        !effectiveAuthzData.has_course_permission_preview &&
        !effectiveAuthzData.has_course_instance_permission_view &&
        !effectiveAuthzData.has_student_access_with_enrollment &&
        authnCourseInstance !== null,
      errorMessage: () => html`
        <p>
          You have tried to change the effective user to one who is not enrolled in this course
          instance. All required changes to the effective user have been removed.
        </p>
      `,
    },
  ].find((check) => check.hasFailedCheck);

  if (failedPermissionCheck) {
    return {
      success: false,
      error: new AugmentedError('Access denied', {
        status: 403,
        info: failedPermissionCheck.errorMessage(),
      }),
    };
  }

  return {
    success: true,
    value: undefined,
  };
}

async function getOverrideUserData({
  requestedUid,
  isAdministrator,
  courseInstanceId,
}: {
  requestedUid: string;
  isAdministrator: boolean;
  courseInstanceId: string | null;
}): Promise<Result<SelectUser>> {
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
          ${config.devMode && isAdministrator
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
  if (userData.is_administrator && !isAdministrator) {
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

  return {
    success: true,
    value: userData,
  };
}

const SelectUserSchema = z.object({
  user: UserSchema,
  institution: InstitutionSchema,
  is_administrator: z.boolean(),
  is_instructor_in_course_instance: z.boolean(),
});
type SelectUser = z.infer<typeof SelectUserSchema>;

interface ResLocalsCourseAuthz {
  authn_user: ResLocalsAuthnUser['authn_user'];
  authn_mode: CourseOrInstanceContextData['mode'];
  authn_mode_reason: CourseOrInstanceContextData['mode_reason'];
  authn_is_administrator: ResLocalsAuthnUser['is_administrator'];
  authn_course_role: CourseOrInstanceContextData['permissions_course']['course_role'];
  authn_has_course_permission_preview: boolean;
  authn_has_course_permission_view: boolean;
  authn_has_course_permission_edit: boolean;
  authn_has_course_permission_own: boolean;
  user: ResLocalsAuthnUser['authn_user'];
  mode: CourseOrInstanceContextData['mode'];
  mode_reason: CourseOrInstanceContextData['mode_reason'];
  is_administrator: ResLocalsAuthnUser['is_administrator'];
  course_role: CourseOrInstanceContextData['permissions_course']['course_role'];
  has_course_permission_preview: boolean;
  has_course_permission_view: boolean;
  has_course_permission_edit: boolean;
  has_course_permission_own: boolean;
  overrides: Override[];
}

interface ResLocalsCourseInstanceAuthz extends ResLocalsCourseAuthz {
  authn_course_instance_role: CourseOrInstanceContextData['permissions_course_instance']['course_instance_role'];
  authn_has_course_instance_permission_view: boolean;
  authn_has_course_instance_permission_edit: boolean;
  authn_has_student_access: CourseOrInstanceContextData['permissions_course_instance']['has_student_access'];
  authn_has_student_access_with_enrollment: CourseOrInstanceContextData['permissions_course_instance']['has_student_access_with_enrollment'];
  course_instance_role: CourseOrInstanceContextData['permissions_course_instance']['course_instance_role'];
  has_course_instance_permission_view: boolean;
  has_course_instance_permission_edit: boolean;
  has_student_access_with_enrollment: CourseOrInstanceContextData['permissions_course_instance']['has_student_access_with_enrollment'];
  has_student_access: CourseOrInstanceContextData['permissions_course_instance']['has_student_access'];
  user_with_requested_uid_has_instructor_access_to_course_instance: boolean | null;
}

export interface ResLocalsCourse {
  course: CourseOrInstanceContextData['course'];
  institution: CourseOrInstanceContextData['institution'];
  side_nav_expanded: boolean;
  authz_data: ResLocalsCourseAuthz;
  user: ResLocalsCourseAuthz['user'];
  course_has_course_instances: boolean;
  has_enhanced_navigation: boolean;
  question_sharing_enabled: boolean;
}

export interface ResLocalsCourseInstance extends ResLocalsCourse {
  course_instance: NonNullable<CourseOrInstanceContextData['course_instance']>;
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
    authzData: authnAuthzData,
    course: authnCourse,
    institution: authnInstitution,
    courseInstance: authnCourseInstance,
  } = await constructCourseOrInstanceContext({
    user: res.locals.authn_user,
    // Note that req.params.course_id and req.params.course_instance_id are strings and not
    // numbers - this is why we can use the pattern "id || null" to check if they exist.
    course_id: req.params.course_id || null,
    course_instance_id: req.params.course_instance_id || null,
    ip: req.ip || null,
    req_date: res.locals.req_date,
    is_administrator: res.locals.is_administrator,
    overrides: {
      // We allow unit tests to override the req_mode. Unit tests may also override
      // the user (middlewares/authn.ts) and the req_date (middlewares/date.ts).
      mode: config.devMode ? req.cookies.pl_test_mode : null,
    },
  });

  if (authnAuthzData === null) {
    throw new HttpStatusError(403, 'Access denied');
  }

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
  if (authnCourse.example_course && !res.locals.is_administrator && overrides.length > 0) {
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
      return req_date;
    }

    return res.locals.req_date;
  });

  const effectiveUserData = await run(async () => {
    if (!req.cookies.pl2_requested_uid) {
      return null;
    }
    const result = await getOverrideUserData({
      requestedUid: req.cookies.pl2_requested_uid,
      isAdministrator: res.locals.is_administrator,
      courseInstanceId: req.params.course_instance_id || null,
    });
    if (!result.success) {
      clearOverrideCookies(res, overrides);
      throw result.error;
    }
    return result.value;
  });

  const { authzData: effectiveAuthzData } = await run(async () => {
    // We still run this code even if we don't have an effective user to override.
    // This is because you can overrides roles without specifying a user.

    // Check if there were any requested overrides
    if (overrides.length === 0) {
      // If we don't have any overrides, the effective user is the same as the authn user.
      return {
        authzData: authnAuthzData,
        course: authnCourse,
        institution: authnInstitution,
        courseInstance: authnCourseInstance,
      };
    }

    // Cannot request a user data override without instructor permissions
    if (
      !authnAuthzData.has_course_permission_preview &&
      !authnAuthzData.has_course_instance_permission_view
    ) {
      if ((res.locals.viewType || 'none') === 'student') {
        // If we can't set the effective user, the effective user is the same as the authn user.
        return {
          authzData: authnAuthzData,
          course: authnCourse,
          institution: authnInstitution,
          courseInstance: authnCourseInstance,
        };
      }
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
    const overrideResult = CourseOrInstanceOverridesSchema.safeParse({
      allow_example_course_override: false,
      mode: config.devMode ? req.cookies.pl_test_mode : null,
      course_role: req.cookies.pl2_requested_course_role || null,
      course_instance_role: req.cookies.pl2_requested_course_instance_role || null,
    });
    if (!overrideResult.success) {
      clearOverrideCookies(res, overrides);
      throw new AugmentedError('Access denied', {
        status: 403,
        info: html`
          <p>
            You have requested an invalid effective user: ${overrideResult.error.message}. All
            requested changes to the effective user have been removed.
          </p>
        `,
      });
    }

    const {
      authzData: effectiveAuthResult,
      course: effectiveCourse,
      institution: effectiveInstitution,
      courseInstance: effectiveCourseInstance,
    } = await constructCourseOrInstanceContext({
      user: effectiveUserData ? effectiveUserData.user : authnAuthzData.user,
      course_id: req.params.course_id || null,
      course_instance_id: req.params.course_instance_id || null,
      ip: req.ip || null,
      req_date,
      is_administrator: effectiveUserData
        ? effectiveUserData.is_administrator
        : res.locals.is_administrator,
      overrides: overrideResult.data,
    });

    // If the authn user was denied access, we would have thrown an error already since
    // authnAuthResult would be null. This allows the authn user to keep access
    // to pages (e.g., the effective user page) for which only authn permissions
    // are required.
    if (effectiveAuthResult === null) {
      return {
        authzData: withBrand<PlainAuthzData>({
          user: effectiveUserData ? effectiveUserData.user : authnAuthzData.user,
          course_role: 'None' as EnumCourseRole,
          ...calculateCourseRolePermissions('None'),
          ...(req.params.course_instance_id
            ? {
                course_instance_role: 'None' as EnumCourseInstanceRole,
                has_student_access: false,
                has_student_access_with_enrollment: false,
                ...calculateCourseInstanceRolePermissions('None'),
              }
            : {}),
          mode: authnAuthzData.mode,
          mode_reason: authnAuthzData.mode_reason,
        }),
        course: authnCourse,
        institution: authnInstitution,
        courseInstance: authnCourseInstance,
      };
    }

    if (req.params.course_instance_id) {
      // If the effective user is the same as the authenticated user and the
      // effective user has not requested any specific role, we'll treat them
      // as though they're enrolled in the course instance as a student. This is
      // important because we no longer automatically enroll instructors in their
      // own course instances when they view them.
      if (
        idsEqual(effectiveAuthResult.user.user_id, authnAuthzData.user.user_id) &&
        !effectiveAuthResult.has_course_instance_permission_view &&
        !effectiveAuthResult.has_course_permission_view
      ) {
        effectiveAuthResult.has_student_access_with_enrollment = true;
      }
    }
    return {
      authzData: effectiveAuthResult,
      course: effectiveCourse,
      institution: effectiveInstitution,
      courseInstance: effectiveCourseInstance,
    };
  });

  const canBecomeEffectiveUserResult = canBecomeEffectiveUser({
    authnAuthzData,
    authnCourseInstance,
    effectiveAuthzData,
    // If the effective user, without any overrides,
    // has instructor access to the course instance, then we set this flag.
    effectiveUserHasInstructorAccessToCourseInstance:
      effectiveUserData?.is_instructor_in_course_instance ?? null,
  });
  if (!canBecomeEffectiveUserResult.success) {
    clearOverrideCookies(res, overrides);
    throw canBecomeEffectiveUserResult.error;
  }

  /*********************************************/
  //   Assign all information to res.locals
  /*********************************************/

  res.locals.req_date = req_date;

  res.locals.authz_data = {
    // Authn user data
    authn_user: authnAuthzData.user,
    authn_mode: authnAuthzData.mode,
    authn_mode_reason: authnAuthzData.mode_reason,
    authn_is_administrator: res.locals.is_administrator,
    authn_course_role: authnAuthzData.course_role,
    authn_has_course_permission_preview: authnAuthzData.has_course_permission_preview,
    authn_has_course_permission_view: authnAuthzData.has_course_permission_view,
    authn_has_course_permission_edit: authnAuthzData.has_course_permission_edit,
    authn_has_course_permission_own: authnAuthzData.has_course_permission_own,
    ...run(() => {
      if (!req.params.course_instance_id) {
        return {};
      }
      return {
        authn_course_instance_role: authnAuthzData.course_instance_role,
        authn_has_student_access: authnAuthzData.has_student_access,
        authn_has_student_access_with_enrollment: authnAuthzData.has_student_access_with_enrollment,
        authn_has_course_instance_permission_view:
          authnAuthzData.has_course_instance_permission_view,
        authn_has_course_instance_permission_edit:
          authnAuthzData.has_course_instance_permission_edit,
      };
    }),
    // Effective user data
    user: effectiveAuthzData.user,
    mode: effectiveAuthzData.mode,
    mode_reason: effectiveAuthzData.mode_reason,
    is_administrator: effectiveUserData?.is_administrator ?? res.locals.is_administrator,
    course_role: effectiveAuthzData.course_role,
    has_course_permission_preview: effectiveAuthzData.has_course_permission_preview,
    has_course_permission_view: effectiveAuthzData.has_course_permission_view,
    has_course_permission_edit: effectiveAuthzData.has_course_permission_edit,
    has_course_permission_own: effectiveAuthzData.has_course_permission_own,
    ...run(() => {
      if (!req.params.course_instance_id) {
        return {};
      }
      return {
        course_instance_role: effectiveAuthzData.course_instance_role,
        has_student_access: effectiveAuthzData.has_student_access,
        has_student_access_with_enrollment: effectiveAuthzData.has_student_access_with_enrollment,
        has_course_instance_permission_view: effectiveAuthzData.has_course_instance_permission_view,
        has_course_instance_permission_edit: effectiveAuthzData.has_course_instance_permission_edit,
        // If the effective user, without any overrides,
        // has instructor access to the course instance, then we set this flag.
        user_with_requested_uid_has_instructor_access_to_course_instance:
          effectiveUserData?.is_instructor_in_course_instance ?? null,
      };
    }),
    // Other data
    overrides,
  };
  // After this middleware runs, `is_administrator` is set to the effective user's
  // administrator status, and not the authn user's administrator status.
  res.locals.is_administrator = effectiveUserData?.is_administrator ?? res.locals.is_administrator;

  res.locals.course = authnCourse;
  res.locals.institution = authnInstitution;
  res.locals.user = effectiveAuthzData.user;
  res.locals.course_instance = authnCourseInstance;

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
