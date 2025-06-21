import { type User } from '../../../lib/db-types.js';

export function StudentDataViewMissing({
  courseOwners,
  hasCoursePermissionOwn,
  urlPrefix,
}: {
  courseOwners: User[];
  hasCoursePermissionOwn: boolean;
  urlPrefix: string;
}) {
  return (
    <div className="card mb-4">
      <div className="card-header bg-danger text-white">
        <h1>Students</h1>
      </div>
      <div className="card-body">
        <h2>Insufficient permissions</h2>
        <p>You must have permission to view student data in order to access the students list.</p>
        {hasCoursePermissionOwn ? (
          <p>
            You can grant yourself access to student data on the course's{' '}
            <a href={`${urlPrefix}/course_admin/staff`}>Staff tab</a>.
          </p>
        ) : courseOwners.length > 0 ? (
          <>
            <p>Contact one of the below course owners to request access.</p>
            <ul>
              {courseOwners.map((owner) => (
                <li key={owner.user_id}>
                  {owner.uid} {owner.name ? `(${owner.name})` : ''}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}
