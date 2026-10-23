import { Hydrate } from '@prairielearn/react/server';

import { type StaffInstitution } from '../../lib/client/safe-db-types.js';
import { type NewsItem } from '../../lib/db-types.js';

import { HomeCards } from './components/HomeCards.js';
import { NewsAlert } from './components/NewsAlert.js';
import type {
  InstructorHomePageCourse,
  StudentHomePageCourse,
  UpcomingAssessmentDeadline,
} from './home.types.js';

export function Home({
  canAddCourses,
  csrfToken,
  instructorCourses,
  studentCourses,
  adminInstitutions,
  urlPrefix,
  isDevMode,
  search,
  unreadNewsItems,
  blogUrl,
  now,
  upcomingAssessmentDeadlines,
}: {
  canAddCourses: boolean;
  csrfToken: string;
  instructorCourses: InstructorHomePageCourse[];
  studentCourses: StudentHomePageCourse[];
  adminInstitutions: StaffInstitution[];
  urlPrefix: string;
  isDevMode: boolean;
  search: string;
  unreadNewsItems: NewsItem[];
  blogUrl: string | null;
  now: Date;
  upcomingAssessmentDeadlines: UpcomingAssessmentDeadline[];
}) {
  return (
    <div className="pt-5 mx-auto" style={{ maxWidth: 960 }}>
      <h1 className="visually-hidden">PrairieLearn Homepage</h1>
      <DevModeCard isDevMode={isDevMode} />
      <AdminInstitutionsCard adminInstitutions={adminInstitutions} />
      <NewsAlert newsItems={unreadNewsItems} csrfToken={csrfToken} blogUrl={blogUrl} now={now} />
      <UpcomingDeadlinesCard deadlines={upcomingAssessmentDeadlines} urlPrefix={urlPrefix} />
      <InstructorCoursesCard instructorCourses={instructorCourses} urlPrefix={urlPrefix} />
      <Hydrate>
        <HomeCards
          studentCourses={studentCourses}
          hasInstructorCourses={instructorCourses.length > 0}
          canAddCourses={canAddCourses}
          csrfToken={csrfToken}
          urlPrefix={urlPrefix}
          isDevMode={isDevMode}
          search={search}
        />
      </Hydrate>
    </div>
  );
}

