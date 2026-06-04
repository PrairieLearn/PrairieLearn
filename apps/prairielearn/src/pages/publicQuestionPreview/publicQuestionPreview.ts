import { type Request, type Response, Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { IdSchema } from '@prairielearn/zod';

import { getQuestionCopyTargets } from '../../lib/copy-content.js';
import { UserSchema } from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { getAndRenderVariant, renderPanelsForSubmission } from '../../lib/question-render.js';
import { processSubmission } from '../../lib/question-submission.js';
import { logPageView } from '../../middlewares/logPageView.js';
import { selectQuestionById } from '../../models/question.js';
import { selectAndAuthzVariant } from '../../models/variant.js';

import { PublicQuestionPreview } from './publicQuestionPreview.html.js';

const router = Router({ mergeParams: true });

async function setLocals(req: Request, res: Response) {
  res.locals.user = UserSchema.parse(res.locals.authn_user);
  res.locals.authz_data = { user: res.locals.user };
  res.locals.question = await selectQuestionById(req.params.question_id);

  if (
    res.locals.question.deleted_at != null ||
    !(res.locals.question.share_publicly || res.locals.question.share_source_publicly) ||
    res.locals.course.id !== res.locals.question.course_id
  ) {
    throw new error.HttpStatusError(404, 'Not Found');
  }

  const disablePublicWorkspaces = await features.enabled('disable-public-workspaces', {
    institution_id: res.locals.course.institution_id,
    course_id: res.locals.course.id,
  });

  if (res.locals.question.workspace_image && disablePublicWorkspaces) {
    throw new error.HttpStatusError(403, 'Access denied');
  }
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    await setLocals(req, res);
    if (req.body.__action === 'grade' || req.body.__action === 'save') {
      const variant_id = await processSubmission(req, res, { publicQuestionPreview: true });
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
  '/variant/:unsafe_variant_id(\\d+)/submission/:unsafe_submission_id(\\d+)',
  asyncHandler(async (req, res) => {
    await setLocals(req, res);

    const variant = await selectAndAuthzVariant({
      unsafe_variant_id: req.params.unsafe_variant_id,
      variant_course: res.locals.course,
      question_id: res.locals.question.id,
      authz_data: res.locals.authz_data,
      authn_user: res.locals.authn_user,
      user: res.locals.user,
      is_administrator: res.locals.is_administrator,
      publicQuestionPreview: true,
    });

    const panels = await renderPanelsForSubmission({
      unsafe_submission_id: req.params.unsafe_submission_id,
      question: res.locals.question,
      instance_question: null,
      variant,
      user: res.locals.user,
      urlPrefix: res.locals.urlPrefix,
      questionContext: 'public',
      // This is only used by score panels, which are not rendered in this context.
      authorizedEdit: false,
      // Score panels are never rendered on the public question preview page.
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
    await setLocals(req, res);
    const variant_seed = req.query.variant_seed ? z.string().parse(req.query.variant_seed) : null;
    const variant_id = req.query.variant_id ? IdSchema.parse(req.query.variant_id) : null;
    await getAndRenderVariant(variant_id, variant_seed, res.locals as any, {
      publicQuestionPreview: true,
    });
    await logPageView('publicQuestionPreview', req, res);
    const questionCopyTargets = await getQuestionCopyTargets({
      course: res.locals.course,
      is_administrator: res.locals.is_administrator,
      user: res.locals.user,
      authn_user: res.locals.authn_user,
      question: res.locals.question,
    });
    res.send(PublicQuestionPreview({ resLocals: res.locals, questionCopyTargets }));
  }),
);

export default router;
