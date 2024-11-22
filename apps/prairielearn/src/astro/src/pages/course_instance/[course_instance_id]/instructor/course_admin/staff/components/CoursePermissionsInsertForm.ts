import { html } from '@prairielearn/html';
import type { CourseInstance } from '../../../../../../../../../lib/db-types';

export function CoursePermissionsInsertForm({
  csrfToken,
  uidsLimit,
  courseInstances,
}: {
  csrfToken: string;
  uidsLimit: number;
  courseInstances: CourseInstance[];
}) {
  return html`
    <form name="add-users-form" method="POST">
      <input type="hidden" name="__action" value="course_permissions_insert_by_user_uids" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />

      <div class="form-group mb-4">
        <p class="form-text">
          Use this form to add users to the course staff. Any UIDs of users who are already on the
          course staff will have their permissions updated only if the new permissions are higher
          than their existing permissions. All new users will be given the same access to course
          content and to student data.
        </p>
      </div>

      <div class="form-group">
        <label for="addUsersInputUid">UIDs:</label>
        <textarea
          class="form-control"
          id="addUsersInputUid"
          name="uid"
          placeholder="student1@example.com, student2@example.com"
          required
          aria-describedby="addUsersInputUidHelp"
        ></textarea>
        <small id="addUsersInputUidHelp" class="form-text text-muted">
          Enter up to ${uidsLimit} UIDs separated by commas, semicolons, or whitespace.
        </small>
      </div>

      <div class="form-group">
        <label for="addUsersInputCourseRole">Course content access for all new users:</label>
        <select
          class="custom-select custom-select-sm"
          id="addUsersInputCourseRole"
          name="course_role"
          required
        >
          <option value="None" selected>None</option>
          <option value="Previewer">Previewer</option>
          <option value="Viewer">Viewer</option>
          <option value="Editor">Editor</option>
          <option value="Owner">Owner</option>
        </select>
      </div>

      ${courseInstances?.length > 0
        ? html`
            <div class="form-group">
              <label for="addUsersInputCourseInstance"
                >Student data access for all new users:</label
              >
              <div class="input-group">
                <select
                  class="custom-select custom-select-sm"
                  id="addUsersInputCourseInstance"
                  name="course_instance_id"
                >
                  <option selected value>None</option>
                  ${courseInstances.map(
                    (ci) => html` <option value="${ci.id}">${ci.short_name}</option>`,
                  )}
                </select>
                <select
                  class="custom-select custom-select-sm"
                  id="addUsersInputCourseInstanceRole"
                  name="course_instance_role"
                >
                  <option value="Student Data Viewer" selected>Viewer</option>
                  <option value="Student Data Editor">Editor</option>
                </select>
              </div>
            </div>
          `
        : ''}

      <div class="text-right mt-4">
        <button type="button" class="btn btn-secondary" data-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Add users</button>
      </div>
    </form>
  `;
}
