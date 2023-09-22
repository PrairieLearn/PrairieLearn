import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { QuestionsTable } from '../../components/QuestionsTable.html';
import { compiledScriptTag } from '../../lib/assets';

export const QuestionsPage = ({ questions, showAddQuestionButton, resLocals }) => {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../pages/partials/head') %>", resLocals)}
      </head>

      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", resLocals)}
        ${compiledScriptTag('instructorQuestionsClient.ts')}
        <main id="content" class="container-fluid">
          ${QuestionsTable({
            questions,
            showAddQuestionButton,
            current_course_instance: resLocals.course_instance,
            course_instances: resLocals.authz_data.course_instances,
            urlPrefix: resLocals.urlPrefix,
            plainUrlPrefix: resLocals.plainUrlPrefix,
            __csrf_token: resLocals.__csrf_token,
            errorMessage: renderEjs(
              __filename,
              " <%- include('../partials/courseSyncErrorsAndWarnings'); %>",
              resLocals,
            ),
          })}
        </main>
      </body>
    </html>
  `.toString();
};
