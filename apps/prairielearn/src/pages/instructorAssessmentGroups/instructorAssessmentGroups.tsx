import { Router } from 'express';

import * as error from '@prairielearn/error';
import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { StaffGroupConfigSchema } from '../../lib/client/safe-db-types.js';
import { getAssessmentTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { randomGroups, uploadInstanceGroups } from '../../lib/group-update.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { assessmentFilenamePrefix } from '../../lib/sanitize-name.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import {
  selectGroupConfigForAssessment,
  selectGroupsForConfig,
  selectUidsNotInGroup,
} from '../../models/group.js';

import { InstructorAssessmentGroups } from './instructorAssessmentGroups.html.js';

const router = Router();

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_instance_permission_view'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'assessment'>(async (_req, res) => {
    const pageContext = extractPageContext(res.locals, {
      pageType: 'assessment',
      accessType: 'instructor',
    });
    const { assessment, assessment_set, course, course_instance } = pageContext;

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
          fullWidth: true,
        },
        content: (
          <Hydrate>
            <InstructorAssessmentGroups
              pageContext={pageContext}
              groupsCsvFilename={groupsCsvFilename}
              groupConfigInfo={staffGroupConfigInfo}
              groups={groups}
              notAssigned={notAssigned}
              trpcCsrfToken={trpcCsrfToken}
              isDevMode={config.devMode}
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
