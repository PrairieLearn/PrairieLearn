import { Router } from 'express';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { markdownToHtml } from '@prairielearn/markdown';
import { runInTransactionAsync } from '@prairielearn/postgres';

import { typedAsyncHandler } from '../../../lib/res-locals.js';
import { insertAuditLog } from '../../../models/audit-log.js';
import {
  selectInstitutionSettings,
  updateInstitutionCourseRequestMessage,
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

      await runInTransactionAsync(async () => {
        const oldSettings = await selectInstitutionSettings({ institution_id: institution.id });
        const updatedSettings = await updateInstitutionCourseRequestMessage({
          institution_id: institution.id,
          course_request_message: newMessage,
        });
        await insertAuditLog({
          authn_user_id: res.locals.authn_user.id,
          table_name: 'institution_settings',
          action: 'update',
          institution_id: institution.id,
          old_state: oldSettings,
          new_state: updatedSettings,
          row_id: institution.id,
        });
      });

      flash('success', 'Successfully updated the course request message.');
      res.redirect(req.originalUrl);
    } else {
      throw new HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
