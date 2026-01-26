import { ExpandableUserList } from '../../../components/ExpandableUserList.js';
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
  const color = label.student_label.color ?? 'gray1';

  return (
    <tr>
      <td className="align-middle">
        <span className={`badge color-${color}`}>{label.student_label.name}</span>
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
              onClick={() => onEdit(label)}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
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
