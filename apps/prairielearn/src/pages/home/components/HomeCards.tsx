import { parseAsBoolean, useQueryState } from 'nuqs';

import { NuqsAdapter } from '@prairielearn/ui';

import { EnrollmentCodeForm } from '../../../components/EnrollmentCodeForm.js';

import { EmptyStateCards } from './EmptyStateCards.js';
import { StudentCoursesCard, type StudentHomePageCourse } from './StudentCoursesCard.js';

interface HomeCardsProps {
  studentCourses: StudentHomePageCourse[];
  hasInstructorCourses: boolean;
  canAddCourses: boolean;
  csrfToken: string;
  urlPrefix: string;
  isDevMode: boolean;
}

function HomeCardsInner({
  studentCourses,
  hasInstructorCourses,
  canAddCourses,
  csrfToken,
  urlPrefix,
  isDevMode,
}: HomeCardsProps) {
  const [showJoinModal, setShowJoinModal] = useQueryState(
    'join',
    parseAsBoolean.withDefault(false),
  );

  const hasCourses = studentCourses.length > 0 || hasInstructorCourses;

  return (
    <>
      {hasCourses ? (
        <StudentCoursesCard
          studentCourses={studentCourses}
          hasInstructorCourses={hasInstructorCourses}
          canAddCourses={canAddCourses}
          csrfToken={csrfToken}
          urlPrefix={urlPrefix}
          isDevMode={isDevMode}
          setShowJoinModal={setShowJoinModal}
        />
      ) : (
        <EmptyStateCards urlPrefix={urlPrefix} setShowJoinModal={setShowJoinModal} />
      )}
      <EnrollmentCodeForm
        style="modal"
        show={showJoinModal}
        leadingContent={
          <p>To join a course, enter the enrollment code provided by your instructor.</p>
        }
        showInstructorHelp={hasInstructorCourses}
        onHide={() => setShowJoinModal(false)}
      />
    </>
  );
}

export function HomeCards({ search, ...props }: { search: string } & HomeCardsProps) {
  return (
    <NuqsAdapter search={search}>
      <HomeCardsInner {...props} />
    </NuqsAdapter>
  );
}
HomeCards.displayName = 'HomeCards';
