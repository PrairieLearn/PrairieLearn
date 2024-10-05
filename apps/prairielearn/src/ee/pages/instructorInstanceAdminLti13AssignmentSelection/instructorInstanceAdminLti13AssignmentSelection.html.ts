import { z } from 'zod';

import { html } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { NavbarIframe } from '../../../components/Navbar.html.js';
import { AssessmentSchema, AssessmentSetSchema } from '../../../lib/db-types.js';

export const AssessmentRowSchema = AssessmentSchema.merge(
  AssessmentSetSchema.pick({ abbreviation: true, name: true, color: true }),
).extend({
  start_new_assessment_group: z.boolean(),
  assessment_group_heading: AssessmentSetSchema.shape.heading,
  label: z.string(),
});
type AssessmentRow = z.infer<typeof AssessmentRowSchema>;

export function InstructorInstanceAdminLti13AssignmentSelection({
  resLocals,
  deep_link_return_url,
  signed_jwt,
  assessments,
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'LTI 1.3 Assignment Selection' })}
      </head>
      <body>
        ${NavbarIframe({ resLocals })}
        <main id="content">
          <form method="POST" action="${deep_link_return_url}">
            <input type="hidden" name="JWT" value="${signed_jwt}" />
            <input type="submit" value="Save" />
          </form>

          ${assessments.map((a) => {
            return html`${JSON.stringify(a)}`;
          })}
        </main>
      </body>
    </html>
  `.toString();
}
