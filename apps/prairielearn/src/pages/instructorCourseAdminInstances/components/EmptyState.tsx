import { Button } from 'react-bootstrap';

export function EmptyState({
  courseExample,
  canEditCourse,
  needToSync,
  urlPrefix,
  onCreateClick,
}: {
  courseExample: boolean;
  canEditCourse: boolean;
  needToSync: boolean;
  urlPrefix: string;
  onCreateClick: () => void;
}) {
  return (
    <div className="my-4 card-body text-center" style={{ textWrap: 'balance' }}>
      <p className="fw-bold">No course instances found.</p>
      <p className="mb-0">
        A course instance contains the assessments and other configuration for a single offering of
        a course.
      </p>
      <p>
        Learn more in the{' '}
        <a href="https://docs.prairielearn.com/courseInstance/" target="_blank" rel="noreferrer">
          course instance documentation
        </a>
        .
      </p>
      {courseExample ? (
        <p>You can't add course instances to the example course.</p>
      ) : !canEditCourse ? (
        <p>Course Editors can create new course instances.</p>
      ) : needToSync ? (
        <p>
          You must <a href={`${urlPrefix}/course_admin/syncs`}>sync this course</a> before creating
          a new course instance.
        </p>
      ) : (
        <Button variant="primary" size="sm" type="button" onClick={onCreateClick}>
          <i className="fa fa-plus" aria-hidden="true" />
          <span className="d-none d-sm-inline">Add course instance</span>
        </Button>
      )}
    </div>
  );
}
