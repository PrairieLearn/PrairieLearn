import { html } from '@prairielearn/html';
import { hydrateHtml } from '@prairielearn/react/server';

import { CreateQuestionFormContents } from '../../components/CreateQuestionFormContents.js';
import { PageLayout } from '../../components/PageLayout.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

export function InstructorQuestionNewPage({
  templateQuestions,
  resLocals,
}: {
  templateQuestions: { example_course: boolean; qid: string; title: string }[];
  resLocals: ResLocalsForPage<'course' | 'course-instance'>;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Create question',
    navContext: {
      type: 'instructor',
      page: 'course_admin',
      subPage: 'questions',
    },
    content: html`
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>Create question</h1>
        </div>
        <form method="POST" autocomplete="off">
          <div class="card-body">
            ${hydrateHtml(<CreateQuestionFormContents templateQuestions={templateQuestions} />)}
          </div>
          <div class="card-footer d-flex justify-content-end gap-2">
            <a href="${resLocals.urlPrefix}/course_admin/questions" class="btn btn-secondary">
              Cancel
            </a>
            <input type="hidden" name="__action" value="add_question" />
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <button type="submit" class="btn btn-primary">Create</button>
          </div>
        </form>
      </div>
    `,
  });
}
