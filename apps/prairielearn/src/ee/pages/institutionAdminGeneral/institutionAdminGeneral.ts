import { Router } from 'express';
import { z } from 'zod';

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

const BodySchema = z.object({
  __action: z.literal('update_course_request_message'),
  course_request_message: z
    .string()
    .max(COURSE_REQUEST_MESSAGE_MAX_LENGTH)
    .transform((value) => value.trim()),
});

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

    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpStatusError(
        400,
        `The course request message must be at most ${COURSE_REQUEST_MESSAGE_MAX_LENGTH} characters.`,
      );
    }

    await updateInstitutionSetting({
      institution_id: institution.id,
      field: 'course_request_message',
      value: parsed.data.course_request_message,
      authn_user_id: res.locals.authn_user.id,
    });

    flash('success', 'Successfully updated the course request message.');
    res.redirect(req.originalUrl);
  }),
);

export default router;
