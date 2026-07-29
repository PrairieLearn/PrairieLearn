import { Router } from 'express';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { assertNever } from '@prairielearn/utils';
import { parseRequestBody } from '@prairielearn/zod';

import { PageLayout } from '../../components/PageLayout.js';
import { redirectToTermsPageIfNeeded } from '../../ee/lib/terms.js';
import { hasRole } from '../../lib/authz-data-lib.js';
import {
  checkCourseInstanceLegacyAccess,
  constructCourseOrInstanceContext,
} from '../../lib/authz-data.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { StaffInstitutionSchema } from '../../lib/client/safe-db-types.js';
import { config } from '../../lib/config.js';
import type { CourseInstancePublishingExtension } from '../../lib/db-types.js';
import { admitUserFromUidInvitation } from '../../lib/enrollment/admission.js';
import {
  type EnrollmentIdentityCandidate,
  type EnrollmentIdentityClassification,
  classifyEnrollmentIdentityCandidates,
  selectEnrollmentAdmissionDecision,
} from '../../lib/enrollment/identity.js';
import {
  EnrollmentAdmissionDeniedError,
  rejectUidInvitation,
} from '../../lib/enrollment/reconciliation.js';
import { idsEqual } from '../../lib/id.js';
import { isEnterprise } from '../../lib/license.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getUrl } from '../../lib/url.js';
import { selectOptionalEnrollmentByUserId, setEnrollmentStatus } from '../../models/enrollment.js';
import {
  markNewsItemsAsReadForUser,
  selectUnreadNewsItemsForUser,
} from '../../models/news-items.js';

import { Home } from './home.html.js';
import {
  InstructorHomePageCourseSchema,
  type StudentHomePageCourse,
  type StudentHomePageCourseCandidateRow,
  StudentHomePageCourseCandidateRowSchema,
  type StudentHomePageCourseData,
} from './home.types.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router();

const PostBodySchema = z.discriminatedUnion('__action', [
  z.object({ __action: z.literal('dismiss_news_alert') }),
  z.object({
    __action: z.enum(['accept_invitation', 'reject_invitation']),
    course_instance_id: z.string().min(1),
    enrollment_id: z.string().min(1),
  }),
  z.object({
    __action: z.literal('unenroll'),
    course_instance_id: z.string().min(1),
  }),
]);

function isLaterPublishingExtension(
  next: CourseInstancePublishingExtension,
  current: CourseInstancePublishingExtension,
): boolean {
  const dateDifference = next.end_date.getTime() - current.end_date.getTime();
  return dateDifference > 0 || (dateDifference === 0 && BigInt(next.id) > BigInt(current.id));
}

function groupStudentCourseCandidates(
  rows: StudentHomePageCourseCandidateRow[],
): (StudentHomePageCourseData & {
  classification: EnrollmentIdentityClassification;
})[] {
  const groups = new Map<
    string,
    {
      course: StudentHomePageCourseData;
      candidates: EnrollmentIdentityCandidate[];
    }
  >();

  for (const row of rows) {
    let group = groups.get(row.course_instance.id);
    if (group === undefined) {
      group = {
        course: {
          course_id: row.course_id,
          course_instance: row.course_instance,
          course_short_name: row.course_short_name,
          course_title: row.course_title,
          start_date: row.start_date,
          end_date: row.end_date,
          latest_publishing_extension: null,
        },
        candidates: [],
      };
      groups.set(row.course_instance.id, group);
    }

    group.candidates.push({
      enrollment: row.enrollment,
      matches: {
        boundUser: row.matches_bound_user,
        institutionUin: row.matches_institution_uin,
        lti13: row.matches_lti13,
        pendingUid: row.matches_pending_uid,
      },
    });

    const extension = row.latest_publishing_extension;
    if (
      extension !== null &&
      (group.course.latest_publishing_extension === null ||
        isLaterPublishingExtension(extension, group.course.latest_publishing_extension))
    ) {
      group.course.latest_publishing_extension = extension;
    }
  }

  return [...groups.values()].map((group) => ({
    ...group.course,
    classification: classifyEnrollmentIdentityCandidates(group.candidates),
  }));
}

