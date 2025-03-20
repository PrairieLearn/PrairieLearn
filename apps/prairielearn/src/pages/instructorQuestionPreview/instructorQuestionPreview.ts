import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';

import { setQuestionCopyTargets } from '../../lib/copy-question.js';
import { IdSchema } from '../../lib/db-types.js';
import { reportIssueFromForm } from '../../lib/issues.js';
import {
  getAndRenderVariant,
  renderPanelsForSubmission,
  setRendererHeader,
} from '../../lib/question-render.js';
import { processSubmission } from '../../lib/question-submission.js';
import { logPageView } from '../../middlewares/logPageView.js';

import { InstructorQuestionPreview } from './instructorQuestionPreview.html.js';

const router = Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'grade' || req.body.__action === 'save') {
      const variant_id = await processSubmission(req, res);
      res.redirect(
        `${res.locals.urlPrefix}/question/${res.locals.question.id}/preview/?variant_id=${variant_id}`,
      );
    } else if (req.body.__action === 'report_issue') {
      const variant_id = await reportIssueFromForm(req, res);
      res.redirect(
        `${res.locals.urlPrefix}/question/${res.locals.question.id}/preview/?variant_id=${variant_id}`,
      );
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

router.get(
  '/variant/:variant_id(\\d+)/submission/:submission_id(\\d+)',
  asyncHandler(async (req, res) => {
    const panels = await renderPanelsForSubmission({
      submission_id: req.params.submission_id,
      question: res.locals.question,
      instance_question: null,
      variant_id: req.params.variant_id,
      user: res.locals.user,
      urlPrefix: res.locals.urlPrefix,
      questionContext: 'instructor',
      // This is only used by score panels, which are not rendered in this context.
      authorizedEdit: false,
      // score panels are never rendered on the instructor question preview page.
      renderScorePanels: false,
      // Group role permissions are not used in this context.
      groupRolePermissions: null,
    });
    res.json(panels);
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const variant_seed = req.query.variant_seed ? z.string().parse(req.query.variant_seed) : null;
    const variant_id = req.query.variant_id ? IdSchema.parse(req.query.variant_id) : null;

    // req.query.variant_id might be undefined, which will generate a new variant
    console.log("HERE! IN INStRUCTOR")
    console.log('Assessment Details:');
    console.log(res.locals);
    // console.log(req);
    
    await getAndRenderVariant(variant_id, variant_seed, res.locals as any);
    await logPageView('instructorQuestionPreview', req, res);
    await setQuestionCopyTargets(res);

    setRendererHeader(res);
    res.send(InstructorQuestionPreview({ resLocals: res.locals }));
  }),
);

export default router;
