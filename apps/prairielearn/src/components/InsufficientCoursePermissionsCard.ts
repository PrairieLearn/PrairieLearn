import { html } from '@prairielearn/html';

import { type User } from '../lib/db-types.js';

import { HeadContents } from './HeadContents.html.js';
import { Navbar } from './Navbar.html.js';

export function InsufficientCoursePermissionsCardPage({
  resLocals,
  courseOwners,
  pageTitle,
  requiredPermissions,
}: {
  resLocals: Record<string, any>;
  courseOwners: User[];
  pageTitle: string;
  requiredPermissions: string;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle })}
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container-fluid">
          ${InsufficientCoursePermissionsCard({ courseOwners, pageTitle, requiredPermissions })}
        </main>
      </body>
    </html>
  `.toString();
}

export function InsufficientCoursePermissionsCard({
  courseOwners,
  pageTitle,
  requiredPermissions,
}: {
  courseOwners: User[];
  pageTitle: string;
  requiredPermissions: string;
}) {
  return html`<div class="card mb-4">
    <div class="card-header bg-danger text-white">
      <h1>${pageTitle}</h1>
    </div>
    <div class="card-body">
      <h2>Insufficient permissions</h2>
      <p>You must have at least &quot;${requiredPermissions}&quot; permissions for this course.</p>
      ${courseOwners.length > 0
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
