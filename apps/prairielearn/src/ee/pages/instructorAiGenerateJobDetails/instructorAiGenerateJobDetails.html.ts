import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Job } from '../../../lib/db-types.js';

export function AiGenerateJobDetailsPage({
  resLocals,
  job,
}: {
  resLocals: Record<string, any>;
  job: Job;
}) {
  return html` <!doctype html>
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
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">Generation Job Results</div>
            <div class="card-body">
              <div class="mr-auto">
                <span class="card-title"> Prompt </span>
              </div>
              <div id="card-prompt">
                <pre id="output-prompt" class="bg-dark text-white rounded p-3">
${job.data['prompt']} 
              </pre
                >
              </div>

              <div class="mr-auto">
                <span class="card-title"> Generated HTML </span>
              </div>
              <div id="card-html">
                <pre id="output-html" class="bg-dark text-white rounded p-3">
${job.data['html']} 
              </pre
                >
              </div>
              <div class="mr-auto">
                <span class="card-title"> Generated Python </span>
              </div>
              <div id="card-py">
                <pre id="output-py" class="bg-dark text-white rounded p-3">
                    ${job.data['python']} 
              </pre
                >
              </div>
              <div class="mr-auto">
                <span class="card-title"> Full LLM Generation </span>
              </div>
              <div id="card-llm">
                <pre id="output-llm" class="bg-dark text-white rounded p-3">
${job.data['generation']} 
              </pre
                >
              </div>
              <div class="mr-auto">
                <span class="card-title"> Context Documents </span>
              </div>
              <div id="card-context">
                <pre id="output-context" class="bg-dark text-white rounded p-3">
${job.data['context']} 
              </pre
                >
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>`.toString();
}
