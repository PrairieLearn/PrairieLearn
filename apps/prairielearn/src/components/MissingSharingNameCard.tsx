export function MissingSharingNameCard({ courseId }: { courseId: string }) {
  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white">Missing sharing name</div>
      <div className="card-body">
        <p className="mb-0">
          This course doesn't have a sharing name. If you are an Owner of this course, please choose
          a sharing name on the{' '}
          <a href={`/pl/course/${courseId}/course_admin/sharing`}>course sharing settings page</a>.
        </p>
      </div>
    </div>
  );
}
