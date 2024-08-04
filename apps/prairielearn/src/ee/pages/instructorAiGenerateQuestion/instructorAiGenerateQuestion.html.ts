import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { HeadContents } from '../../../components/HeadContents.html.js';

export function AiGeneratePage({ resLocals }: { resLocals: Record<string, any> }) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
      </head>
      <body hx-ext="loading-states">
        ${renderEjs(import.meta.url, "<%- include('../../../pages/partials/navbar'); %>", {
          navPage: 'course_admin',
          ...resLocals,
        })}
        <main id="content" class="container-fluid">
          <div class="card  mb-4">
            <div class="card-header bg-primary text-white d-flex">Generate Question using AI</div>
            <div class="card-body">
              <p>Please describe your question in as much detail as possible in the box below.</p>
              <form
                name="add-question-form"
                hx-post="${resLocals.urlPrefix}/ai_generate_question"
                hx-target="#generation-results"
                hx-swap="outerHTML"
                hx-disabled-elt="button"
              >
                <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                <input type="hidden" name="__action" value="generate_question" />
                <div class="form-group">
                  <label for="user-prompt-llm">Prompt:</label>
                  <textarea name="prompt" id="user-prompt-llm" class="form-control"></textarea>
                </div>
                <button class="btn btn-primary">
                  <span
                    class="spinner-grow spinner-grow-sm d-none"
                    role="status"
                    aria-hidden="true"
                    data-loading-class-remove="d-none"
                  ></span>
                  Create question
                </button>
              </form>
              <div id="generation-results"></div>
              <br />
              <div>
                <a href="${resLocals.urlPrefix}/ai_generate_question_jobs">
                  <button class="btn btn-primary">Previous Generation Jobs</button>
                </a>
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

export const GenerationResults = (
  generatedHTML: string | undefined,
  generatedPython: string | undefined,
  seqId: string,
  resLocals,
): string => {
  if (generatedHTML === undefined) {
    return html`
      <div id="generation-results">
        <hr />
        <h1>Generation Failed</h1>
        <p>The generated code did not include a question.html file.</p>
        <a href="${resLocals.urlPrefix + '/jobSequence/' + seqId}" target="_blank">
          See Job Logs
        </a>
      </div>
    `.toString();
  }
  return html`
    <div id="generation-results">
      <hr />
      <p>Generation Results:</p>
      <a href="${resLocals.urlPrefix + '/jobSequence/' + seqId}" target="_blank">
        [DEBUG] See Job Logs
      </a>
      <div class="mr-auto">
        <span class="card-title"> Generated HTML </span>
      </div>
      <div id="card-html">
        <pre id="output-html" class="bg-dark text-white rounded p-3">
${generatedHTML} 
          </pre
        >
      </div>
      ${generatedPython === undefined
        ? ''
        : html`
            <div class="mr-auto">
              <span class="card-title"> Generated Python </span>
            </div>
            <div id="card-python">
              <pre id="output-python" class="bg-dark text-white rounded p-3">
${generatedPython} 
          </pre
              >
            </div>
          `}
      <form
        name="regen-question-form"
        hx-post="${resLocals.urlPrefix}/ai_generate_question"
        hx-target="#generation-results"
        hx-swap="outerHTML"
        hx-disabled-elt="button"
      >
        <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
        <input type="hidden" name="__action" value="regenerate_question" />
        <input type="hidden" name="unsafe_sequence_job_id" value="${seqId}" />
        <div class="form-group">
          <label for="user-prompt-llm">What needs to be changed?</label>
          <textarea name="prompt" id="user-prompt-llm" class="form-control"></textarea>
        </div>
        <button class="btn btn-primary">
          <span
            class="spinner-grow spinner-grow-sm d-none"
            role="status"
            aria-hidden="true"
            data-loading-class-remove="d-none"
          ></span>
          Adjust question
        </button>
      </form>
      <br />
      <div>
        <form class="" name="resync-context-form" method="POST">
          <input type="hidden" name="__action" value="save_question" />
          <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
          <input type="hidden" name="unsafe_sequence_job_id" value="${seqId}" />
          <button class="btn btn-primary">Save Question</button>
        </form>
      </div>
    </div>
  `.toString();
};
