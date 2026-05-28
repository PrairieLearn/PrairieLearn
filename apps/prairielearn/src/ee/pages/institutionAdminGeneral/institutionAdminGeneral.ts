import { Router } from 'express';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { markdownToHtml } from '@prairielearn/markdown';

import { typedAsyncHandler } from '../../../lib/res-locals.js';
import {
  COURSE_REQUEST_MESSAGE_MAX_LENGTH,
  selectInstitutionSettings,
  updateInstitutionSetting,
} from '../../../models/institution-settings.js';
import { selectAndAuthzInstitutionAsAdmin } from '../../lib/selectAndAuthz.js';

import { InstitutionAdminGeneral } from './institutionAdminGeneral.html.js';

const router = Router({ mergeParams: true });

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const institution = await selectAndAuthzInstitutionAsAdmin({
      institution_id: req.params.institution_id,
      user_id: res.locals.authn_user.id,
      access_as_administrator: res.locals.access_as_administrator,
    });

    const institutionSettings = await selectInstitutionSettings({
      institution_id: institution.id,
    });
    const courseRequestMessage = institutionSettings?.course_request_message ?? null;
    const courseRequestMessageHtml = courseRequestMessage
      ? markdownToHtml(courseRequestMessage, {
          allowHtml: false,
          interpretMath: false,
        })
      : '';

    res.send(
      InstitutionAdminGeneral({
        institution,
        courseRequestMessage,
        courseRequestMessageHtml,
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const institution = await selectAndAuthzInstitutionAsAdmin({
      institution_id: req.params.institution_id,
      user_id: res.locals.authn_user.id,
      access_as_administrator: res.locals.access_as_administrator,
    });

    if (req.body.__action === 'update_course_request_message') {
      const newMessage =
        typeof req.body.course_request_message === 'string' &&
        req.body.course_request_message.trim().length > 0
          ? req.body.course_request_message
          : null;

      if (newMessage !== null && newMessage.length > COURSE_REQUEST_MESSAGE_MAX_LENGTH) {
        throw new HttpStatusError(
          400,
          `The course request message must be at most ${COURSE_REQUEST_MESSAGE_MAX_LENGTH} characters.`,
        );
      }

      await updateInstitutionSetting({
        institution_id: institution.id,
        field: 'course_request_message',
        value: newMessage,
        authn_user_id: res.locals.authn_user.id,
      });

      flash('success', 'Successfully updated the course request message.');
      res.redirect(req.originalUrl);
    } else {
      throw new HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
