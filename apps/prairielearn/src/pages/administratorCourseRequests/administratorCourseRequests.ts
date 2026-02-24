import { Router } from 'express';

import * as error from '@prairielearn/error';

import { config } from '../../lib/config.js';
import {
  createCourseFromRequest,
  denyCourseRequest,
  selectAllCourseRequests,
  updateCourseRequestNote,
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
      AdministratorCourseRequests({
        rows,
        institutions,
        coursesRoot: config.coursesRoot,
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    if (req.body.__action === 'deny_course_request') {
      await denyCourseRequest({
        courseRequestId: req.body.request_id,
        authnUser: res.locals.authn_user,
      });
    } else if (req.body.__action === 'create_course_from_request') {
      const jobSequenceId = await createCourseFromRequest({
        courseRequestId: req.body.request_id,
        shortName: req.body.short_name,
        title: req.body.title,
        institutionId: req.body.institution_id,
        displayTimezone: req.body.display_timezone,
        path: req.body.path,
        repoShortName: req.body.repository_short_name,
        githubUser: req.body.github_user.length > 0 ? req.body.github_user : null,
        authnUser: res.locals.authn_user,
      });
      return res.redirect(`/pl/administrator/jobSequence/${jobSequenceId}/`);
    } else if (req.body.__action === 'update_course_request_note') {
      await updateCourseRequestNote({
        courseRequestId: req.body.request_id,
        note: req.body.note,
      });
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
    res.redirect(req.originalUrl);
  }),
);

export default router;
