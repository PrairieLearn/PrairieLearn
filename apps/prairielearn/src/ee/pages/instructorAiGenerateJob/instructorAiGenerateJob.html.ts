import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Job } from '../../../lib/db-types.js';

export function InstructorAiGenerateJob({
  resLocals,
  job,
}: {
  resLocals: Record<string, any>;
  job: Job;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../../../pages/partials/navbar'); %>", {
          navPage: 'course_admin',
          navSubPage: 'questions',
          ...resLocals,
        })}
        <main id="content" class="container-fluid">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">Generation Job Results</div>
            <div class="card-body">
              <h2 class="card-title">Prompt</h2>
              <div>
                <pre class="bg-dark text-white rounded p-3">${job.data['prompt']}</pre>
              </div>

              <h2 class="card-title">Generated HTML</h2>
              <div>
                <pre class="bg-dark text-white rounded p-3">${job.data['html']}</pre>
              </div>
              <h2 class="card-title">Generated Python</h2>
              <div>
                <pre class="bg-dark text-white rounded p-3">${job.data['python']}</pre>
              </div>
              <h2 class="card-title">Full LLM Generation</h2>
              <div>
                <pre class="bg-dark text-white rounded p-3">${job.data['generation']}</pre>
              </div>
              <h2 class="card-title">Context Documents</h2>
              <div>
                <pre class="bg-dark text-white rounded p-3">${job.data['context']}</pre>
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
