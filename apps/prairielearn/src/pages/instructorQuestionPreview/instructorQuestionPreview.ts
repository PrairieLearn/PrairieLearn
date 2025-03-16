import * as url from 'node:url';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { html } from '@prairielearn/html';

import { setQuestionCopyTargets } from '../../lib/copy-question.js';
import { IdSchema } from '../../lib/db-types.js';
import { reportIssueFromForm } from '../../lib/issues.js';
import {
  getAndRenderVariant,
  renderPanelsForSubmission,
  setRendererHeader,
} from '../../lib/question-render.js';
import { processSubmission } from '../../lib/question-submission.js';
import { getSearchParams } from '../../lib/url.js';
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
    const manualGradingPreviewEnabled = req.query.manual_grading_preview === 'true';
    const aiGradingPreviewEnabled = req.query.ai_grading_preview === 'true';
    if (manualGradingPreviewEnabled || aiGradingPreviewEnabled) {
      // Setting this flag will set the `manualGrading: true` flag in the data
      // dictionary passed to element render functions. It will also disable
      // editing for all elements by setting `editable: false`.
      res.locals.manualGradingInterface = true;
    }

    const variant_seed = req.query.variant_seed ? z.string().parse(req.query.variant_seed) : null;
    const variant_id = req.query.variant_id ? IdSchema.parse(req.query.variant_id) : null;
    // req.query.variant_id might be undefined, which will generate a new variant
    await getAndRenderVariant(variant_id, variant_seed, res.locals as any);
    await logPageView('instructorQuestionPreview', req, res);
    await setQuestionCopyTargets(res);

    // TODO: need to apply the same transformations as `ai-grading.ts`, specifically
    // the stripping of `<script>` tags.
    //
    // TODO: need to apply the same rendering rules as `ai-grading.ts`, specifically
    // the fact that `manualGradingInterface` is true for the question panel but
    // not for the submission panel.
    //
    // TODO: need to ensure that the answer panel is not shown if it's not provided
    // to the AI grader (I believe it is not).
    //
    // TODO: need to ensure that async-rendered submissions follow the same rendering
    // rules.
    //
    // TODO: need to ensure this respects the `ai-grading` feature flag.
    if (aiGradingPreviewEnabled) {
      res.locals.questionHtml = html`<pre
        class="mb-0"
      ><code>${res.locals.questionHtml.trim()}</code></pre>`;
      res.locals.answerHtml = html`<pre
        class="mb-0"
      ><code>${res.locals.answerHtml.trim()}</code></pre>`;
      res.locals.submissionHtmls = res.locals.submissionHtmls.map(
        (submissionHtml) => html`<pre class="mb-0"><code>${submissionHtml.trim()}</code></pre>`,
      );
      console.log(res.locals.questionHtml.toString());
      console.log(res.locals.answerHtml.toString());
    }

    const searchParams = getSearchParams(req);

    // Construct a URL to preview the question as it would appear in the manual
    // grading interface. We need to include the `variant_id` in the URL so that
    // we show the current variant and not a new one.
    const manualGradingPreviewSearchParams = new URLSearchParams(searchParams);
    manualGradingPreviewSearchParams.set('variant_id', res.locals.variant.id.toString());
    manualGradingPreviewSearchParams.set('manual_grading_preview', 'true');
    manualGradingPreviewSearchParams.delete('variant_seed');
    const manualGradingPreviewUrl = url.format({
      pathname: `${res.locals.urlPrefix}/question/${res.locals.question.id}/preview`,
      search: manualGradingPreviewSearchParams.toString(),
    });

    // As above, the AI grading preview needs to include the `variant_id`.
    const aiGradingPreviewSearchParams = new URLSearchParams(searchParams);
    aiGradingPreviewSearchParams.set('variant_id', res.locals.variant.id.toString());
    aiGradingPreviewSearchParams.set('ai_grading_preview', 'true');
    aiGradingPreviewSearchParams.delete('variant_seed');
    const aiGradingPreviewUrl = url.format({
      pathname: `${res.locals.urlPrefix}/question/${res.locals.question.id}/preview`,
      search: aiGradingPreviewSearchParams.toString(),
    });

    // Construct a URL for the normal preview. This will be used to exit the manual grading preview.
    const normalPreviewSearchParams = new URLSearchParams(searchParams);
    normalPreviewSearchParams.set('variant_id', res.locals.variant.id.toString());
    normalPreviewSearchParams.delete('manual_grading_preview');
    normalPreviewSearchParams.delete('variant_seed');
    const normalPreviewUrl = url.format({
      pathname: `${res.locals.urlPrefix}/question/${res.locals.question.id}/preview`,
      search: normalPreviewSearchParams.toString(),
    });

    setRendererHeader(res);
    res.send(
      InstructorQuestionPreview({
        normalPreviewUrl,
        manualGradingPreviewEnabled,
        manualGradingPreviewUrl,
        aiGradingPreviewEnabled,
        aiGradingPreviewUrl,
        resLocals: res.locals,
      }),
    );
  }),
);

export default router;
