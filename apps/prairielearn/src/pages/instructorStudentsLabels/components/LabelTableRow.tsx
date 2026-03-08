import { ExpandableUserList } from '../../../components/ExpandableUserList.js';
import { StudentLabelBadge } from '../../../components/StudentLabelBadge.js';
import type { StudentLabelWithUserData } from '../instructorStudentsLabels.types.js';

export function LabelTableRow({
  label,
  courseInstanceId,
  canEdit,
  onEdit,
  onDelete,
}: {
  label: StudentLabelWithUserData;
  courseInstanceId: string;
  canEdit: boolean;
  onEdit: (label: StudentLabelWithUserData) => void;
  onDelete: (label: StudentLabelWithUserData) => void;
}) {
  return (
    <tr>
      <td className="align-middle">
        <StudentLabelBadge label={label.student_label} />
      </td>
      <td className="align-middle">
        <ExpandableUserList
          users={label.user_data}
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
              aria-label={`Edit ${label.student_label.name}`}
              onClick={() => onEdit(label)}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              aria-label={`Delete ${label.student_label.name}`}
              onClick={() => onDelete(label)}
            >
              Delete
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}
