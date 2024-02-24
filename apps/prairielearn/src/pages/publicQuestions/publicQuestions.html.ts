import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { QuestionsTable, QuestionsTableHead } from '../../components/QuestionsTable.html';
import { QuestionsPageData } from '../../models/questions';

export const QuestionsPage = ({
  questions,
  showAddQuestionButton,
  resLocals,
}: {
  questions: QuestionsPageData[];
  showAddQuestionButton: boolean;
  resLocals;
}) => {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../pages/partials/head') %>", resLocals)}
        ${QuestionsTableHead()}
      </head>

      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", resLocals)}
        <main id="content" class="container-fluid">
          ${resLocals.course.sharing_name
            ? QuestionsTable({
                questions,
                showAddQuestionButton,
                qidPrefix: `@${resLocals.course.sharing_name}/`,
                urlPrefix: resLocals.urlPrefix,
                plainUrlPrefix: resLocals.plainUrlPrefix,
                __csrf_token: resLocals.__csrf_token,
              })
            : html`<p>
                This course doesn't have a sharing name. If you are an Owner of this course, please
                choose a sharing name on the
                <a
                  href="${resLocals.plainUrlPrefix}/course/${resLocals.course
                    .id}/course_admin/sharing"
                  >course sharing settings page</a
                >.
              </p>`}
        </main>
      </body>
    </html>
  `.toString();
};
