import { Router } from 'express';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { assertNever } from '@prairielearn/utils';

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
import { idsEqual } from '../../lib/id.js';
import { isEnterprise } from '../../lib/license.js';
import { computeStatus } from '../../lib/publishing.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getUrl } from '../../lib/url.js';
import { admitUserFromConventionalEnrollmentInvitation } from '../../models/course-instance-admission.js';
import { selectEnrollmentIdentityClassifications } from '../../models/enrollment-identity.js';
import {
  EnrollmentAdmissionDeniedError,
  rejectConventionalEnrollmentInvitation,
} from '../../models/enrollment-reconciliation.js';
import { selectOptionalEnrollmentByUserId, setEnrollmentStatus } from '../../models/enrollment.js';
import {
  markNewsItemsAsReadForUser,
  selectUnreadNewsItemsForUser,
} from '../../models/news-items.js';

import { Home } from './home.html.js';
import {
  InstructorHomePageCourseSchema,
  type StudentHomePageCourse,
  StudentHomePageCourseDataSchema,
} from './home.types.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router();

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

    // Query and collapse matching course instances for both legacy and modern publishing.
    const allStudentCourses = await queryRows(
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
      StudentHomePageCourseDataSchema,
    );

    const legacyCourseInstancesWithAccess = await checkCourseInstanceLegacyAccess({
      courseInstanceIds: allStudentCourses
        .filter((entry) => !entry.course_instance.modern_publishing)
        .map((entry) => entry.course_instance.id),
      userId: res.locals.authn_user.id,
      reqDate: res.locals.req_date,
    });

    const visibleStudentCourseData = allStudentCourses.filter((entry) => {
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

    const studentCourseClassifications = await selectEnrollmentIdentityClassifications({
      courseInstanceIds: visibleStudentCourseData.map((entry) => entry.course_instance.id),
      userId: res.locals.authn_user.id,
    });
    const studentCourses = visibleStudentCourseData
      .map((entry): StudentHomePageCourse | null => {
        const classification = studentCourseClassifications.get(entry.course_instance.id);
        if (classification === undefined) return null;
        const course = {
          course_id: entry.course_id,
          course_instance: entry.course_instance,
          course_short_name: entry.course_short_name,
          course_title: entry.course_title,
          end_date: entry.end_date,
          latest_publishing_extension: entry.latest_publishing_extension,
          start_date: entry.start_date,
        };

        if (classification.kind === 'joined') {
          return { ...course, access_type: 'joined' };
        }
        if (classification.actionableInstitutionRosterInvitationCandidates.length > 0) {
          return { ...course, access_type: 'roster_invitation' };
        }
        const conventionalInvitation =
          classification.actionableConventionalInvitationCandidates.at(0);
        if (conventionalInvitation !== undefined) {
          return {
            ...course,
            access_type: 'conventional_invitation',
            invitation_enrollment_id: conventionalInvitation.enrollment.id,
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
    const BodySchema = z.discriminatedUnion('__action', [
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
    const body = BodySchema.parse(req.body);

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

    // Invitations and rejections are only supported for modern publishing courses.
    if (
      !courseInstance.modern_publishing &&
      ['accept_invitation', 'reject_invitation'].includes(body.__action)
    ) {
      flash(
        'error',
        'Invitations and rejections are only supported for courses using modern publishing.',
      );
      res.redirect(req.originalUrl);
      return;
    }

    if (
      courseInstance.modern_publishing &&
      computeStatus(courseInstance.publishing_start_date, courseInstance.publishing_end_date) !==
        'published'
    ) {
      flash('error', 'This course instance is not accessible to students');
      res.redirect(req.originalUrl);
      return;
    }

    switch (body.__action) {
      case 'accept_invitation': {
        try {
          await admitUserFromConventionalEnrollmentInvitation({
            courseInstanceId: courseInstance.id,
            enrollmentId: body.enrollment_id,
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
          await rejectConventionalEnrollmentInvitation({
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
