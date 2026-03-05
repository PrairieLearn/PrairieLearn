import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { Hydrate } from '@prairielearn/react/server';

import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { config } from '../../lib/config.js';
import { getCourseOwners } from '../../lib/course.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';

import { InstructorStudentsLabels } from './instructorStudentsLabels.html.js';
import { getStudentLabelsWithUserData } from './queries.js';
import { getStudentLabelsTrpcProps } from './utils/trpc-setup.js';

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
      __csrf_token,
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

    const labels = await getStudentLabelsWithUserData(courseInstance.id);
    const canEdit = authz_data.has_course_instance_permission_edit ?? false;

    const { trpcUrl, trpcCsrfToken, origHash } = await getStudentLabelsTrpcProps({
      course,
      courseInstance,
      authnUserId: res.locals.authn_user.id,
    });

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
              csrfToken={__csrf_token}
              trpcCsrfToken={trpcCsrfToken}
              trpcUrl={trpcUrl}
              courseInstanceId={courseInstance.id}
              initialLabels={labels}
              canEdit={canEdit}
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
