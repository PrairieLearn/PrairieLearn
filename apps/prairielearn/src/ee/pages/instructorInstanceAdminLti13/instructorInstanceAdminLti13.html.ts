import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Lti13CourseInstance, Lti13Instance } from '../../../lib/db-types.js';

interface Lti13FullInstance {
  lti13_course_instance: Lti13CourseInstance;
  lti13_instance: Lti13Instance;
}

export function InstructorInstanceAdminLti13({
  resLocals,
  instance,
  instances,
}: {
  resLocals: Record<string, any>;
  instance: Lti13FullInstance;
  instances: Lti13FullInstance[];
}): string {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
      </head>
      <body>
        <script>
          $(() => {
            $('#selectLti13Instance').on('change', () => {
              let li = $('#selectLti13Instance option:selected');
              window.location.href =
                '/pl/course_instance/${resLocals.course_instance
                  .id}/instructor/instance_admin/lti13_instance/' + li.val();
            });
          });
        </script>
        ${renderEjs(import.meta.url, "<%- include('../../../pages/partials/navbar'); %>", {
          ...resLocals,
          navSubPage: 'lti13',
        })}
        <main class="container-fluid mb-4">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex">LTI 1.3 configuration</div>
            <div class="card-body">
              <div class="row">
                <div class="col-2">
                  <select class="custom-select mb-2" id="selectLti13Instance">
                    ${instances.map((i) => {
                      return html`
                        <option
                          value="${i.lti13_course_instance.id}"
                          ${instance.lti13_course_instance.id === i.lti13_course_instance.id
                            ? 'selected'
                            : ''}
                        >
                          ${i.lti13_instance.name}: ${i.lti13_course_instance.context_label}
                        </option>
                      `;
                    })}
                  </select>
                  Quick links:
                  <ul>
                    <li><a href="#connection">Connection to LMS</a></li>
                  </ul>
                  Created at: ${instance.lti13_course_instance.created_at.toDateString()}
                </div>
                <div class="col-auto">
                  <h3 id="connection">Connection to LMS</h3>
                  <form method="POST">
                    <input type="hidden" name="__action" value="delete_lti13_course_instance" />
                    <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                    <button
                      class="btn btn-danger btn-sm"
                      onclick="return confirm('Are you sure you want to remove this connection?');"
                    >
                      Remove LTI 1.3 connection with ${instance.lti13_instance.name}:
                      ${instance.lti13_course_instance.context_label}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
