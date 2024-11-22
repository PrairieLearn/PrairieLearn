import { html } from '@prairielearn/html';

export function CoursePermissionsDeleteNoAccessForm({ csrfToken }: { csrfToken: string }) {
  return html`
    <form name="delete-no-access" method="POST">
      <input type="hidden" name="__action" value="delete_no_access" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />

      <div class="form-group mb-4">
        <p class="form-text">
          Taking this action will remove every user from course staff who has neither course content
          access nor student data access.
        </p>
      </div>

      <div class="text-right mt-4">
        <button type="button" class="btn btn-secondary" data-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Delete users with no access</button>
      </div>
    </form>
  `;
}
