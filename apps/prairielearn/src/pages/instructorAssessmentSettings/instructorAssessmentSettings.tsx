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
import {
  getAssessmentTrpcUrl,
  getPublicAssessmentUrl,
  getStudentAssessmentUrl,
} from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { type AssessmentToolsConfig, getOriginalHash } from '../../lib/editors.js';
import { courseRepoContentUrl } from '../../lib/github.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { encodePath } from '../../lib/uri-util.js';
import { getCanonicalHost } from '../../lib/url.js';
import { selectAssessmentModulesForCourse } from '../../models/assessment-module.js';
import { selectAssessmentSetsForCourse } from '../../models/assessment-set.js';
import { selectAssessmentToolDefaults } from '../../models/assessment.js';
import { EnumAssessmentToolSchema } from '../../schemas/infoAssessment.js';

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
    const assessmentSets = z
      .array(StaffAssessmentSetSchema)
      .parse(await selectAssessmentSetsForCourse(course.id));
    const assessmentModules = z
      .array(StaffAssessmentModuleSchema)
      .parse(await selectAssessmentModulesForCourse(course.id));
    const host = getCanonicalHost(req);
    const studentLink = new URL(getStudentAssessmentUrl(course_instance.id, assessment.id), host)
      .href;
    const publicLink = new URL(
      `${getPublicAssessmentUrl(course_instance.id, assessment.id)}/questions`,
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

    const toolDefaultRows = await selectAssessmentToolDefaults({
      assessment_id: assessment.id,
    });
    const enabledTools = new Set(toolDefaultRows.filter((r) => r.enabled).map((r) => r.tool));
    const assessmentTools: AssessmentToolsConfig = EnumAssessmentToolSchema.options.map((tool) => ({
      name: tool,
      label: tool.charAt(0).toUpperCase() + tool.slice(1),
      enabled: enabledTools.has(tool),
    }));

    const assessmentGHLink = courseRepoContentUrl(
      course,
      `courseInstances/${course_instance.short_name}/assessments/${assessment.tid}`,
    );

    const canEdit = authz_data.has_course_permission_edit && !course.example_course;

    const trpcCsrfToken = generatePrefixCsrfToken(
      {
        url: getAssessmentTrpcUrl({
          courseInstanceId: String(course_instance.id),
          assessmentId: String(assessment.id),
        }),
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
              assessmentSets={assessmentSets}
              assessmentModules={assessmentModules}
              courseInstance={course_instance}
              isDevMode={config.devMode}
              assessmentTools={assessmentTools}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
