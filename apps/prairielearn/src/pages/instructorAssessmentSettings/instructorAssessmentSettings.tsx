import * as path from 'path';

import { Router } from 'express';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import {
  StaffAssessmentModuleSchema,
  StaffAssessmentSetSchema,
} from '../../lib/client/safe-db-types.js';
import { config } from '../../lib/config.js';
import { getOriginalHash } from '../../lib/editors.js';
import { courseRepoContentUrl } from '../../lib/github.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { encodePath } from '../../lib/uri-util.js';
import { getCanonicalHost } from '../../lib/url.js';

import { InstructorAssessmentSettings } from './instructorAssessmentSettings.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  typedAsyncHandler<'assessment'>(async (req, res) => {
    const { assessment, assessment_set, course, course_instance, authz_data, urlPrefix } =
      extractPageContext(res.locals, {
        pageType: 'assessment',
        accessType: 'instructor',
      });

    const tids = await sqldb.queryScalars(
      sql.tids,
      { course_instance_id: course_instance.id },
      z.string(),
    );
    const assessmentSets = await sqldb.queryRows(
      sql.select_assessment_sets,
      { course_id: course.id },
      StaffAssessmentSetSchema,
    );
    const assessmentModules = await sqldb.queryRows(
      sql.select_assessment_modules,
      { course_id: course.id },
      StaffAssessmentModuleSchema,
    );
    const host = getCanonicalHost(req);
    const studentLink = new URL(
      `/pl/course_instance/${course_instance.id}/assessment/${assessment.id}`,
      host,
    ).href;
    const publicLink = new URL(
      `/pl/public/course_instance/${course_instance.id}/assessment/${assessment.id}/questions`,
      host,
    ).href;
    const infoAssessmentPath = encodePath(
      path.join(
        'courseInstances',
        course_instance.short_name,
        'assessments',
        assessment.tid!,
        'infoAssessment.json',
      ),
    );
    const fullInfoAssessmentPath = path.join(course.path, infoAssessmentPath);

    const origHash = (await getOriginalHash(fullInfoAssessmentPath)) ?? '';

    const assessmentGHLink = courseRepoContentUrl(
      course,
      `courseInstances/${course_instance.short_name}/assessments/${assessment.tid}`,
    );

    const canEdit = authz_data.has_course_permission_edit && !course.example_course;

    const trpcCsrfToken = generatePrefixCsrfToken(
      {
        url: `/pl/course_instance/${course_instance.id}/instructor/assessment/${assessment.id}/trpc`,
        authn_user_id: res.locals.authn_user.id,
      },
      config.secretKey,
    );

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Settings',
        navContext: {
          type: 'instructor',
          page: 'assessment',
          subPage: 'settings',
        },
        content: (
          <Hydrate>
            <InstructorAssessmentSettings
              trpcCsrfToken={trpcCsrfToken}
              urlPrefix={urlPrefix}
              canEdit={canEdit}
              origHash={origHash}
              assessment={assessment}
              assessmentSet={assessment_set}
              hasCoursePermissionView={authz_data.has_course_permission_view}
              assessmentGHLink={assessmentGHLink}
              tids={tids}
              studentLink={studentLink}
              publicLink={publicLink}
              infoAssessmentPath={infoAssessmentPath}
              assessmentSets={assessmentSets}
              assessmentModules={assessmentModules}
              courseInstanceId={String(course_instance.id)}
              assessmentId={String(assessment.id)}
              isDevMode={config.devMode}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
