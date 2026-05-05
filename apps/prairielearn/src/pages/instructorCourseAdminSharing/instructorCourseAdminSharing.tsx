import * as path from 'path';

import { Router } from 'express';

import * as error from '@prairielearn/error';
import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { getCourseTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { getOriginalHash } from '../../lib/editorUtil.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getCanonicalHost } from '../../lib/url.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import { selectCanChooseSharingName } from '../../models/course.js';
import { selectSharingSetsForCourse } from '../../models/sharing-set.js';

import { InstructorCourseAdminSharing } from './instructorCourseAdminSharing.html.js';

const router = Router();

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_own'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'course'>(async (req, res) => {
    if (!res.locals.question_sharing_enabled) {
      throw new error.HttpStatusError(403, 'Access denied (feature not available)');
    }

    const sharingSets = await selectSharingSetsForCourse({ course_id: res.locals.course.id });

    const host = getCanonicalHost(req);
    const publicSharingLink = new URL(`/pl/public/course/${res.locals.course.id}/questions`, host)
      .href;

    const canChooseSharingName = await selectCanChooseSharingName(res.locals.course);

    const infoCoursePath = path.join(res.locals.course.path, 'infoCourse.json');
    const origHash = (await getOriginalHash(infoCoursePath)) ?? '';

    const canEdit =
      res.locals.authz_data.has_course_permission_own && !res.locals.course.example_course;

    const trpcCsrfToken = generatePrefixCsrfToken(
      { url: getCourseTrpcUrl(res.locals.course.id), authn_user_id: res.locals.authn_user.id },
      config.secretKey,
    );

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Course sharing',
        navContext: {
          type: 'instructor',
          page: 'course_admin',
          subPage: 'sharing',
        },
        content: (
          <Hydrate>
            <InstructorCourseAdminSharing
              sharingName={res.locals.course.sharing_name}
              sharingToken={res.locals.course.sharing_token}
              sharingSets={sharingSets}
              publicSharingLink={publicSharingLink}
              canChooseSharingName={canChooseSharingName}
              canEdit={canEdit}
              origHash={origHash}
              courseId={res.locals.course.id}
              trpcCsrfToken={trpcCsrfToken}
              isDevMode={config.devMode}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
