import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { QuestionsTable } from '../../components/QuestionsTable.html';

export const QuestionsPage = ({ questions, resLocals }) => {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../pages/partials/head') %>", resLocals)}
        <script>
          window.showAddQuestionButton = ${resLocals.authz_data.has_course_permission_edit &&
          !resLocals.course.example_course &&
          !resLocals.needToSync};

          window.courseInstanceIds = ${JSON.stringify(
            (resLocals.authz_data.course_instances || []).map(
              (course_instance) => course_instance.id,
            ),
          )};

          window.urlPrefix = '${resLocals.urlPrefix}';
          window.plainUrlPrefix = '${resLocals.plainUrlPrefix}';
        </script>
      </head>

      <body>
        <form class="ml-1 btn-group" name="add-question-form" method="POST">
          <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
          <input type="hidden" name="__action" value="add_question" />
        </form>

        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", resLocals)}
        ${QuestionsTable(
          questions,
          resLocals.course_instance,
          resLocals.authz_data.course_instances,
          resLocals.has_legacy_questions,
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
