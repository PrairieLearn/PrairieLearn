import { html } from '@prairielearn/html';

export function SideNav() {
  return html`
    <div class="side-nav">
      <div class="side-nav-section-header">Course</div>
      <div class="side-nav-group mb-3">
        <div>
          <select id="course-picker" class="form-select" aria-label="Course">
            <option selected>TAM 212</option>
            <option>Other course</option>
          </select>
        </div>
        ${SideNavLink({
          text: 'Course instances',
          href: '/',
          icon: 'fa-chalkboard-user',
        })}
        ${SideNavLink({
          text: 'Questions',
          href: '/',
          icon: 'fa-question',
        })}
        ${SideNavLink({
          text: 'Issues',
          href: '/',
          icon: 'fa-bug',
        })}
        ${SideNavLink({
          text: 'Sync',
          href: '/',
          icon: 'fa-sync',
        })}
        ${SideNavLink({
          text: 'Files',
          href: '/',
          icon: 'fa-edit',
        })}
        ${SideNavLink({
          text: 'Settings',
          href: '/',
          icon: 'fa-gear',
        })}
      </div>
      <div class="side-nav-section-header">Course instance</div>
      <div class="side-nav-group mb-3">
        <div>
          <select id="course-instance-picker" class="form-select" aria-label="Course instance">
            <option selected>Fall 2024</option>
            <option>Spring 2024</option>
          </select>
          ${SideNavLink({
            text: 'Assessments',
            href: '/',
            icon: 'fa-list',
          })}
          ${SideNavLink({
            text: 'Gradebook',
            href: '/',
            icon: 'fa-scale-balanced',
          })}
          ${SideNavLink({
            text: 'Files',
            href: '/',
            icon: 'fa-edit',
          })}
          ${SideNavLink({
            text: 'Settings',
            href: '/',
            icon: 'fa-gear',
          })}
        </div>
      </div>
    </div>
  `;
}

function SideNavLink({
  text,
  href,
  icon,
  active = false,
}: {
  text: string; // TODO: Document
  href: string;
  icon: string;
  active?: boolean;
}) {
  return html`
    <a href="${href}" class="${active ? 'side-nav-link-active' : 'side-nav-link'}"
      ><i class="fa fa-fw ${icon}"></i> ${text}</a
    >
  `;
}
