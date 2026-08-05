import { Router } from 'express';

import { HttpStatusError } from '@prairielearn/error';
import { type HtmlSafeString, html, joinHtml } from '@prairielearn/html';
import { execute, loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { type PageAuthzData, hasRole, makePageAuthzData } from '../../../lib/authz-data-lib.js';
import { constructCourseOrInstanceContext } from '../../../lib/authz-data.js';
import {
  type Course,
  CourseInstanceSchema,
  Lti13CourseInstanceSchema,
} from '../../../lib/db-types.js';
import { admitUserFromLti13Launch } from '../../../lib/enrollment/admission.js';
import { selectEnrollmentAdmissionDecision } from '../../../lib/enrollment/identity.js';
import { EnrollmentAdmissionDeniedError } from '../../../lib/enrollment/reconciliation.js';
import { idsEqual } from '../../../lib/id.js';
import { typedAsyncHandler } from '../../../lib/res-locals.js';
import { selectCourseInstancesWithStaffAccess } from '../../../models/course-instances.js';
import { selectCoursesWithEditAccess } from '../../../models/course.js';
import { setLti13CourseInstanceUpgradeAuthorization } from '../../lib/lti13-course-instance-upgrade.js';
import { Lti13Claim } from '../../lib/lti13.js';

import {
  Lti13CourseNavigationDone,
  Lti13CourseNavigationInstructor,
  Lti13CourseNavigationNotReady,
} from './lti13CourseNavigation.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

function prettyCourseName(ltiClaim: Lti13Claim) {
  const context = ltiClaim.context;

  if (!context) {
    return '(no context)';
  }

  if (context.label && context.title) {
    return `${context.label}: ${context.title}`;
  } else if (context.label) {
    return context.label;
  } else if (context.title) {
    return context.title;
  } else {
    return 'your course';
  }
}

async function courseInstancesAllowedToLink({
  course,
  authzData,
}: {
  course: Course;
  authzData: PageAuthzData;
}) {
  const course_instances = await selectCourseInstancesWithStaffAccess({
    course,
    authzData,
  });

  return course_instances.filter((ci) => ci.has_course_instance_permission_edit);
}

router.get(
  '/course_instances',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const unsafe_course_id = req.query.unsafe_course_id?.toString();
    if (!unsafe_course_id) {
      throw new HttpStatusError(400, 'Missing required parameter: unsafe_course_id');
    }

    const { authzData, course } = await constructCourseOrInstanceContext({
      user: res.locals.authn_user,
      course_id: unsafe_course_id,
      course_instance_id: null,
      ip: req.ip || null,
      req_date: res.locals.req_date,
      is_administrator: res.locals.is_administrator,
    });

    if (!authzData || !hasRole(authzData, ['Editor'])) {
      throw new HttpStatusError(403, 'Access denied');
    }

    const course_instances = await courseInstancesAllowedToLink({
      course,
      authzData: makePageAuthzData({
        authzData,
        is_administrator: res.locals.is_administrator,
      }),
    });

    let options: HtmlSafeString;

    if (course_instances.length === 0) {
      options = html`<option disabled selected value="">
        No course instances found where you have student data editor permissions.
      </option>`;
    } else {
      options = joinHtml(
        course_instances.map((ci) => {
          return html`<option value="${ci.id}">${ci.short_name}: ${ci.long_name}</option>`;
        }),
      );
    }

    res.send(options.toString());
  }),
);

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    if ('done' in req.query) {
      res.send(
        Lti13CourseNavigationDone({
          resLocals: res.locals,
          lti13_instance_id: req.params.lti13_instance_id,
        }),
      );
      return;
    }

    const ltiClaim = new Lti13Claim(req);
    // LTI claims are stored in the browser session. Verify that this launch
    // belongs to the LTI instance in the route before using them.
    if (
      req.session.authn_lti13_instance_id === undefined ||
      !idsEqual(req.session.authn_lti13_instance_id, req.params.lti13_instance_id)
    ) {
      ltiClaim.remove();
      throw new HttpStatusError(403, 'Access denied');
    }
    const courseName = prettyCourseName(ltiClaim);
    const role_instructor = ltiClaim.isRoleInstructor();

    // Get lti13_course_instance info, if present
    const lti13_course_instance = await queryOptionalRow(
      sql.select_lti13_course_instance,
      {
        lti13_instance_id: req.params.lti13_instance_id,
        deployment_id: ltiClaim.deployment_id,
        context_id: ltiClaim.context?.id,
      },
      Lti13CourseInstanceSchema,
    );

    if (lti13_course_instance) {
      const courseInstanceId = lti13_course_instance.course_instance_id;

      // Update lti13_course_instance on instructor login
      // helpful as LMS updates or we add features
      if (role_instructor) {
        await execute(sql.update_lti13_course_instance, {
          lti13_instance_id: req.params.lti13_instance_id,
          course_instance_id: lti13_course_instance.course_instance_id,
          deployment_id: ltiClaim.deployment_id,
          context_id: ltiClaim.context?.id,
          context_label: ltiClaim.context?.label,
          context_title: ltiClaim.context?.title,
          lineitems_url: ltiClaim.lineitems,
          context_memberships_url: ltiClaim.context_memberships_url,
          resource_link_id: ltiClaim.resource_link_id,
        });

        ltiClaim.remove();
        res.redirect(`/pl/course_instance/${courseInstanceId}/instructor/`);
        return;
      }

      const lti13CourseInstanceId = lti13_course_instance.id;
      const sub = ltiClaim.sub;
      const userId = res.locals.authn_user.id;
      // Remove the launch claims before admission. If admission redirects or
      // fails, the student must relaunch from the LMS.
      ltiClaim.remove();

      const decision = await selectEnrollmentAdmissionDecision({
        courseInstanceId,
        source: {
          type: 'invitation',
          matchedBy: 'lti13',
          lti13CourseInstanceId,
          sub,
        },
        userId,
      });
      if (decision.allowed && decision.invitationCandidate !== null) {
        const invitationEnrollmentId = decision.invitationCandidate.enrollment.id;
        try {
          await admitUserFromLti13Launch({
            courseInstanceId,
            expectedInvitationEnrollmentId: invitationEnrollmentId,
            ip: req.ip ?? null,
            isAdministrator: res.locals.is_administrator,
            lti13CourseInstanceId,
            onPlanGrantsRequired: () => {
              // Remember why this student was sent to the upgrade page. That
              // page checks the invitation again, and enrollment still requires
              // another launch from the LMS after payment.
              setLti13CourseInstanceUpgradeAuthorization({
                courseInstanceId,
                enrollmentId: invitationEnrollmentId,
                lti13CourseInstanceId,
                now: res.locals.req_date,
                session: req.session,
                sub,
                userId,
              });
            },
            reqDate: res.locals.req_date,
            sub,
            userId,
          });
        } catch (error) {
          if (!(error instanceof EnrollmentAdmissionDeniedError)) throw error;
          // The invitation changed after the first lookup. Continue to the
          // course route, which will decide whether the student can enter
          // without the LTI invitation.
        }
      }

      res.redirect(`/pl/course_instance/${courseInstanceId}/`);
      return;
    }

    // No course instance is linked to this LMS context.
    // Students get a "come back later" message
    if (!role_instructor) {
      res.send(
        Lti13CourseNavigationNotReady({
          resLocals: res.locals,
          courseName,
          ltiRoles: ltiClaim.roles,
        }),
      );
      return;
    }

    // Instructors get a prompt for linking
    res.send(
      Lti13CourseNavigationInstructor({
        resLocals: res.locals,
        courseName,
        courses: await selectCoursesWithEditAccess({
          user_id: res.locals.authn_user.id,
          is_administrator: res.locals.is_administrator,
        }),
        lti13_instance_id: req.params.lti13_instance_id,
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const { authzData, courseInstance } = await constructCourseOrInstanceContext({
      user: res.locals.authn_user,
      course_id: null,
      course_instance_id: req.body.unsafe_course_instance_id,
      ip: req.ip || null,
      req_date: res.locals.req_date,
      is_administrator: res.locals.is_administrator,
    });

    if (!authzData || !hasRole(authzData, ['Editor', 'Student Data Editor']) || !courseInstance) {
      throw new HttpStatusError(403, 'Access denied');
    }

    // Ensure that the selected course instance transitively belongs to the institution
    // to which the LTI 1.3 instance belongs.
    const course_instance = await queryOptionalRow(
      sql.select_lti13_institution_course_instance,
      {
        course_instance_id: courseInstance.id,
        lti13_instance_id: req.params.lti13_instance_id,
        authn_lti13_instance_id: req.session.authn_lti13_instance_id,
      },
      CourseInstanceSchema,
    );

    if (course_instance == null) {
      throw new HttpStatusError(403, 'Access denied');
    }

    const ltiClaim = new Lti13Claim(req);
    if (ltiClaim.isRoleInstructor()) {
      await execute(sql.insert_lti13_course_instance, {
        lti13_instance_id: req.params.lti13_instance_id,
        deployment_id: ltiClaim.deployment_id,
        context_id: ltiClaim.context?.id,
        context_label: ltiClaim.context?.label,
        context_title: ltiClaim.context?.title,
        course_instance_id: course_instance.id,
        lineitems_url: ltiClaim.lineitems,
        context_memberships_url: ltiClaim.context_memberships_url,
        resource_link_id: ltiClaim.resource_link_id,
      });

      res.redirect(`/pl/lti13_instance/${req.params.lti13_instance_id}/course_navigation?done`);
    } else {
      throw new HttpStatusError(403, 'Access denied');
    }
  }),
);

export default router;