function UpcomingDeadlinesCard({
  deadlines,
  urlPrefix,
}: {
  deadlines: UpcomingAssessmentDeadline[];
  urlPrefix: string;
}) {
  if (deadlines.length === 0) return null;

  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white">
        <h2>Upcoming deadlines</h2>
      </div>
      <div className="table-responsive">
        <table className="table table-sm table-hover mb-0" aria-label="Upcoming deadlines">
          <thead>
            <tr>
              <th>Course</th>
              <th>Assessment</th>
              <th className="text-center">Status</th>
              <th className="text-center">Available credit</th>
            </tr>
          </thead>
          <tbody>
            {deadlines.map((deadline) => (
              <tr key={`${deadline.courseInstanceId}-${deadline.link}`}>
                <td className="align-middle">
                  <a href={`${urlPrefix}/course_instance/${deadline.courseInstanceId}`}>
                    {deadline.courseShortName}
                  </a>
                  <div className="small text-muted">{deadline.courseInstanceLongName}</div>
                </td>
                <td className="align-middle">
                  <span className={`badge color-${deadline.assessmentSetColor} me-2`}>
                    {deadline.label}
                  </span>
                  <a
                    href={`${urlPrefix}/course_instance/${deadline.courseInstanceId}${deadline.link}`}
                  >
                    {deadline.assessmentTitle}
                  </a>
                </td>
                <td className="text-center align-middle">
                  <span
                    className={`badge ${
                      deadline.status === 'In progress' ? 'text-bg-primary' : 'text-bg-secondary'
                    }`}
                  >
                    {deadline.status}
                  </span>
                </td>
                <td className="text-center align-middle text-nowrap">
                  <time dateTime={deadline.deadline.toISOString()}>
                    {deadline.creditDateString}
                  </time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DevModeCard({ isDevMode }: { isDevMode: boolean }) {
  if (!isDevMode) return null;

  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white">
        <h2>Development Mode</h2>
      </div>
      <div className="card-body">
        <p>
          PrairieLearn is running in Development Mode. Click the <strong>"Load from disk"</strong>{' '}
          button above to load question and assessment definitions from JSON files on disk.
        </p>
        <p>
          You need to click "Load from disk" every time that a JSON file is changed on disk. Changes
          to other files (JS, HTML, etc) will be automatically loaded every time you navigate to a
          different page or if you reload the current page in your web browser.
        </p>
        <p className="mb-0">
          See the{' '}
          <a href="https://docs.prairielearn.com" target="_blank" rel="noreferrer">
            PrairieLearn documentation
          </a>{' '}
          for information on creating questions and assessments.
        </p>
      </div>
    </div>
  );
}

interface AdminInstitutionsCardProps {
  adminInstitutions: StaffInstitution[];
}

function AdminInstitutionsCard({ adminInstitutions }: AdminInstitutionsCardProps) {
  if (adminInstitutions.length === 0) return null;

  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white">
        <h2>Institutions with admin access</h2>
      </div>
      <ul className="list-group list-group-flush">
        {adminInstitutions.map((institution) => (
          <li key={institution.id} className="list-group-item">
            <a href={`/pl/institution/${institution.id}/admin/courses`}>
              {institution.short_name}: {institution.long_name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface InstructorCoursesCardProps {
  instructorCourses: InstructorHomePageCourse[];
  urlPrefix: string;
}

function InstructorCoursesCard({ instructorCourses, urlPrefix }: InstructorCoursesCardProps) {
  if (instructorCourses.length === 0) return null;

  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white d-flex align-items-center">
        <h2>Courses with instructor access</h2>
        <a
          href="https://docs.prairielearn.com"
          className="btn btn-light btn-sm ms-auto"
          target="_blank"
          rel="noopener noreferrer"
        >
          <i className="bi bi-journal-text me-sm-1" aria-hidden="true" />
          <span className="d-none d-sm-inline">View docs</span>
        </a>
      </div>

      <div className="table-responsive">
        <table
          className="table table-sm table-hover table-striped"
          aria-label="Courses with instructor access"
        >
          <tbody>
            {instructorCourses.map((course) => (
              <tr key={course.id}>
                <td className="w-50 align-middle">
                  {course.can_open_course ? (
                    <a href={`${urlPrefix}/course/${course.id}`}>
                      {course.short_name}: {course.title}
                    </a>
                  ) : (
                    `${course.short_name}: ${course.title}`
                  )}
                </td>
                <td className="js-course-instance-list">
                  <CourseInstanceList
                    courseInstances={course.course_instances.filter((ci) => !ci.expired)}
                    urlPrefix={urlPrefix}
                  />
                  {course.course_instances.some((ci) => ci.expired) && (
                    <details>
                      <summary className="text-muted small">Older instances</summary>
                      <CourseInstanceList
                        courseInstances={course.course_instances.filter((ci) => ci.expired)}
                        urlPrefix={urlPrefix}
                      />
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface CourseInstanceListProps {
  courseInstances: InstructorHomePageCourse['course_instances'];
  urlPrefix: string;
}

function CourseInstanceList({ courseInstances, urlPrefix }: CourseInstanceListProps) {
  return (
    <div className="d-flex flex-wrap gap-2 my-1">
      {courseInstances.map((courseInstance) => (
        <a
          key={courseInstance.id}
          className="btn btn-outline-primary btn-sm"
          href={`${urlPrefix}/course_instance/${courseInstance.id}/instructor`}
        >
          {courseInstance.long_name}
        </a>
      ))}
    </div>
  );
}
