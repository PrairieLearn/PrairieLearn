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
  // Example course questions can be publicly shared, but we don't allow them to
  // be imported into courses, so we won't show the sharing name in the QID.
  const qidPrefix = resLocals.course.example_course ? '' : `@${resLocals.course.sharing_name}/`;

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
                qidPrefix,
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
