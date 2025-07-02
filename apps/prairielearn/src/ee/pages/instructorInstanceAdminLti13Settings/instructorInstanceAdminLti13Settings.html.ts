import { html } from '@prairielearn/html';

import { PageLayout } from '../../../components/PageLayout.html.js';
import { Lti13NavTabs } from '../../components/Lti13NavTabs.html.js';
import type { Lti13CombinedInstance } from '../../lib/lti13.js';

export function InstructorInstanceAdminLti13Settings({
  resLocals,
  instance,
  instances,
}: {
  resLocals: Record<string, any>;
  instance: Lti13CombinedInstance;
  instances: Lti13CombinedInstance[];
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Integrations',
    navContext: {
      type: 'instructor',
      page: 'instance_admin',
      subPage: 'integrations',
    },
    options: {
      fullWidth: true,
    },
    preContent: html`
      <div class="bg-light pt-2 px-3">
        ${InstanceDropdown({ resLocals, instance, instances, page: 'settings' })}
      </div>
      ${Lti13NavTabs({
        course_instance: resLocals.course_instance,
        lti13_course_instance: instance.lti13_course_instance,
        page: 'settings',
      })}
    `,
    content: html`
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex">
          <h1>Integration settings</h1>
        </div>
        <div class="card-body">
          <h3 id="connection">Connection to LMS</h3>
          <p>
            Use this to remove the connection if the course will no longer be offered on the LMS.
            This will not delete any data, but will prevent further grade passback.
          </p>
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
    `,
  });
}

export function InstanceDropdown({
  resLocals,
  instance,
  instances,
  page,
}: {
  resLocals: Record<string, any>;
  instance: Lti13CombinedInstance;
  instances: Lti13CombinedInstance[];
  page: 'assessments' | 'settings';
}) {
  return html`
    <div class="dropdown">
      <button
        type="button"
        class="btn dropdown-toggle border border-gray"
        data-bs-toggle="dropdown"
        aria-haspopup="true"
        aria-expanded="false"
        data-bs-boundary="window"
      >
        ${instance.lti13_instance.name}: ${instance.lti13_course_instance.context_label}
      </button>
      <div class="dropdown-menu">
        ${instances.map((i) => {
          const pagePath = page === 'assessments' ? '' : `/${page}`;
          return html`
            <a
              class="dropdown-item ${instance.lti13_course_instance.id ===
              i.lti13_course_instance.id
                ? 'active'
                : ''}"
              href="/pl/course_instance/${resLocals.course_instance
                .id}/instructor/instance_admin/lti13_instance/${i.lti13_course_instance
                .id}${pagePath}"
              aria-current="${instance.lti13_course_instance.id === i.lti13_course_instance.id
                ? 'true'
                : ''}"
            >
              ${i.lti13_instance.name}: ${i.lti13_course_instance.context_label}
            </a>
          `;
        })}
      </div>
    </div>
  `;
}
