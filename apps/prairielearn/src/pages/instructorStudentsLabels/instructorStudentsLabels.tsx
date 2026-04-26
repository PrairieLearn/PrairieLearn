import * as path from 'path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { config } from '../../lib/config.js';
import { getCourseOwners } from '../../lib/course.js';
import { computeScopedJsonHash } from '../../lib/editorUtil.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import type { CourseInstanceJsonInput } from '../../schemas/infoCourseInstance.js';

import { InstructorStudentsLabels } from './instructorStudentsLabels.html.js';
import { getStudentLabelsWithUserData } from './queries.js';

const router = Router();

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_instance_permission_view'],
    unauthorizedUsers: 'passthrough',
  }),
  asyncHandler(async (req, res) => {
    const {
      course_instance: courseInstance,
      authz_data,
      course,
    } = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });

    if (!authz_data.has_course_instance_permission_view) {
      const courseOwners = await getCourseOwners(course.id);
      res.status(403).send(
        InsufficientCoursePermissionsCardPage({
          resLocals: res.locals,
          navContext: {
            type: 'instructor',
            page: 'students',
            subPage: 'student_labels',
          },
          courseOwners,
          pageTitle: 'Student labels',
          requiredPermissions: 'Student Data Viewer',
        }),
      );
      return;
    }

    const initialLabels = await getStudentLabelsWithUserData(courseInstance);
    const canEdit =
      authz_data.has_course_permission_edit &&
      (authz_data.has_course_instance_permission_edit ?? false) &&
      !course.example_course;

    const trpcUrl = `/pl/course_instance/${courseInstance.id}/instructor/trpc`;
    const trpcCsrfToken = generatePrefixCsrfToken(
      { url: trpcUrl, authn_user_id: res.locals.authn_user.id },
      config.secretKey,
    );
    const origHash = await computeScopedJsonHash<CourseInstanceJsonInput>(
      path.join(
        course.path,
        'courseInstances',
        courseInstance.short_name,
        'infoCourseInstance.json',
      ),
      (json) => json.studentLabels ?? [],
    );

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Student labels',
        navContext: {
          type: 'instructor',
          page: 'students',
          subPage: 'student_labels',
        },
        content: (
          <Hydrate>
            <InstructorStudentsLabels
              trpcCsrfToken={trpcCsrfToken}
              courseInstanceId={courseInstance.id}
              initialLabels={initialLabels}
              canEdit={canEdit}
              isExampleCourse={course.example_course}
              isDevMode={config.devMode}
              origHash={origHash}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
