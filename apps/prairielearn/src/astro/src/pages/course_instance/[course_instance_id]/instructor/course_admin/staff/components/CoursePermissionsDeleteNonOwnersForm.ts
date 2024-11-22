import { html } from '@prairielearn/html';

export function CoursePermissionsDeleteNonOwnersForm({ csrfToken }: { csrfToken: string }) {
  return html`
    <form name="delete-non-owners" method="POST">
      <input type="hidden" name="__action" value="delete_non_owners" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />

      <div class="form-group mb-4">
        <p class="form-text">
          Taking this action will remove every user from course staff who is not a course content
          Owner.
        </p>
      </div>

      <div class="text-right mt-4">
        <button type="button" class="btn btn-secondary" data-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Delete non-owners</button>
      </div>
    </form>
  `;
}
