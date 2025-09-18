import type {
  StaffAssessmentContext,
  StaffCourseInstanceContext,
} from '../../../lib/client/page-context.js';
import type { AccessControlJson } from '../../../schemas/accessControl.js';

import { AccessControlForm } from './AccessControlForm.js';

const sampleAccessControl: AccessControlJson[] = [
  {
    enabled: true /* should you consider this access rule? */,
    blockAccess: false /* short circuit, deny access if applies */,
    listBeforeRelease: true /* student can: can see the title, click into the assessment */,

    dateControl: {
      enabled: true,
      releaseDateEnabled: true,
      releaseDate: '2025-03-14T00:01',

      dueDateEnabled: true,
      dueDate: '2025-03-21T23:59',

      earlyDeadlinesEnabled: true,
      earlyDeadlines: [
        { date: '2025-03-17T23:59', credit: 120 },
        { date: '2025-03-20T23:59', credit: 110 },
      ],

      lateDeadlinesEnabled: true,
      lateDeadlines: [
        { date: '2025-03-23T23:59', credit: 80 },
        { date: '2025-03-30T23:59', credit: 50 },
      ],

      /* If allowSubmissions is true, the afterComplete section will never apply */
      afterLastDeadline: {
        /* If allowSubmissions is false, it doesn't make sense for creditEnabled or credit to be set */
        allowSubmissions: true,
        creditEnabled: true /* Is credit text box value enabled and considered? */,
        credit: 30,
      },

      durationMinutesEnabled: true,
      durationMinutes: 60,
      passwordEnabled: true,
      /* If the passwordEnabled field is missing, then if password is set,
        passwordEnabled is true, otherwise it is inherited. */
      password: 'superSecret',
    },
    prairieTestControl: {
      enabled: true,
      exams: [
        { examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c' },
        { examUuid: '896c088c-7468-4045-965b-e8ae134086c2', readOnly: true },
      ],
    },

    /* 
      If you can't answer questions on it, the assessment is complete.
      This typically happens for a couple reasons:
           - durationMinutes was set, and you ran out of time
           - the oldest late deadline, or due date if no late deadlines. 
           - PrairieTest says that the assessment is complete?
      The completion date can be different for different students.
   */

    afterComplete: {
      hideQuestions: true,
      hideQuestionsDateControl: {
        showAgainDateEnabled: true,
        showAgainDate: '2025-03-23T23:59',
        hideAgainDateEnabled: true,
        hideAgainDate: '2025-03-23T23:59',
      },
      hideScore: true,
      hideScoreDateControl: {
        showAgainDateEnabled: true,
        showAgainDate: '2025-03-23T23:59',
      },
    },
  },
  {
    targets: ['sectionB'],
    enabled: true,
    blockAccess: true,
  },
];

export function AccessControl({
  assessment,
  assessmentSet,
  courseInstance,
}: {
  assessment: StaffAssessmentContext['assessment'];
  assessmentSet: StaffAssessmentContext['assessment_set'];
  courseInstance: StaffCourseInstanceContext['course_instance'];
}) {
  const handleFormSubmit = (data: AccessControlJson[]) => {
    // TODO: Implement actual save functionality
    // For now, just log the data
    console.table(data);
  };

  return (
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">
        <h2>
          {assessmentSet.name} {assessment.number}: Access control
        </h2>
      </div>
      <div class="card-body">
        <AccessControlForm
          initialData={sampleAccessControl}
          courseInstance={courseInstance}
          onSubmit={handleFormSubmit}
        />
      </div>
    </div>
  );
}

AccessControl.displayName = 'AccessControl';
