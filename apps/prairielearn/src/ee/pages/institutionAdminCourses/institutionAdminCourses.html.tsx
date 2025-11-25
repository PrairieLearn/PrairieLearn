import type { AdminCourse } from '../../../lib/client/safe-db-types.js';

export function InstitutionAdminCourses({ courses }: { courses: AdminCourse[] }) {
  return (
    <div class="card mb-4">
      <div class="card-header bg-primary text-white d-flex align-items-center">Courses!</div>
      {courses.length === 0 ? (
        <div class="card-body">
          <div class="text-center text-muted">No courses</div>
        </div>
      ) : (
        <ul class="list-group list-group-flush">
          {courses.map((course) => (
            <li key={course.id} class="list-group-item">
              <a href={`/pl/course/${course.id}/course_admin`}>
                {course.short_name}: {course.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
