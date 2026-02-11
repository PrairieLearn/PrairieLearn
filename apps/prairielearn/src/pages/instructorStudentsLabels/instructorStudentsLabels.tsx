import * as path from 'path';

import * as trpcExpress from '@trpc/server/adapters/express';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { config } from '../../lib/config.js';
import { getCourseOwners } from '../../lib/course.js';
import { computeCourseInstanceJsonHash } from '../../lib/courseInstanceJson.js';
import { handleTrpcError } from '../../lib/trpc.js';
import { getUrl } from '../../lib/url.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';

import { InstructorStudentsLabels } from './instructorStudentsLabels.html.js';
import { getStudentLabelsWithUserData } from './queries.js';
import { createTRPCContext, studentLabelsRouter } from './trpc.js';

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

    const search = getUrl(req).search;

    // Compute origHash for optimistic concurrency
    const courseInstancePath = path.join(course.path, 'courseInstances', courseInstance.short_name);
    const courseInstanceJsonPath = path.join(courseInstancePath, 'infoCourseInstance.json');
    const origHash = await computeCourseInstanceJsonHash(courseInstanceJsonPath);

    // Generate a prefix-based CSRF token for tRPC requests
    const trpcCsrfToken = generatePrefixCsrfToken(
      {
        url: req.originalUrl.split('?')[0] + '/trpc',
        authn_user_id: res.locals.authn_user.id,
      },
      config.secretKey,
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
              csrfToken={__csrf_token}
              trpcCsrfToken={trpcCsrfToken}
              courseInstanceId={courseInstance.id}
              initialLabels={labels}
              canEdit={canEdit}
              isDevMode={config.devMode}
              search={search}
              origHash={origHash}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

router.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: studentLabelsRouter,
    createContext: createTRPCContext,
    onError: handleTrpcError,
  }),
);

export default router;
