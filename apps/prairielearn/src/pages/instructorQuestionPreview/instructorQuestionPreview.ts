import assert from 'node:assert';
import * as url from 'node:url';
import * as path from 'path';

import { Router } from 'express';
import fs from 'fs-extra';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { markdownToHtml } from '@prairielearn/markdown';
import { run } from '@prairielearn/run';
import { IdSchema } from '@prairielearn/zod';

import { getRuntimeDirectoryForCourse } from '../../lib/chunks.js';
import { getQuestionCopyTargets } from '../../lib/copy-content.js';
import { features } from '../../lib/features/index.js';
import { reportIssueFromForm } from '../../lib/issues.js';
import { getAndRenderVariant, renderPanelsForSubmission } from '../../lib/question-render.js';
import { processSubmission } from '../../lib/question-submission.js';
import { getQuestionCourse } from '../../lib/question-variant.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getSearchParams } from '../../lib/url.js';
import { logPageView } from '../../middlewares/logPageView.js';
import { selectAndAuthzVariant } from '../../models/variant.js';

import { InstructorQuestionPreview } from './instructorQuestionPreview.html.js';

const router = Router();

router.post(
  '/',
  typedAsyncHandler<'instructor-question'>(async (req, res) => {
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
  '/',
  typedAsyncHandler<'instructor-question'>(async (req, res) => {
    const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);
    const manualGradingPreviewEnabled = req.query.manual_grading_preview === 'true';
    const aiGradingPreviewEnabled = aiGradingEnabled && req.query.ai_grading_preview === 'true';

    // The `questionRenderContext` flag will be respected by the rendering process.
    if (aiGradingPreviewEnabled) {
      res.locals.questionRenderContext = 'ai_grading';
    } else if (manualGradingPreviewEnabled) {
      res.locals.questionRenderContext = 'manual_grading';
    }

    const variant_seed = req.query.variant_seed ? z.string().parse(req.query.variant_seed) : null;
    const variant_id = req.query.variant_id ? IdSchema.parse(req.query.variant_id) : null;
    // req.query.variant_id might be undefined, which will generate a new variant
    await getAndRenderVariant(variant_id, variant_seed, res.locals);
    await logPageView('instructorQuestionPreview', req, res);
    const questionCopyTargets = await getQuestionCopyTargets({
      course: res.locals.course,
      is_administrator: res.locals.is_administrator,
      user: res.locals.user,
      authn_user: res.locals.authn_user,
      question: res.locals.question,
    });
    const searchParams = getSearchParams(req);

    // Construct a URL to preview the question as it would appear in the manual
    // grading interface. We need to include the `variant_id` in the URL so that
    // we show the current variant and not a new one.
    const manualGradingPreviewSearchParams = new URLSearchParams(searchParams);
    manualGradingPreviewSearchParams.set('variant_id', res.locals.variant.id.toString());
    manualGradingPreviewSearchParams.set('manual_grading_preview', 'true');
    manualGradingPreviewSearchParams.delete('variant_seed');
    manualGradingPreviewSearchParams.delete('ai_grading_preview');
    const manualGradingPreviewUrl = url.format({
      pathname: `${res.locals.urlPrefix}/question/${res.locals.question.id}/preview`,
      search: manualGradingPreviewSearchParams.toString(),
    });

    // As above, the AI grading preview needs to include the `variant_id`.
    const aiGradingPreviewSearchParams = new URLSearchParams(searchParams);
    aiGradingPreviewSearchParams.set('variant_id', res.locals.variant.id.toString());
    aiGradingPreviewSearchParams.set('ai_grading_preview', 'true');
    aiGradingPreviewSearchParams.delete('variant_seed');
    aiGradingPreviewSearchParams.delete('manual_grading_preview');
    const aiGradingPreviewUrl = aiGradingEnabled
      ? url.format({
          pathname: `${res.locals.urlPrefix}/question/${res.locals.question.id}/preview`,
          search: aiGradingPreviewSearchParams.toString(),
        })
      : undefined;

    // Construct a URL for the normal preview. This will be used to exit the manual grading preview.
    const normalPreviewSearchParams = new URLSearchParams(searchParams);
    normalPreviewSearchParams.set('variant_id', res.locals.variant.id.toString());
    normalPreviewSearchParams.delete('manual_grading_preview');
    normalPreviewSearchParams.delete('ai_grading_preview');
    normalPreviewSearchParams.delete('variant_seed');
    const normalPreviewUrl = url.format({
      pathname: `${res.locals.urlPrefix}/question/${res.locals.question.id}/preview`,
      search: normalPreviewSearchParams.toString(),
    });

    // These will be passed back when submissions are rendered asynchronously.
    // We treat these as mutually exclusive.
    const renderSubmissionSearchParams = new URLSearchParams();
    if (manualGradingPreviewEnabled) {
      renderSubmissionSearchParams.set('manual_grading_preview', 'true');
    } else if (aiGradingPreviewEnabled) {
      renderSubmissionSearchParams.set('ai_grading_preview', 'true');
    }

    // We must use the question's course, which is not necessarily the same as
    // the current course in the case of shared questions.
    const question_course = await getQuestionCourse(res.locals.question, res.locals.course);

    // We must read the README from the course's runtime directory to handle
    // the case where this process is a chunk consumer.
    const coursePath = getRuntimeDirectoryForCourse(question_course);
    assert(res.locals.question.qid !== null, 'question.qid is null');
    const questionReadmePath = path.join(
      path.join(coursePath, 'questions', res.locals.question.qid, 'README.md'),
    );

    // We do not need an explicit `ensureChunks()` call here as the `getAndRenderVariant()` call
    // above will have already done that.
    const questionReadmeExists = await fs.pathExists(questionReadmePath);
    let readmeHtml = '';
    if (questionReadmeExists) {
      const readme = await fs.readFile(questionReadmePath, 'utf8');
      readmeHtml = markdownToHtml(readme, { allowHtml: false });
    }

    res.send(
      InstructorQuestionPreview({
        normalPreviewUrl,
        manualGradingPreviewEnabled,
        manualGradingPreviewUrl,
        aiGradingPreviewEnabled,
        aiGradingPreviewUrl,
        renderSubmissionSearchParams,
        readmeHtml,
        resLocals: res.locals,
        questionCopyTargets,
      }),
    );
  }),
);

router.get(
  '/variant/:unsafe_variant_id(\\d+)/submission/:unsafe_submission_id(\\d+)',
  typedAsyncHandler<'instructor-question'>(async (req, res) => {
    const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);

    // As with the normal route, we need to respect the `manual_grading_preview`
    // and the `ai_grading_preview` flags.
    const manualGradingPreviewEnabled = req.query.manual_grading_preview === 'true';
    const aiGradingPreviewEnabled = aiGradingEnabled && req.query.ai_grading_preview === 'true';

    const variant = await selectAndAuthzVariant({
      unsafe_variant_id: req.params.unsafe_variant_id,
      variant_course: res.locals.course,
      question_id: res.locals.question.id,
      course_instance_id: res.locals.course_instance?.id,
      authz_data: res.locals.authz_data,
      authn_user: res.locals.authn_user,
      user: res.locals.user,
      is_administrator: res.locals.is_administrator,
    });

    const panels = await renderPanelsForSubmission({
      unsafe_submission_id: req.params.unsafe_submission_id,
      question: res.locals.question,
      instance_question: null,
      variant,
      user: res.locals.user,
      urlPrefix: res.locals.urlPrefix,
      questionContext: 'instructor',
      questionRenderContext: run(() => {
        if (manualGradingPreviewEnabled) return 'manual_grading';
        if (aiGradingPreviewEnabled) return 'ai_grading';
        return undefined;
      }),
      // This is only used by score panels, which are not rendered in this context.
      authorizedEdit: false,
      // Score panels are never rendered on the instructor question preview page.
      renderScorePanels: false,
      // Group role permissions are not used in this context.
      groupRolePermissions: null,
    });

    res.json(panels);
  }),
);

export default router;
