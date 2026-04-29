import type {
  StaffCourseInstance,
  StaffQuestion,
  StaffTag,
  StaffTopic,
} from '../../lib/client/safe-db-types.js';

import { QuestionSettingsForm } from './components/QuestionSettingsForm.js';
import type {
  EditableCourse,
  SelectedAssessments,
  SharingSetRow,
} from './instructorQuestionSettings.types.js';

export function InstructorQuestionSettings({
  question,
  topic,
  courseInstance,
  courseId,
  csrfToken,
  questionGHLink,
  questionTestPath,
  questionTestCsrfToken,
  questionTags,
  qids,
  assessmentsWithQuestion,
  sharingEnabled,
  sharingSetsIn,
  editableCourses,
  origHash,
  canEdit,
  canCopy,
  hasCoursePermissionView,
  isFreeformQuestion,
  isExternalGrading,
  courseTopics,
  courseTags,
}: {
  question: StaffQuestion;
  topic: StaffTopic;
  courseInstance: StaffCourseInstance | null;
  courseId: string;
  csrfToken: string;
  questionGHLink: string | null;
  questionTestPath: string;
  questionTestCsrfToken: string;
  questionTags: StaffTag[];
  qids: string[];
  assessmentsWithQuestion: SelectedAssessments[];
  sharingEnabled: boolean;
  sharingSetsIn: SharingSetRow[];
  editableCourses: EditableCourse[];
  origHash: string;
  canEdit: boolean;
  canCopy: boolean;
  hasCoursePermissionView: boolean;
  isFreeformQuestion: boolean;
  isExternalGrading: boolean;
  courseTopics: StaffTopic[];
  courseTags: StaffTag[];
}) {
  const showTestsSection = isFreeformQuestion && !isExternalGrading && hasCoursePermissionView;

  return (
    <div className="d-flex flex-column gap-3">
      <QuestionSettingsForm
        question={question}
        topic={topic}
        courseTopics={courseTopics}
        courseTags={courseTags}
        questionTags={questionTags}
        qids={qids}
        origHash={origHash}
        csrfToken={csrfToken}
        canEdit={canEdit}
        canCopy={canCopy}
        editableCourses={editableCourses}
        courseId={courseId}
        questionGHLink={questionGHLink}
        courseInstance={courseInstance}
        assessmentsWithQuestion={assessmentsWithQuestion}
        sharingEnabled={sharingEnabled}
        sharingSetsIn={sharingSetsIn}
        showTestsSection={showTestsSection}
        questionTestPath={questionTestPath}
        questionTestCsrfToken={questionTestCsrfToken}
      />
    </div>
  );
}

InstructorQuestionSettings.displayName = 'InstructorQuestionSettings';
