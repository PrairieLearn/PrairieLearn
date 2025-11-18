import { html } from '@prairielearn/html';

import { type User } from '../lib/db-types.js';
import type { UntypedResLocals } from '../lib/res-locals.js';

import type { NavContext } from './Navbar.types.js';
import { PageLayout } from './PageLayout.js';

export function InsufficientCoursePermissionsCardPage({
  resLocals,
  courseOwners,
  pageTitle,
  navContext,
  requiredPermissions,
}: {
  resLocals: UntypedResLocals;
  courseOwners: User[];
  pageTitle: string;
  navContext: NavContext;
  requiredPermissions: string;
}) {
  return PageLayout({
    resLocals,
    pageTitle,
    navContext,
    content: InsufficientCoursePermissionsCard({
      courseOwners,
      pageTitle,
      requiredPermissions,
      hasCoursePermissionOwn: resLocals.authz_data.has_course_permission_own,
      urlPrefix: resLocals.urlPrefix,
    }),
  });
}

function InsufficientCoursePermissionsCard({
  courseOwners,
  pageTitle,
  requiredPermissions,
  hasCoursePermissionOwn,
  urlPrefix,
}: {
  courseOwners: User[];
  pageTitle: string;
  requiredPermissions: string;
  hasCoursePermissionOwn: boolean;
  urlPrefix: string;
}) {
  return html`<div class="card mb-4">
    <div class="card-header bg-danger text-white">
      <h1>${pageTitle}</h1>
    </div>
    <div class="card-body">
      <h2>Insufficient permissions</h2>
      <p>You must have at least &quot;${requiredPermissions}&quot; permissions for this course.</p>
      ${hasCoursePermissionOwn
        ? html`<p>
            You can grant yourself the necessary permissions on the course's
            <a href="${urlPrefix}/course_admin/staff">Staff page</a>.
          </p>`
        : courseOwners.length > 0
          ? html`
              <p>Contact one of the below course owners to request access.</p>
              <ul>
                ${courseOwners.map(
                  (owner) => html` <li>${owner.uid} ${owner.name ? `(${owner.name})` : ''}</li> `,
                )}
              </ul>
            `
          : ''}
    </div>
  </div>`;
}
