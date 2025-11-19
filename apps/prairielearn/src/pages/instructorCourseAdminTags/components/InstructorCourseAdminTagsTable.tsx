import { TagBadge } from '../../../components/TagBadge.js';
import { TagDescription } from '../../../components/TagDescription.js';
import { type StaffTag } from '../../../lib/client/safe-db-types.js';

export function InstructorCourseAdminTagsTable({ tags }: { tags: StaffTag[] }) {
  return (
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">
        <h1>Tags</h1>
      </div>
      <div class="table-responsive">
        <table class="table table-sm table-hover table-striped" aria-label="Tags">
          <thead>
            <tr>
              <th>Number</th>
              <th>Name</th>
              <th>Color</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {tags.map((tag) => (
              <tr key={tag.name}>
                <td class="align-middle">{tag.number}</td>
                <td class="align-middle">
                  <TagBadge tag={tag} />
                </td>
                <td class="align-middle">{tag.color}</td>
                <td class="align-middle">
                  <TagDescription tag={tag} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

InstructorCourseAdminTagsTable.displayName = 'InstructorCourseAdminTagsTable';
