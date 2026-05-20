import * as path from 'path';

import { Router } from 'express';
import fs from 'fs-extra';

import * as error from '@prairielearn/error';
import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { StaffGroupConfigSchema } from '../../lib/client/safe-db-types.js';
import { getAssessmentTrpcUrl, getCourseInstanceJobSequenceUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { computeScopedJsonHash } from '../../lib/editorUtil.js';
import { type GroupSettingsFormValues, normalizeGroupSettings } from '../../lib/group-config.js';
import { uploadInstanceGroups } from '../../lib/group-update.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../lib/res-locals.js';
import { assessmentFilenamePrefix } from '../../lib/sanitize-name.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import { selectAssessmentHasInstances } from '../../models/assessment-instance.js';
import {
  selectGroupConfigForAssessment,
  selectGroupsForConfig,
  selectUidsNotInGroup,
} from '../../models/group.js';
import type { AssessmentJsonInput } from '../../schemas/infoAssessment.js';

import { InstructorAssessmentGroups } from './instructorAssessmentGroups.html.js';

const router = Router();

function getAssessmentPath(
  resLocals: Pick<ResLocalsForPage<'assessment'>, 'course' | 'course_instance' | 'assessment'>,
): string {
  return path.join(
    resLocals.course.path,
    'courseInstances',
    resLocals.course_instance.short_name,
    'assessments',
    resLocals.assessment.tid!,
    'infoAssessment.json',
  );
}

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_preview', 'has_course_instance_permission_view'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'assessment'>(async (_req, res) => {
    const pageContext = extractPageContext(res.locals, {
      pageType: 'assessment',
      accessType: 'instructor',
    });
    const { assessment, assessment_set, course, course_instance, authz_data } = pageContext;
    const permissions = {
      isExampleCourse: course.example_course,
      hasCoursePermissionEdit: authz_data.has_course_permission_edit,
      hasCourseInstancePermissionView: authz_data.has_course_instance_permission_view,
      hasCourseInstancePermissionEdit: authz_data.has_course_instance_permission_edit,
    };

    const groupsCsvFilename =
      assessmentFilenamePrefix(assessment, assessment_set, course_instance, course) + 'groups.csv';

    const groupConfigInfo = await selectGroupConfigForAssessment(assessment.id);
    const staffGroupConfigInfo = groupConfigInfo
      ? StaffGroupConfigSchema.parse(groupConfigInfo)
      : undefined;

    const [groups, notAssigned] =
      groupConfigInfo && permissions.hasCourseInstancePermissionView
        ? await Promise.all([
            selectGroupsForConfig(groupConfigInfo.id),
            selectUidsNotInGroup({
              group_config_id: groupConfigInfo.id,
              course_instance_id: groupConfigInfo.course_instance_id,
            }),
          ])
        : [undefined, undefined];

    const trpcCsrfToken = generatePrefixCsrfToken(
      {
        url: getAssessmentTrpcUrl({
          courseInstanceId: course_instance.id,
          assessmentId: assessment.id,
        }),
        authn_user_id: res.locals.authn_user.id,
      },
      config.secretKey,
    );

    const assessmentPath = getAssessmentPath(res.locals);
    const origHash = await computeScopedJsonHash<AssessmentJsonInput>(
      assessmentPath,
      (json) => json.groups ?? {},
    );
    let groupSettingsDefaults: GroupSettingsFormValues | null = null;
    try {
      const rawJson = (await fs.readJson(assessmentPath)) as AssessmentJsonInput;
      groupSettingsDefaults = normalizeGroupSettings(rawJson);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }

    const hasAssessmentInstances = await selectAssessmentHasInstances(assessment.id);

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Groups',
        navContext: {
          type: 'instructor',
          page: 'assessment',
          subPage: 'groups',
        },
        options: {
          // Disabled so the sticky save alert can span the full viewport width.
          // The page content uses its own `container` wrapper for constrained width.
          contentPadding: false,
        },
        content: (
          <Hydrate>
            <InstructorAssessmentGroups
              courseInstanceId={course_instance.id}
              assessment={assessment}
              assessmentSet={assessment_set}
              permissions={permissions}
              csrfToken={pageContext.__csrf_token}
              groupsCsvFilename={groupsCsvFilename}
              groupConfigInfo={staffGroupConfigInfo}
              groups={groups}
              notAssigned={notAssigned}
              trpcCsrfToken={trpcCsrfToken}
              isDevMode={config.devMode}
              origHash={origHash}
              groupSettingsDefaults={groupSettingsDefaults}
              hasAssessmentInstances={hasAssessmentInstances}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'assessment'>(async (req, res) => {
    const { assessment, course_instance, authn_user, authz_data } = extractPageContext(res.locals, {
      pageType: 'assessment',
      accessType: 'instructor',
    });

    if (!authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    if (req.body.__action === 'upload_assessment_groups') {
      const job_sequence_id = await uploadInstanceGroups({
        course_instance,
        assessment,
        csvFile: req.file,
        user_id: res.locals.user.id,
        authn_user_id: authn_user.id,
        authzData: authz_data,
      });
      res.redirect(getCourseInstanceJobSequenceUrl(course_instance.id, job_sequence_id));
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
