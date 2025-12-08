import type { PageContext } from '../../../lib/client/page-context.js';
import type { AccessControlJson } from '../../../schemas/accessControl.js';

import { AccessControlForm } from './AccessControlForm.js';

const sampleAccessControl: AccessControlJson[] = [
  {
    enabled: true /* should you consider this access rule? */,
    blockAccess: false /* short circuit, deny access if applies */,
    listBeforeRelease: true /* student can: can see the title, click into the assessment */,

    dateControl: {
      enabled: true,
      releaseDate: '2025-03-14T00:01',
      dueDate: '2025-03-21T23:59',

      earlyDeadlines: [
        { date: '2025-03-17T23:59', credit: 120 },
        { date: '2025-03-20T23:59', credit: 110 },
      ],

      lateDeadlines: [
        { date: '2025-03-23T23:59', credit: 80 },
        { date: '2025-03-30T23:59', credit: 50 },
      ],

      /* If allowSubmissions is true, the afterComplete section will never apply */
      afterLastDeadline: {
        allowSubmissions: true,
        credit: 30,
      },

      durationMinutes: 60,
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
      showQuestionsAgainDate: true,
      hideQuestionsAgainDate: true,
      hideScore: true,
      showScoreAgainDate: true,
    },
  },
  {
    targets: ['sectionB'],
    enabled: true,
    blockAccess: false,
    listBeforeRelease: true,
    dateControl: {
      enabled: false,
    },
    prairieTestControl: {
      enabled: false,
    },
  },
];

export function AccessControl({
  courseInstance,
}: {
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
}) {
  const handleFormSubmit = (data: AccessControlJson[]) => {
    // TODO: Implement actual save functionality
    // For now, just log the data
    console.table(data);
  };

  return (
    <AccessControlForm
      initialData={sampleAccessControl}
      courseInstance={courseInstance}
      onSubmit={handleFormSubmit}
    />
  );
}

AccessControl.displayName = 'AccessControl';
