import type { Table } from '@tanstack/react-table';

import { downloadAsCSV, downloadAsJSON } from '../../../lib/client/downloads.js';
import type { StaffCourseInstanceContext } from '../../../lib/client/page-context.js';
import { courseInstanceFilenamePrefix } from '../../../lib/sanitize-name.js';
import type { StudentRow } from '../instructorStudents.shared.js';

export function DownloadButton({
  students,
  table,
  course,
  courseInstance,
}: {
  students: StudentRow[];
  table: Table<StudentRow>;
  course: StaffCourseInstanceContext['course'];
  courseInstance: StaffCourseInstanceContext['course_instance'];
}) {
  const filenamePrefix = courseInstanceFilenamePrefix(courseInstance, course);
  function downloadStudentsCSV(students: StudentRow[], filename: string): void {
    const rows = students.map((student) => [
      student.user.uid,
      student.user.name,
      student.user.email,
      student.enrollment.created_at
        ? new Date(student.enrollment.created_at).toISOString().replace('T', ' ').split('.')[0]
        : '',
    ]);
    downloadAsCSV(['UID', 'Name', 'Email', 'Enrolled At'], rows, filename);
  }

  function downloadStudentsJSON(students: StudentRow[], filename: string): void {
    const rows = students.map((student) => ({
      uid: student.user.uid,
      name: student.user.name,
      email: student.user.email,
      enrolled_at: student.enrollment.created_at,
    }));
    downloadAsJSON(rows, filename);
  }

  return (
    <div class="btn-group">
      <button
        type="button"
        data-bs-toggle="dropdown"
        aria-expanded="false"
        class="btn btn-light btn-sm dropdown-toggle"
      >
        <i aria-hidden="true" class="pe-2 bi bi-download"></i>
        Download
      </button>
      <ul class="dropdown-menu">
        <li>
          <button
            class="dropdown-item"
            type="button"
            onClick={() => downloadStudentsCSV(students, `${filenamePrefix}students.csv`)}
          >
            All students as CSV
          </button>
        </li>
        <li>
          <button
            class="dropdown-item"
            type="button"
            onClick={() => downloadStudentsJSON(students, `${filenamePrefix}students.json`)}
          >
            All students as JSON
          </button>
        </li>
        <li>
          <button
            class="dropdown-item"
            type="button"
            onClick={() =>
              downloadStudentsCSV(
                table.getFilteredRowModel().rows.map((row) => row.original),
                `${filenamePrefix}students_filtered.csv`,
              )
            }
          >
            Filtered students as CSV
          </button>
        </li>
        <li>
          <button
            class="dropdown-item"
            type="button"
            onClick={() =>
              downloadStudentsJSON(
                table.getFilteredRowModel().rows.map((row) => row.original),
                `${filenamePrefix}students_filtered.json`,
              )
            }
          >
            Filtered students as JSON
          </button>
        </li>
      </ul>
    </div>
  );
}
