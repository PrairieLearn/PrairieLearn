import { StudentLabelBadge } from '../../../components/StudentLabelBadge.js';
import { getCourseInstanceStudentsUrl } from '../../../lib/client/url.js';
import type { StudentLabelWithUserData } from '../instructorStudentsLabels.types.js';

export function LabelTableRow({
  label,
  courseInstanceId,
  canEdit,
  disabled,
  onEdit,
  onDelete,
}: {
  label: StudentLabelWithUserData;
  courseInstanceId: string;
  canEdit: boolean;
  disabled?: boolean;
  onEdit: (label: StudentLabelWithUserData) => void;
  onDelete: (label: StudentLabelWithUserData) => void;
}) {
  const count = label.user_data.length;
  const studentsUrl = `${getCourseInstanceStudentsUrl(courseInstanceId)}?student_labels=${encodeURIComponent(label.student_label.id)}`;

  return (
    <tr>
      <td className="align-middle">
        <StudentLabelBadge label={label.student_label} />
      </td>
      <td className="align-middle">
        {count === 0 ? (
          <span className="text-muted">0 students</span>
        ) : (
          <a href={studentsUrl}>
            {count} {count === 1 ? 'student' : 'students'}
          </a>
        )}
      </td>
      {canEdit && (
        <td className="align-middle">
          <div className="d-flex gap-1">
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              aria-label={`Edit ${label.student_label.name}`}
              disabled={disabled}
              onClick={() => onEdit(label)}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              aria-label={`Delete ${label.student_label.name}`}
              disabled={disabled}
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
