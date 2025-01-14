import * as express from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryAsync, queryRow } from '@prairielearn/postgres';

import { selectCourseHasAssessments } from '../../lib/assessment.js';
import { CourseInstanceSchema } from '../../lib/db-types.js';
import { selectCourseHasCourseInstances } from '../../models/course-instances.js';
import { selectCourseHasQuestions } from '../../models/questions.js';

import {
  InstructorCourseAdminOnboarding,
  type OnboardingStepInfo,
} from './instructorCourseAdminOnboarding.html.js';

const sql = loadSqlEquiv(import.meta.url);

const router = express.Router();

/**
 * A course starts with one staffmember. Once the course has two or more
 * staff members, another one has been added and the onboarding step is complete.
 *
 * This function returns if the course has at least two staff members.
 *
 */
export async function selectCourseHasAddedStaff({ course_id }: { course_id: string }) {
  return await queryRow(
    sql.select_course_has_staff,
    {
      course_id,
    },
    z.boolean(),
  );
}

/**
 * Get the first course instance for a course. Used for onboarding redirect to assessments.
 */
export async function selectFirstCourseInstance({ course_id }: { course_id: string }) {
  return await queryRow(
    sql.select_first_course_instance,
    {
      course_id,
    },
    CourseInstanceSchema,
  );
}

/**
 * Update the onboarding_dismissed field for a course.
 */
export async function updateCourseOnboardingDismissed({
  course_id,
  onboarding_dismissed,
}: {
  course_id: string;
  onboarding_dismissed: boolean;
}) {
  return await queryAsync(sql.update_course_onboarding_dismissed, {
    course_id,
    onboarding_dismissed,
  });
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (res.locals.course.onboarding_dismissed) {
      throw new HttpStatusError(400, 'Onboarding already dismissed');
    }
    const course_id = res.locals.course.id; // TODO/CHECK: Should this be handled with an error?

    const courseHasCourseInstance = await selectCourseHasCourseInstances({ course_id });

    let assessmentsPageLink: string | undefined;

    if (courseHasCourseInstance) {
      const first_course_instance = await selectFirstCourseInstance({ course_id });
      assessmentsPageLink = `/pl/course_instance/${first_course_instance.id}/instructor/instance_admin/assessments`;
    }

    const steps: OnboardingStepInfo[] = [
      {
        header: 'Add Course Staff',
        description:
          'Invite users to the course staff to help manage and deliver the course. If you are working alone, you can skip this step.',
        link: 'staff',
        isComplete: await selectCourseHasAddedStaff({ course_id }),
        optionalToComplete: true,
      },
      {
        header: 'Create Your First Question',
        description:
          "A question is a problem or task that tests a student's understanding of a specific concept.",
        link: 'questions',
        isComplete: await selectCourseHasQuestions({ course_id }),
      },
      {
        header: 'Create a Course Instance',
        description:
          'A course instance contains the assessments and other configuration for a single offering of a course.',
        link: 'instances',
        isComplete: await selectCourseHasCourseInstances({ course_id }),
      },
      {
        header: 'Create an Assessment',
        description:
          "An assessment is a collection of questions designed to build or evaluate a student's knowledge.",
        link: assessmentsPageLink,
        isComplete: await selectCourseHasAssessments({ course_id }),
      },
    ];

    res.send(
      InstructorCourseAdminOnboarding({
        resLocals: res.locals,
        steps,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new HttpStatusError(403, 'Access denied. Must be course editor to make changes.');
    }

    if (res.locals.course.example_course) {
      throw new HttpStatusError(403, 'Access denied. Cannot make changes to example course.');
    }

    if (res.locals.course.onboarding_dismissed) {
      throw new HttpStatusError(400, 'Onboarding already dismissed');
    }

    const course_id = res.locals.course.id;

    // Excludes selectCourseHasAddedStaff, since adding staff is optional
    const allRequiredOnboardingTasks = [
      await selectCourseHasQuestions({ course_id }),
      await selectCourseHasCourseInstances({ course_id }),
      await selectCourseHasAssessments({ course_id }),
    ];

    const allRequiredOnboardingTasksComplete = allRequiredOnboardingTasks.every((task) => task);

    if (!allRequiredOnboardingTasksComplete) {
      throw new HttpStatusError(400, 'All required onboarding tasks must be complete');
    }

    if (req.body.__action === 'dismiss_onboarding') {
      await updateCourseOnboardingDismissed({
        course_id: res.locals.course.id,
        onboarding_dismissed: true,
      });
    } else {
      throw new HttpStatusError(400, `Unknown __action: ${req.body.__action}`);
    }
    flash(
      'success',
      'Onboarding dismissed. You can return to the onboarding page through the Course Settings tab.',
    );
    res.redirect(`${res.locals.urlPrefix}/course_admin/settings`);
  }),
);

export default router;
