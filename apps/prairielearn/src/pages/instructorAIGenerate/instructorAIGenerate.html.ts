import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
export const AIGeneratePage = ({ resLocals }: { resLocals }) => {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../../pages/partials/head') %>", resLocals)}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", {
          navPage: 'course_admin',
          ...resLocals,
        })}
        <main id="content" class="container-fluid">
          <div class="card  mb-4">
            <div class="card-header bg-primary text-white d-flex">Generate Question using AI</div>
            <div class="card-body">
              <p>Please describe your question in as much detail as possible in the box below.</p>
              <form name="add-question-form" method="POST">
                <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                <input type="hidden" name="__action" value="ai_generate" />
                <div class="form-group">
                  <label for="user-prompt-llm">Prompt:</label>
                  <textarea name="prompt" id="user-prompt-llm" class="form-control"></textarea>
                </div>
                <button class="btn btn-primary">Create question</button>
              </form>
              <hr />
              <p>
                On intitial setup, and when the example course or PrairieLearn docs change, click
                the button below:
              </p>
              <form class="" name="resync-context-form" method="POST">
                <input type="hidden" name="__action" value="resync" />
                <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                <button class="btn btn-primary">Resync Documents</button>
              </form>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
};
