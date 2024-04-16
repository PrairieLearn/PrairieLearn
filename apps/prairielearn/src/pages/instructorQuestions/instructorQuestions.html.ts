import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { type CourseInstance } from '../../lib/db-types';
import { QuestionsTable, QuestionsTableHead } from '../../components/QuestionsTable.html';
import { QuestionsPageDataAnsified } from '../../models/questions';

export const QuestionsPage = ({
  questions,
  course_instances,
  showAddQuestionButton,
  resLocals,
}: {
  questions: QuestionsPageDataAnsified[];
  course_instances: CourseInstance[];
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
          ${renderEjs(
            __filename,
            " <%- include('../partials/courseSyncErrorsAndWarnings'); %>",
            resLocals,
          )}
          ${QuestionsTable({
            questions,
            course_instances,
            showAddQuestionButton,
            showSharingSets: resLocals.question_sharing_enabled,
            current_course_instance: resLocals.course_instance,
            urlPrefix: resLocals.urlPrefix,
            plainUrlPrefix: resLocals.plainUrlPrefix,
            __csrf_token: resLocals.__csrf_token,
          })}
        </main>
      </body>
    </html>
  `.toString();
};
