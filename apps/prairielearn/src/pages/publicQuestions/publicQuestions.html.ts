import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { QuestionsTable, QuestionsTableHead } from '../../components/QuestionsTable.html';
import { QuestionsPageData } from '../../models/questions';

export const QuestionsPage = ({
  questions,
  showAddQuestionButton,
  qidPrefix,
  resLocals,
}: {
  questions: QuestionsPageData[];
  showAddQuestionButton: boolean;
  qidPrefix?: string;
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
          ${QuestionsTable({
            questions,
            showAddQuestionButton,
            qidPrefix,
            urlPrefix: resLocals.urlPrefix,
            plainUrlPrefix: resLocals.plainUrlPrefix,
          })}
        </main>
      </body>
    </html>
  `.toString();
};
