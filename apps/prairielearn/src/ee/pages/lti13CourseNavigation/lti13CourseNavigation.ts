import { Router } from 'express';

import { HttpStatusError } from '@prairielearn/error';
import { type HtmlSafeString, html, joinHtml } from '@prairielearn/html';
import { execute, loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { type PageAuthzData, hasRole, makePageAuthzData } from '../../../lib/authz-data-lib.js';
import { constructCourseOrInstanceContext } from '../../../lib/authz-data.js';
import {
  clearCourseInstanceAdmissionContinuation,
  replaceLti13ContinuationWithOrdinary,
  setLti13CourseInstanceAdmissionContinuation,
} from '../../../lib/course-instance-admission-continuation.js';
import {
  type Course,
  CourseInstanceSchema,
  Lti13CourseInstanceSchema,
} from '../../../lib/db-types.js';
import { idsEqual } from '../../../lib/id.js';
import { typedAsyncHandler } from '../../../lib/res-locals.js';
import { admitUserWithCourseInstanceAdmissionSelection } from '../../../models/course-instance-admission-continuation.js';
import { selectCourseInstancesWithStaffAccess } from '../../../models/course-instances.js';
import { selectCoursesWithEditAccess } from '../../../models/course.js';
import { selectEnrollmentAdmissionDecision } from '../../../models/enrollment-identity.js';
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
    const authnLti13InstanceId = req.session.authn_lti13_instance_id;
    if (
      (typeof authnLti13InstanceId !== 'string' && typeof authnLti13InstanceId !== 'number') ||
      !idsEqual(authnLti13InstanceId, req.params.lti13_instance_id)
    ) {
      clearCourseInstanceAdmissionContinuation(req.session);
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
      const lti13AdmissionContext = !role_instructor
        ? Object.freeze({
            courseInstanceId: lti13_course_instance.course_instance_id,
            ip: req.ip ?? null,
            isAdministrator: res.locals.is_administrator,
            launchExpiresAtSeconds: ltiClaim.exp,
            lti13CourseInstanceId: lti13_course_instance.id,
            reqDate: res.locals.req_date,
            sub: ltiClaim.sub,
            userId: res.locals.authn_user.id,
          })
        : null;

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

        // TODO: Set course/instance staff permissions for LMS course staff here?
      }

      // LTI claims are not used after this page so remove them from the session
      ltiClaim.remove();

      if (lti13AdmissionContext !== null) {
        const continuation = setLti13CourseInstanceAdmissionContinuation({
          courseInstanceId: lti13AdmissionContext.courseInstanceId,
          launchExpiresAtSeconds: lti13AdmissionContext.launchExpiresAtSeconds,
          lti13CourseInstanceId: lti13AdmissionContext.lti13CourseInstanceId,
          session: req.session,
          sub: lti13AdmissionContext.sub,
          userId: lti13AdmissionContext.userId,
        });
        const source = Object.freeze({
          type: 'lti13' as const,
          lti13CourseInstanceId: lti13AdmissionContext.lti13CourseInstanceId,
          sub: lti13AdmissionContext.sub,
        });
        const decision = await selectEnrollmentAdmissionDecision(
          {
            courseInstanceId: lti13AdmissionContext.courseInstanceId,
            lti13Identity: {
              lti13CourseInstanceId: lti13AdmissionContext.lti13CourseInstanceId,
              sub: lti13AdmissionContext.sub,
            },
            userId: lti13AdmissionContext.userId,
          },
          source,
        );

        if (decision.allowed) {
          const result = await admitUserWithCourseInstanceAdmissionSelection({
            courseInstanceId: lti13AdmissionContext.courseInstanceId,
            ip: lti13AdmissionContext.ip,
            isAdministrator: lti13AdmissionContext.isAdministrator,
            reqDate: lti13AdmissionContext.reqDate,
            selection: {
              continuation,
              plan: { source, type: 'lti13_roster_invitation' },
              type: 'lti13',
            },
            session: req.session,
            userId: lti13AdmissionContext.userId,
          });
          if (result.type === 'blocked') {
            clearCourseInstanceAdmissionContinuation(req.session);
          }
        } else if (decision.reason === 'already_joined' || decision.reason === 'blocked') {
          clearCourseInstanceAdmissionContinuation(req.session);
        } else {
          replaceLti13ContinuationWithOrdinary({ continuation, session: req.session });
        }
      }

      // Redirect to linked course instance
      const courseInstanceId =
        lti13AdmissionContext?.courseInstanceId ?? lti13_course_instance.course_instance_id;
      res.redirect(
        `/pl/course_instance/${courseInstanceId}/${role_instructor ? 'instructor/' : ''}`,
      );
      return;
    }

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
