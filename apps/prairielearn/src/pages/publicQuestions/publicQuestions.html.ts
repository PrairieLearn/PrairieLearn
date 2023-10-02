import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { QuestionsTable } from '../../components/QuestionsTable.html';
import { compiledScriptTag } from '../../lib/assets';
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
        ${compiledScriptTag('instructorQuestionsClient.ts')}
      </head>

      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", resLocals)}
        <main id="content" class="container-fluid">
          ${QuestionsTable({
            questions,
            showAddQuestionButton,
            urlPrefix: resLocals.urlPrefix,
            plainUrlPrefix: resLocals.plainUrlPrefix,
          })}
        </main>
      </body>
    </html>
  `.toString();
};
