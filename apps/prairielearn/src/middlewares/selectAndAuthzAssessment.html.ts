import { html } from '@prairielearn/html';

import { HeadContents } from '../components/HeadContents.html.js';
import { Navbar } from '../components/Navbar.html.js';
import { config } from '../lib/config.js';

export function AccessDenied({ resLocals }: { resLocals: Record<string, any> }) {
  const courseInstance = resLocals.course_instance.id;
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
      </head>
      <body>
        ${Navbar({ resLocals, navPage: 'assessment_instance' })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">Assessment Unavailable</div>
            <div class="card-body">
              <p>This assessment's configuration does not allow you to access it right now.</p>
              <p>
                This is the intended behavior (and not an error) based on your current time,
                location, or other parameters.
              </p>
              <a href="/pl/course_instance/${courseInstance}/assessments" class="btn btn-primary">
                Go to Assessments
              </a>
              <a href="${config.urlPrefix}" class="btn btn-primary">
                <i class="fa fa-home" aria-hidden="true"></i>
                PrairieLearn home
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
