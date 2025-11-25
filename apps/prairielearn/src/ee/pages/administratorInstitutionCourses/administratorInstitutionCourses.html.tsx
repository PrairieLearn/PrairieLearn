import { type AdminCourse, type AdminInstitution } from '../../../lib/client/safe-db-types.js';

export function AdministratorInstitutionCourses({
  institution,
  courses,
}: {
  institution: AdminInstitution;
  courses: AdminCourse[];
}) {
  return (
    <div class="table-responsive">
      <table class="table table-hover table-striped table-bordered" aria-label="Courses">
        <thead>
          <tr>
            <th>Name</th>
            <th>Effective yearly enrollment limit</th>
          </tr>
        </thead>
        <tbody>
          {courses.map((course) => (
            <tr key={course.id}>
              <td>
                <a href={`/pl/administrator/institution/${institution.id}/course/${course.id}`}>
                  {course.short_name ?? '—'}: {course.title ?? '—'}
                </a>
              </td>
              <td>{course.yearly_enrollment_limit ?? institution.yearly_enrollment_limit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
