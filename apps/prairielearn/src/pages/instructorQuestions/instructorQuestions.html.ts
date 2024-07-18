import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { HeadContents } from '../../components/HeadContents.html.js';
import { QuestionsTable, QuestionsTableHead } from '../../components/QuestionsTable.html.js';
import { type CourseInstance } from '../../lib/db-types.js';
import { QuestionsPageDataAnsified } from '../../models/questions.js';

export const QuestionsPage = ({
  questions,
  course_instances,
  showAddQuestionButton,
  showAiGenerateQuestionButton,
  resLocals,
}: {
  questions: QuestionsPageDataAnsified[];
  course_instances: CourseInstance[];
  showAddQuestionButton: boolean;
  showAiGenerateQuestionButton: boolean;
  resLocals;
}) => {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })} ${QuestionsTableHead()}
      </head>

      <body>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", resLocals)}
        <main id="content" class="container-fluid">
          ${renderEjs(
            import.meta.url,
            " <%- include('../partials/courseSyncErrorsAndWarnings'); %>",
            resLocals,
          )}
          ${QuestionsTable({
            questions,
            course_instances,
            showAddQuestionButton,
            showAiGenerateQuestionButton,
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
