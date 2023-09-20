import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { QuestionsTable } from '../../components/QuestionsTable.html';

export const QuestionsPage = ({ questions, resLocals }) => {
  const showAddQuestionButton =
    resLocals.authz_data.has_course_permission_edit &&
    !resLocals.course.example_course &&
    !resLocals.needToSync;
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../pages/partials/head') %>", resLocals)}
      </head>

      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", resLocals)}

        <form class="ml-1 btn-group" name="add-question-form" method="POST">
          <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
          <input type="hidden" name="__action" value="add_question" />
        </form>

        ${QuestionsTable(
          questions,
          showAddQuestionButton,
          resLocals.course_instance,
          resLocals.authz_data.course_instances,
          resLocals.urlPrefix,
          resLocals.plainUrlPrefix,
          renderEjs(
            __filename,
            " <%- include('../partials/courseSyncErrorsAndWarnings'); %>",
            resLocals,
          ),
        )}
      </body>
    </html>
  `.toString();
};
