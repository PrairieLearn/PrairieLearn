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
  csrfToken,
  questionGHLink,
  questionTest,
  questionTags,
  qids,
  assessmentsWithQuestion,
  sharing,
  editableCourses,
  origHash,
  canEdit,
  hasCoursePermissionView,
  courseTopics,
  courseTags,
}: {
  question: StaffQuestion;
  topic: StaffTopic;
  courseInstance: StaffCourseInstance | null;
  csrfToken: string;
  questionGHLink: string | null;
  questionTest: { path: string; csrfToken: string };
  questionTags: StaffTag[];
  qids: string[];
  assessmentsWithQuestion: SelectedAssessments[];
  sharing: { enabled: boolean; setsIn: SharingSetRow[] };
  editableCourses: EditableCourse[];
  origHash: string;
  canEdit: boolean;
  hasCoursePermissionView: boolean;
  courseTopics: StaffTopic[];
  courseTags: StaffTag[];
}) {
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
        hasCoursePermissionView={hasCoursePermissionView}
        editableCourses={editableCourses}
        questionGHLink={questionGHLink}
        courseInstance={courseInstance}
        assessmentsWithQuestion={assessmentsWithQuestion}
        sharing={sharing}
        questionTest={questionTest}
      />
    </div>
  );
}

InstructorQuestionSettings.displayName = 'InstructorQuestionSettings';
