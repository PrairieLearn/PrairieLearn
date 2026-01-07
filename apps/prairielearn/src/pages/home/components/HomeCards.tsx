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
  enrollmentManagementEnabled: boolean;
}

export function HomeCardsInner({
  studentCourses,
  hasInstructorCourses,
  canAddCourses,
  csrfToken,
  urlPrefix,
  isDevMode,
  enrollmentManagementEnabled,
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
          enrollmentManagementEnabled={enrollmentManagementEnabled}
          setShowJoinModal={setShowJoinModal}
        />
      ) : (
        <EmptyStateCards
          urlPrefix={urlPrefix}
          enrollmentManagementEnabled={enrollmentManagementEnabled}
          setShowJoinModal={setShowJoinModal}
        />
      )}
      <EnrollmentCodeForm
        style="modal"
        show={showJoinModal}
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
