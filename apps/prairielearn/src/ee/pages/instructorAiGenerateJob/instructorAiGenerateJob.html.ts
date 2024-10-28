import { html } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Navbar } from '../../../components/Navbar.html.js';
import { type Job } from '../../../lib/db-types.js';

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
        ${Navbar({ navPage: 'course_admin', navSubPage: 'questions', resLocals })}
        <main id="content" class="container-fluid">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">Generation Job Results</div>
            <div class="card-body">
              <h2 class="card-title">Prompt</h2>
              <pre class="bg-dark text-white rounded p-3">${job.data['prompt']}</pre>
              <h2 class="card-title">Generated HTML</h2>
              <pre class="bg-dark text-white rounded p-3">${job.data['html']}</pre>
              <h2 class="card-title">Generated Python</h2>
              <pre class="bg-dark text-white rounded p-3">${job.data['python']}</pre>
              <h2 class="card-title">Full LLM Generation</h2>
              <pre class="bg-dark text-white rounded p-3">${job.data['generation']}</pre>
              <h2 class="card-title">Context Documents</h2>
              <pre class="bg-dark text-white rounded p-3">${job.data['context']}</pre>
              ${job.data?.initialGenerationErrors
                ? html`<h2 class="card-title">Initial Generation Errors</h2>
                    <pre class="bg-dark text-white rounded p-3">
${job.data['initialGenerationErrors'].join('\n')}</pre
                    >`
                : ''}
              ${job.data?.finalGenerationErrors
                ? html`<h2 class="card-title">Final Generation Errors</h2>
                    <pre class="bg-dark text-white rounded p-3">
${job.data['finalGenerationErrors'].join('\n')}</pre
                    >`
                : ''}
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
