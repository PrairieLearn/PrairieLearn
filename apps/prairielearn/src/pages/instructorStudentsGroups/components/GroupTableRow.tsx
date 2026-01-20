import { ExpandableUserList } from '../../../components/ExpandableUserList.js';
import type { StudentGroupWithUserData } from '../instructorStudentsGroups.types.js';

export function GroupTableRow({
  group,
  courseInstanceId,
  canEdit,
  onEdit,
  onDelete,
}: {
  group: StudentGroupWithUserData;
  courseInstanceId: string;
  canEdit: boolean;
  onEdit: (group: StudentGroupWithUserData) => void;
  onDelete: (group: StudentGroupWithUserData) => void;
}) {
  const color = group.student_group.color ?? 'gray1';

  return (
    <tr>
      <td className="align-middle">
        <span className={`badge color-${color}`}>{group.student_group.name}</span>
      </td>
      <td className="align-middle">
        <ExpandableUserList
          users={group.user_data}
          courseInstanceId={courseInstanceId}
          emptyText="0 students"
          nameFallback="uid"
        />
      </td>
      {canEdit && (
        <td className="align-middle">
          <div className="d-flex gap-1">
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={() => onEdit(group)}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              onClick={() => onDelete(group)}
            >
              Delete
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}
