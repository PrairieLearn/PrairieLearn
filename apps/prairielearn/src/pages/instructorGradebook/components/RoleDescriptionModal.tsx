import { html } from '@prairielearn/html';

import { Modal } from '../../../components/Modal.js';

export function RoleDescriptionModal() {
  return Modal({
    id: 'role-help',
    title: 'Roles',
    form: false,
    body: html`
      <ul>
        <li>
          <strong>Staff</strong> is a member of the course staff. Depending on course settings, they
          may have permission to see the data of all users, and to edit the information of other
          users.
        </li>
        <li>
          <strong>Student</strong> is a student participating in the class. They can only see their
          own information, and can do assessments.
        </li>
        <li>
          <strong>None</strong> is a user who at one point was part of the course but is no longer
          enrolled in the course or part of the staff. They can no longer access the course but
          their work done within the course has been retained.
        </li>
      </ul>
    `,
    footer: html`
      <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Close</button>
    `,
  });
}
