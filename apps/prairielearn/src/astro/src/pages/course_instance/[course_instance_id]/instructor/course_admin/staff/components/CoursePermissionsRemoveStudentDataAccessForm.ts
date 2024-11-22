import { html } from '@prairielearn/html';

export function CoursePermissionsRemoveStudentDataAccessForm({ csrfToken }: { csrfToken: string }) {
  return html`
    <form name="remove-student-data-access" method="POST">
      <input type="hidden" name="__action" value="remove_all_student_data_access" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />

      <div class="form-group mb-4">
        <p class="form-text">
          Taking this action will remove all student data access from all users (but will leave
          these users on the course staff).
        </p>
      </div>

      <div class="text-right mt-4">
        <button type="button" class="btn btn-secondary" data-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Remove all student data access</button>
      </div>
    </form>
  `;
}
