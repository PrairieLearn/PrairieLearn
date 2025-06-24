import type { Table } from '@tanstack/react-table';

import { downloadAsCSV, downloadAsJSON } from '../../../lib/client/downloads.js';
import type { StudentRow } from '../instructorStudents.shared.js';

export const DownloadButton = ({
  students,
  table,
}: {
  students: StudentRow[];
  table: Table<StudentRow>;
}) => {
  function downloadStudentsCSV(students: StudentRow[], filename: string): void {
    const rows = students.map((student) => [
      student.uid,
      student.name,
      student.email,
      student.created_at
        ? new Date(student.created_at).toISOString().replace('T', ' ').split('.')[0]
        : '',
    ]);
    downloadAsCSV(['UID', 'Name', 'Email', 'Enrolled At'], rows, filename);
  }
  return (
    <div class="btn-group">
      <button
        type="button"
        class="btn btn-sm btn-outline-primary dropdown-toggle"
        data-bs-toggle="dropdown"
        aria-expanded="false"
      >
        <i class="px-2 fa fa-download" aria-hidden="true"></i>
        Download
      </button>
      <ul class="dropdown-menu">
        <li>
          <button
            class="dropdown-item"
            type="button"
            onClick={() => downloadAsJSON(students, 'students.csv')}
          >
            All Students as CSV
          </button>
        </li>
        <li>
          <button
            class="dropdown-item"
            type="button"
            onClick={() => downloadAsJSON(students, 'students.csv')}
          >
            All Students as JSON
          </button>
        </li>
        <li>
          <button
            class="dropdown-item"
            type="button"
            onClick={() =>
              downloadStudentsCSV(
                table.getFilteredRowModel().rows.map((row) => row.original),
                'students-current-view.csv',
              )
            }
          >
            Filtered Students as CSV
          </button>
        </li>
        <li>
          <button
            class="dropdown-item"
            type="button"
            onClick={() =>
              downloadAsJSON(
                table.getFilteredRowModel().rows.map((row) => row.original),
                'students-current-view.json',
              )
            }
          >
            Filtered Students as JSON
          </button>
        </li>
      </ul>
    </div>
  );
};
