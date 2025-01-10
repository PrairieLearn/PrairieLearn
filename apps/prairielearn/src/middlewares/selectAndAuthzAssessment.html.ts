import { html } from '@prairielearn/html';

import { HeadContents } from '../components/HeadContents.html.js';
import { Navbar } from '../components/Navbar.html.js';
import { config } from '../lib/config.js';

export function AccessDenied({ resLocals }: { resLocals: Record<string, any> }) {
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
            <div class="card-header bg-primary text-white">Assessment unavailable</div>
            <div class="card-body">
              <p>This assessment's configuration does not allow you to access it right now.</p>
              <p>This is the intended behavior based on the current time or other factors.</p>
              <div>
                <a
                  href="/pl/course_instance/${resLocals.course_instance.id}/assessments"
                  class="btn btn-primary"
                >
                  Go to assessments
                </a>
                <a href="${config.urlPrefix}" class="btn btn-primary">
                  <i class="fa fa-home" aria-hidden="true"></i>
                  PrairieLearn home
                </a>
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
