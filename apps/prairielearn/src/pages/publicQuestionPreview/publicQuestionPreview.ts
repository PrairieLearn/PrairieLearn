import { Router } from 'express';
import * as error from '@prairielearn/error';
import { z } from 'zod';
import asyncHandler from 'express-async-handler';

import { selectQuestionById } from '../../models/question.js';
import { selectCourseById } from '../../models/course.js';
import { processSubmission } from '../../lib/question-submission.js';
import { IdSchema, UserSchema } from '../../lib/db-types.js';
import { logPageView } from '../../middlewares/logPageView.js';
import {
  getAndRenderVariant,
  renderPanelsForSubmission,
  setRendererHeader,
} from '../../lib/question-render.js';
import { PublicQuestionPreview } from './publicQuestionPreview.html.js';
import { setQuestionCopyTargets } from '../../lib/copy-question.js';

const router = Router({ mergeParams: true });

async function setLocals(req, res) {
  res.locals.user = UserSchema.parse(res.locals.authn_user);
  res.locals.authz_data = { user: res.locals.user };
  res.locals.course = await selectCourseById(req.params.course_id);
  res.locals.question = await selectQuestionById(req.params.question_id);
  if (
    !res.locals.question.shared_publicly ||
    res.locals.course.id !== res.locals.question.course_id
  ) {
    throw new error.HttpStatusError(404, 'Not Found');
  }
  return;
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    await setLocals(req, res);
    if (req.body.__action === 'grade' || req.body.__action === 'save') {
      const variant_id = await processSubmission(req, res);
      res.redirect(
        `${res.locals.urlPrefix}/question/${res.locals.question.id}/preview/?variant_id=${variant_id}`,
      );
    } else if (req.body.__action === 'report_issue') {
      // we currently don't report issues for public facing previews
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

router.get(
  '/variant/:variant_id(\\d+)/submission/:submission_id(\\d+)',
  asyncHandler(async (req, res) => {
    await setLocals(req, res);
    const { submissionPanel, extraHeadersHtml } = await renderPanelsForSubmission({
      submission_id: req.params.submission_id,
      question_id: res.locals.question.id,
      instance_question_id: null,
      variant_id: req.params.variant_id,
      urlPrefix: res.locals.urlPrefix,
      questionContext: null,
      csrfToken: null,
      authorizedEdit: null,
      renderScorePanels: false,
    });
    res.send({ submissionPanel, extraHeadersHtml });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await setLocals(req, res);
    const variant_seed = req.query.variant_seed ? z.string().parse(req.query.variant_seed) : null;
    const variant_id = req.query.variant_id ? IdSchema.parse(req.query.variant_id) : null;
    await getAndRenderVariant(variant_id, variant_seed, res.locals);
    await logPageView('publicQuestionPreview', req, res);
    await setQuestionCopyTargets(res);
    setRendererHeader(res);
    res.send(PublicQuestionPreview({ resLocals: res.locals }));
  }),
);

export default router;
