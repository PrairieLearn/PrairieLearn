import * as path from 'path';

import { Router } from 'express';
import fs from 'fs-extra';

import * as error from '@prairielearn/error';
import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { compiledStylesheetTag } from '../../lib/assets.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { StaffGroupConfigSchema } from '../../lib/client/safe-db-types.js';
import { getAssessmentTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { normalizeGroupSettings } from '../../lib/group-config.js';
import { randomGroups, uploadInstanceGroups } from '../../lib/group-update.js';
import { computeStableHash } from '../../lib/json.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../lib/res-locals.js';
import { assessmentFilenamePrefix } from '../../lib/sanitize-name.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import {
  selectGroupConfigForAssessment,
  selectGroupsForConfig,
  selectUidsNotInGroup,
} from '../../models/group.js';
import type { AssessmentJsonInput } from '../../schemas/infoAssessment.js';

import {
  type GroupSettingsFormValues,
  InstructorAssessmentGroups,
} from './instructorAssessmentGroups.html.js';

const router = Router();

function getAssessmentPath(
  resLocals: Pick<ResLocalsForPage<'assessment'>, 'course' | 'course_instance' | 'assessment'>,
): string {
  return path.join(
    resLocals.course.path,
    'courseInstances',
    resLocals.course_instance.short_name!,
    'assessments',
    resLocals.assessment.tid!,
    'infoAssessment.json',
  );
}

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_instance_permission_view'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'assessment'>(async (_req, res) => {
    const { assessment, assessment_set, course, course_instance } = extractPageContext(res.locals, {
      pageType: 'assessment',
      accessType: 'instructor',
    });

    const groupsCsvFilename =
      assessmentFilenamePrefix(assessment, assessment_set, course_instance, course) + 'groups.csv';

    const groupConfigInfo = await selectGroupConfigForAssessment(assessment.id);
    const staffGroupConfigInfo = groupConfigInfo
      ? StaffGroupConfigSchema.parse(groupConfigInfo)
      : undefined;

    const [groups, notAssigned] = groupConfigInfo
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
    let origHash: string | null = null;
    let groupSettingsDefaults: GroupSettingsFormValues | null = null;
    try {
      const rawJson = (await fs.readJson(assessmentPath)) as AssessmentJsonInput;
      origHash = computeStableHash(rawJson.groups ?? null);
      groupSettingsDefaults = normalizeGroupSettings(rawJson);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Groups',
        navContext: {
          type: 'instructor',
          page: 'assessment',
          subPage: 'groups',
        },
        headContent: [compiledStylesheetTag('instructorAssessmentGroups.css')],
        options: {
          fullWidth: true,
        },
        content: (
          <Hydrate>
            <InstructorAssessmentGroups
              resLocals={res.locals}
              groupsCsvFilename={groupsCsvFilename}
              groupConfigInfo={staffGroupConfigInfo}
              groups={groups}
              notAssigned={notAssigned}
              trpcCsrfToken={trpcCsrfToken}
              isDevMode={config.devMode}
              origHash={origHash}
              groupSettingsDefaults={groupSettingsDefaults}
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
    const { assessment, course_instance, authn_user, authz_data, urlPrefix } = extractPageContext(
      res.locals,
      {
        pageType: 'assessment',
        accessType: 'instructor',
      },
    );

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
      res.redirect(urlPrefix + '/jobSequence/' + job_sequence_id);
    } else if (req.body.__action === 'random_assessment_groups') {
      const job_sequence_id = await randomGroups({
        course_instance,
        assessment,
        user_id: res.locals.user.id,
        authn_user_id: authn_user.id,
        max_group_size: Number(req.body.max_group_size),
        min_group_size: Number(req.body.min_group_size),
        authzData: authz_data,
      });
      res.redirect(urlPrefix + '/jobSequence/' + job_sequence_id);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
