import { html } from '@prairielearn/html';

import { HeadContents } from '../components/HeadContents.html.js';
import { Navbar } from '../components/Navbar.html.js';

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
        <h1>Access Denied</h1>
        <p>This assessment is not available to you right now.</p>
        <p><a href="/pl/course_instance/${courseInstance}/assessments">Go back to Assessments</a></p>
      </body>
    </html>
  `.toString();
}
