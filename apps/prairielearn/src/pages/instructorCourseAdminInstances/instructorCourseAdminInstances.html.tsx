import { Temporal } from '@js-temporal/polyfill';
import z from 'zod';

import { formatDateYMDHM } from '@prairielearn/formatter';
import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../../components/PageLayout.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { getPageContext } from '../../lib/client/page-context.js';
import { type CourseInstanceAuthz } from '../../models/course-instances.js';

import { InstructorCourseAdminInstancesPage } from './components/InstructorCourseAdminInstances.js';
import {
  type InstructorCourseAdminInstanceRow,
  InstructorCourseAdminInstanceRowSchema,
} from './instructorCourseAdminInstances.shared.js';

export type CourseInstanceAuthzRow = CourseInstanceAuthz & { enrollment_count?: number };

export function InstructorCourseAdminInstances({
  resLocals,
  courseInstances,
}: {
  resLocals: Record<string, any>;
  courseInstances: CourseInstanceAuthzRow[];
}) {
  const initialStartDate = Temporal.Now.zonedDateTimeISO(resLocals.course.timeZone).with({
    hour: 0,
    minute: 1,
    second: 0,
  });
  const initialStartDateFormatted = formatDateYMDHM(
    new Date(initialStartDate.epochMilliseconds),
    resLocals.course.time_zone,
  );

  const initialEndDate = initialStartDate.add({ months: 4 }).with({
    hour: 23,
    minute: 59,
    second: 0,
  });
  const initialEndDateFormatted = formatDateYMDHM(
    new Date(initialEndDate.epochMilliseconds),
    resLocals.course.time_zone,
  );

  const pageContext = getPageContext(resLocals);

  const safeCourseInstances: InstructorCourseAdminInstanceRow[] = z
    .array(InstructorCourseAdminInstanceRowSchema)
    .parse(
      courseInstances.map((ci) => ({
        courseInstance: {
          ...ci,
        },
        formatted_start_date: ci.formatted_start_date,
        formatted_end_date: ci.formatted_end_date,
        has_course_instance_permission_view: ci.has_course_instance_permission_view,
        has_course_instance_permission_edit: ci.has_course_instance_permission_edit,
        enrollment_count: ci.enrollment_count ?? 0,
      })),
    );

  return PageLayout({
    resLocals,
    pageTitle: 'Course Instances',
    navContext: {
      type: 'instructor',
      page: 'course_admin',
      subPage: 'instances',
    },
    options: {
      fullWidth: true,
    },
    content: (
      <>
        <CourseSyncErrorsAndWarnings
          authzData={resLocals.authz_data}
          course={resLocals.course}
          urlPrefix={pageContext.urlPrefix}
        />
        <Hydrate>
          <InstructorCourseAdminInstancesPage
            courseInstances={safeCourseInstances}
            courseShortName={resLocals.course.short_name}
            courseExample={resLocals.course.example_course}
            canEditCourse={pageContext.authz_data.has_course_permission_edit}
            needToSync={Boolean(resLocals.needToSync)}
            csrfToken={pageContext.__csrf_token}
            urlPrefix={pageContext.urlPrefix}
            timezone={resLocals.course.display_timezone}
            initialStartDateFormatted={initialStartDateFormatted}
            initialEndDateFormatted={initialEndDateFormatted}
          />
        </Hydrate>
      </>
    ),
  });
}
