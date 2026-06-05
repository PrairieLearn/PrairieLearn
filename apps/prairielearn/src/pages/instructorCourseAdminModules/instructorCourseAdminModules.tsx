import * as path from 'path';

import { Router } from 'express';
import { z } from 'zod';

import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { StaffAssessmentModuleSchema } from '../../lib/client/safe-db-types.js';
import { getCourseTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { computeScopedJsonHash } from '../../lib/editorUtil.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { selectAssessmentModulesForCourse } from '../../models/assessment-module.js';
import { type CourseJsonInput } from '../../schemas/infoCourse.js';

import { AssessmentModulesPage } from './components/AssessmentModulesTable.js';

const router = Router();

router.get(
  '/',
  typedAsyncHandler<'course'>(async (_req, res) => {
    const { course, authz_data } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    const assessmentModules = await selectAssessmentModulesForCourse(course.id);

    const origHash = await computeScopedJsonHash<CourseJsonInput>(
      path.join(course.path, 'infoCourse.json'),
      (json) => json.assessmentModules ?? [],
    );

    const allowEdit = authz_data.has_course_permission_edit && !course.example_course;

    const trpcCsrfToken = generatePrefixCsrfToken(
      { url: getCourseTrpcUrl(course.id), authn_user_id: res.locals.authn_user.id },
      config.secretKey,
    );

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Assessment Modules',
        navContext: {
          type: 'instructor',
          page: 'course_admin',
          subPage: 'modules',
        },
        content: (
          <Hydrate>
            <AssessmentModulesPage
              trpcCsrfToken={trpcCsrfToken}
              courseId={course.id}
              initialModules={z.array(StaffAssessmentModuleSchema).parse(assessmentModules)}
              allowEdit={allowEdit}
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
