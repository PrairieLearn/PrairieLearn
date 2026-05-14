import { Router } from 'express';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.js';
import { features } from '../../lib/features/index.js';
import { isEnterprise } from '../../lib/license.js';
import {
  DraftFinalizationEditorJobError,
  DraftFinalizationInputError,
  finalizeDraftQuestion,
} from '../../lib/question-drafts.js';
import { HttpRedirect } from '../../lib/redirect.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getSearchParams } from '../../lib/url.js';

const router = Router();

function formatDraftLabel(qid: string | null): string {
  const match = qid?.match(/^__drafts__\/draft_(\d+)$/);
  return match ? `Draft #${match[1]}` : 'Draft question';
}

router.get(
  '/',
  typedAsyncHandler<'instructor-question'>(async (req, res) => {
    const question = res.locals.question;

    if (!question.draft) {
      res.redirect(`${res.locals.urlPrefix}/question/${question.id}/preview`);
      return;
    }

    if (
      isEnterprise() &&
      (await features.enabledFromLocals('ai-question-generation', res.locals))
    ) {
      const search = getSearchParams(req).toString();
      res.redirect(
        `${res.locals.urlPrefix}/ai_generate_editor/${question.id}/editor${search ? `?${search}` : ''}`,
      );
      return;
    }

    const editQuestionHtmlUrl = `${res.locals.urlPrefix}/question/${question.id}/file_edit/questions/${question.qid}/question.html`;

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: formatDraftLabel(question.qid),
        navContext: {
          type: 'instructor',
          page: 'course_admin',
          subPage: 'questions',
        },
        content: html`
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">${formatDraftLabel(question.qid)}</div>
            <div class="card-body">
              <p class="text-muted">
                Edit the draft files until the question is ready, then choose its final title and
                QID.
              </p>
              <div class="d-flex flex-wrap gap-2 mb-4">
                <a class="btn btn-primary" href="${editQuestionHtmlUrl}">Edit question.html</a>
                <a
                  class="btn btn-outline-secondary"
                  href="${res.locals.urlPrefix}/question/${question.id}/preview"
                  >Preview draft</a
                >
              </div>
              <form method="POST" autocomplete="off" class="border rounded p-3">
                <h2 class="h5">Finalize question</h2>
                <div class="mb-3">
                  <label class="form-label" for="question-title">Title</label>
                  <input class="form-control" id="question-title" name="title" required />
                </div>
                <div class="mb-3">
                  <label class="form-label" for="question-qid">QID</label>
                  <input class="form-control" id="question-qid" name="qid" required />
                  <div class="form-text">
                    The final QID must be unique and cannot be in the draft namespace.
                  </div>
                </div>
                <input type="hidden" name="__csrf_token" value="${res.locals.__csrf_token}" />
                <button class="btn btn-success" type="submit">Finalize question</button>
              </form>
            </div>
          </div>
        `,
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'instructor-question'>(async (req, res) => {
    const question = res.locals.question;

    if (!question.draft) {
      res.redirect(`${res.locals.urlPrefix}/question/${question.id}/preview`);
      return;
    }

    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be course editor)');
    }

    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const qid = typeof req.body.qid === 'string' ? req.body.qid.trim() : '';

    try {
      await finalizeDraftQuestion({
        course: res.locals.course,
        question,
        user: res.locals.user,
        authnUser: res.locals.authn_user,
        hasCoursePermissionEdit: res.locals.authz_data.has_course_permission_edit,
        qid,
        title,
      });
    } catch (err) {
      if (err instanceof DraftFinalizationInputError) {
        throw new error.HttpStatusError(400, err.message);
      }
      if (err instanceof DraftFinalizationEditorJobError) {
        throw new HttpRedirect(`${res.locals.urlPrefix}/edit_error/${err.jobSequenceId}`);
      }
      throw err;
    }

    flash('success', `Your question is ready for use as ${qid}.`);
    res.redirect(`${res.locals.urlPrefix}/question/${question.id}/preview`);
  }),
);

export default router;
