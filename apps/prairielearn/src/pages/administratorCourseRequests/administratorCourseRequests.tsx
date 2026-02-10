import { Router } from 'express';

import * as error from '@prairielearn/error';

import { PageLayout } from '../../components/PageLayout.js';
import { config } from '../../lib/config.js';
import {
  createCourseFromRequest,
  selectAllCourseRequests,
  updateCourseRequest,
} from '../../lib/course-request.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { selectAllInstitutions } from '../../models/institution.js';

import { AdministratorCourseRequests } from './administratorCourseRequests.html.js';

const router = Router();

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const rows = await selectAllCourseRequests();
    const institutions = await selectAllInstitutions();
    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Course Requests',
        navContext: {
          type: 'administrator',
          page: 'admin',
          subPage: 'courses',
        },
        options: {
          fullWidth: true,
        },
        content: (
          <AdministratorCourseRequests
            rows={rows}
            institutions={institutions}
            coursesRoot={config.coursesRoot}
            csrfToken={res.locals.__csrf_token}
            urlPrefix={res.locals.urlPrefix}
          />
        ),
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    if (req.body.__action === 'approve_deny_course_request') {
      await updateCourseRequest({
        approveDenyAction: req.body.approve_deny_action,
        courseRequestId: req.body.request_id,
        authnUser: res.locals.authn_user,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'create_course_from_request') {
      const jobSequenceId = await createCourseFromRequest({
        courseRequestId: req.body.request_id,
        shortName: req.body.short_name,
        title: req.body.title,
        institutionId: req.body.institution_id,
        displayTimezone: req.body.display_timezone,
        path: req.body.path,
        repoShortName: req.body.repository_short_name,
        githubUser: req.body.github_user?.length > 0 ? req.body.github_user : null,
        authnUser: res.locals.authn_user,
      });
      res.redirect(`/pl/administrator/jobSequence/${jobSequenceId}/`);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