router.get(
  '/',
  typedAsyncHandler<'plain', { navPage: 'home' }>(async (req, res) => {
    res.locals.navPage = 'home';

    // Potentially prompt the user to accept the terms before proceeding.
    if (isEnterprise()) {
      await redirectToTermsPageIfNeeded(res, res.locals.authn_user, req.ip, req.originalUrl);
    }

    const instructorCourses = await queryRows(
      sql.select_instructor_courses,
      {
        user_id: res.locals.authn_user.id,
        is_administrator: res.locals.is_administrator,
        // Example courses are only shown to users who are either instructors of
        // at least one other course, or who are admins. They're also shown
        // unconditionally in dev mode.
        include_example_course: res.locals.is_administrator || config.devMode,
      },
      InstructorHomePageCourseSchema,
    );

    const studentCourseCandidateRows = await queryRows(
      sql.select_student_courses,
      {
        // Use the authenticated user, not the authorized user.
        user_id: res.locals.authn_user.id,
        // This is a somewhat ugly escape hatch specifically for load testing. In
        // general, we don't want to clutter the home page with example course
        // enrollments, but for load testing we want to enroll a large number of
        // users in the example course and then have them find the example course
        // on the home page. So, you'd make a request like this:
        // `/pl?include_example_course_enrollments=true`
        include_example_course_enrollments: req.query.include_example_course_enrollments === 'true',
        req_date: res.locals.req_date,
      },
      StudentHomePageCourseCandidateRowSchema,
    );
    const allStudentCourses = groupStudentCourseCandidates(studentCourseCandidateRows);

    const legacyCourseInstancesWithAccess = await checkCourseInstanceLegacyAccess({
      courseInstanceIds: allStudentCourses
        .filter((entry) => !entry.course_instance.modern_publishing)
        .map((entry) => entry.course_instance.id),
      userId: res.locals.authn_user.id,
      reqDate: res.locals.req_date,
    });

    const visibleStudentCourses = allStudentCourses.filter((entry) => {
      // Filter out courses where user also has instructor access.
      if (instructorCourses.some((course) => idsEqual(course.id, entry.course_id))) return false;

      // Legacy courses must be filtered using access rules
      if (!entry.course_instance.modern_publishing) {
        return legacyCourseInstancesWithAccess.includes(entry.course_instance.id);
      }

      // For modern publishing courses, check access dates
      const startDate = entry.course_instance.publishing_start_date;
      const endDate = run(() => {
        if (entry.course_instance.publishing_end_date == null) {
          return null;
        }

        if (
          entry.latest_publishing_extension == null ||
          entry.course_instance.publishing_end_date > entry.latest_publishing_extension.end_date
        ) {
          return entry.course_instance.publishing_end_date;
        }

        return entry.latest_publishing_extension.end_date;
      });

      return (
        startDate !== null &&
        endDate !== null &&
        startDate < res.locals.req_date &&
        res.locals.req_date < endDate
      );
    });

    const studentCourses = visibleStudentCourses
      .map(({ classification, ...course }): StudentHomePageCourse | null => {
        if (classification.boundCandidate?.enrollment.status === 'joined') {
          return { ...course, access_type: 'joined' };
        }
        if (classification.actionableInstitutionUinInvitation !== null) {
          return { ...course, access_type: 'institution_uin_invitation' };
        }
        if (classification.actionableUidInvitation !== null) {
          return {
            ...course,
            access_type: 'uid_invitation',
            invitation_enrollment_id: classification.actionableUidInvitation.enrollment.id,
          };
        }
        return null;
      })
      .filter((entry): entry is StudentHomePageCourse => entry !== null);

    const adminInstitutions = await queryRows(
      sql.select_admin_institutions,
      { user_id: res.locals.authn_user.id },
      StaffInstitutionSchema,
    );

    // Only show news alerts to instructors (users with instructor courses)
    const unreadNewsItems =
      config.newsFeedUrl && instructorCourses.length > 0
        ? await selectUnreadNewsItemsForUser(res.locals.authn_user, 3)
        : [];

    const { authn_provider_name, __csrf_token, urlPrefix } = extractPageContext(res.locals, {
      pageType: 'plain',
      accessType: 'student',
      withAuthzData: false,
    });

    const search = getUrl(req).search;

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Home',
        navContext: {
          type: 'plain',
          page: 'home',
        },
        options: {
          showFooter: true,
        },
        content: (
          <Home
            canAddCourses={authn_provider_name !== 'LTI'}
            csrfToken={__csrf_token}
            instructorCourses={instructorCourses}
            studentCourses={studentCourses}
            adminInstitutions={adminInstitutions}
            urlPrefix={urlPrefix}
            isDevMode={config.devMode}
            search={search}
            unreadNewsItems={unreadNewsItems}
            blogUrl={config.newsFeedBlogUrl}
            now={res.locals.req_date}
          />
        ),
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const body = parseRequestBody(req, PostBodySchema);

    const {
      authn_user: { uid },
    } = extractPageContext(res.locals, {
      pageType: 'plain',
      accessType: 'student',
      withAuthzData: false,
    });

    if (body.__action === 'dismiss_news_alert') {
      await markNewsItemsAsReadForUser(res.locals.authn_user);
      res.redirect(req.originalUrl);
      return;
    }

    const { authzData, courseInstance } = await constructCourseOrInstanceContext({
      user: res.locals.authn_user,
      course_id: null,
      course_instance_id: body.course_instance_id,
      ip: req.ip ?? null,
      req_date: res.locals.req_date,
      is_administrator: res.locals.is_administrator,
    });

    if (authzData === null || courseInstance === null || !hasRole(authzData, ['Student'])) {
      throw new HttpStatusError(403, 'Access denied');
    }

    if (!authzData.has_student_access) {
      flash('error', 'This course instance is not accessible to students');
      res.redirect(req.originalUrl);
      return;
    }

    switch (body.__action) {
      case 'accept_invitation': {
        const decision = await selectEnrollmentAdmissionDecision({
          courseInstanceId: courseInstance.id,
          source: { type: 'invitation', matchedBy: 'uid' },
          userId: res.locals.authn_user.id,
        });
        if (
          !decision.allowed ||
          decision.invitationCandidate === null ||
          !idsEqual(decision.invitationCandidate.enrollment.id, body.enrollment_id)
        ) {
          flash('error', 'Failed to accept invitation');
          break;
        }

        try {
          await admitUserFromUidInvitation({
            courseInstanceId: courseInstance.id,
            expectedInvitationEnrollmentId: decision.invitationCandidate.enrollment.id,
            ip: req.ip ?? null,
            isAdministrator: res.locals.is_administrator,
            reqDate: res.locals.req_date,
            userId: res.locals.authn_user.id,
          });
        } catch (error) {
          if (!(error instanceof EnrollmentAdmissionDeniedError)) throw error;
          flash('error', 'Failed to accept invitation');
        }
        break;
      }
      case 'reject_invitation': {
        try {
          await rejectUidInvitation({
            agentAuthnUserId: res.locals.authn_user.id,
            agentUserId: res.locals.authn_user.id,
            courseInstanceId: courseInstance.id,
            enrollmentId: body.enrollment_id,
            userId: res.locals.authn_user.id,
          });
        } catch (error) {
          if (!(error instanceof EnrollmentAdmissionDeniedError)) throw error;
          flash('error', 'Failed to reject invitation');
        }
        break;
      }
      case 'unenroll': {
        const enrollment = await selectOptionalEnrollmentByUserId({
          courseInstance,
          userId: res.locals.authn_user.id,
          requiredRole: ['Student'],
          authzData,
        });

        if (!enrollment || !['joined', 'left', 'removed'].includes(enrollment.status)) {
          flash('error', 'Failed to unenroll');
          break;
        }

        await setEnrollmentStatus({
          enrollment,
          status: 'left',
          authzData,
          requiredRole: ['Student'],
        });
        break;
      }
      default: {
        assertNever(body);
      }
    }

    res.redirect(req.originalUrl);
  }),
);

export default router;
