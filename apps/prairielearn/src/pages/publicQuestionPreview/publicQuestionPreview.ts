import { Router } from 'express';
import * as path from 'path';
import * as error from '@prairielearn/error';
import { z } from 'zod';
import { promisify } from 'util';
import asyncHandler = require('express-async-handler');

import { selectQuestionById } from '../../models/question';
import { selectCourseById } from '../../models/course';
import { processSubmission } from '../../lib/question-submission';
import { IdSchema, UserSchema } from '../../lib/db-types';
import LogPageView = require('../../middlewares/logPageView');
import {
  getAndRenderVariant,
  renderPanelsForSubmission,
  setRendererHeader,
} from '../../lib/question-render';
import { PublicQuestionPreview } from './publicQuestionPreview.html';
import { setQuestionCopyTargets } from '../../lib/copy-question';

const logPageView = promisify(LogPageView(path.basename(__filename, '.ts')));

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
    throw error.make(404, 'Not Found');
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
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

router.get(
  '/variant/:variant_id/submission/:submission_id',
  asyncHandler(async (req, res) => {
    await setLocals(req, res);
    const { submissionPanel } = await renderPanelsForSubmission({
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
    res.send({ submissionPanel });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await setLocals(req, res);
    const variant_seed = req.query.variant_seed ? z.string().parse(req.query.variant_seed) : null;
    const variant_id = req.query.variant_id ? IdSchema.parse(req.query.variant_id) : null;
    await getAndRenderVariant(variant_id, variant_seed, res.locals);
    await logPageView(req, res);
    await setQuestionCopyTargets(res);
    setRendererHeader(res);
    res.send(PublicQuestionPreview({ resLocals: res.locals }));
  }),
);

export = router;
