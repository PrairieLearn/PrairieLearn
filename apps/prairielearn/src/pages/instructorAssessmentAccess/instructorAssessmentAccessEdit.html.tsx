import { z } from 'zod';

import { html } from '@prairielearn/html';
import { hydrateHtml } from '@prairielearn/react/server';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { RawStaffAssessmentAccessControlSchema } from '../../lib/client/safe-db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

import { AccessControlRulePage } from './components/AccessControlRulePage.js';

const DeadlineSchema = z.object({
  date: z.string(),
  credit: z.number(),
});

const PrairieTestExamSchema = z.object({
  examUuid: z.string(),
  readOnly: z.boolean().nullable(),
});

const StudentLabelSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const IndividualTargetSchema = z.object({
  enrollmentId: z.string(),
  uid: z.string(),
  name: z.string().nullable(),
});

export const AccessControlWithStudentLabelsSchema = RawStaffAssessmentAccessControlSchema.extend({
  student_labels: z.array(StudentLabelSchema).nullable(),
  individual_targets: z.array(IndividualTargetSchema).nullable(),
  early_deadlines: z.array(DeadlineSchema).nullable(),
  late_deadlines: z.array(DeadlineSchema).nullable(),
  prairietest_exams: z.array(PrairieTestExamSchema).nullable(),
});
export type AccessControlWithStudentLabels = z.infer<typeof AccessControlWithStudentLabelsSchema>;

export function InstructorAssessmentAccessEdit({
  resLocals,
  accessControl,
  isNewMainRule = false,
}: {
  resLocals: ResLocalsForPage<'assessment'>;
  accessControl: AccessControlWithStudentLabels | null;
  isNewMainRule?: boolean;
}) {
  const isNew = accessControl === null;
  const isMainRule = accessControl?.number === 0 || isNewMainRule;
  const pageContext = extractPageContext(resLocals, {
    pageType: 'courseInstance',
    accessType: 'instructor',
  });

  let pageTitle: string;
  if (isMainRule) {
    pageTitle = isNew ? 'Create main rule' : 'Edit main rule';
  } else if (isNew) {
    pageTitle = 'New override';
  } else {
    // Generate descriptive title based on targets
    const studentLabels = accessControl.student_labels ?? [];
    const individuals = accessControl.individual_targets ?? [];

    if (studentLabels.length > 0) {
      if (studentLabels.length === 1) {
        pageTitle = `Edit override for ${studentLabels[0].name}`;
      } else if (studentLabels.length === 2) {
        pageTitle = `Edit override for ${studentLabels[0].name} and ${studentLabels[1].name}`;
      } else {
        pageTitle = `Edit override for ${studentLabels[0].name}, ${studentLabels[1].name}, and ${studentLabels.length - 2} others`;
      }
    } else if (individuals.length > 0) {
      const getName = (ind: (typeof individuals)[0]) => ind.name || ind.uid;
      if (individuals.length === 1) {
        pageTitle = `Edit override for ${getName(individuals[0])}`;
      } else if (individuals.length === 2) {
        pageTitle = `Edit override for ${getName(individuals[0])} and ${getName(individuals[1])}`;
      } else {
        pageTitle = `Edit override for ${getName(individuals[0])}, ${getName(individuals[1])}, and ${individuals.length - 2} others`;
      }
    } else {
      pageTitle = 'Edit override';
    }
  }

  return PageLayout({
    resLocals,
    pageTitle,
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'access',
    },
    options: {
      fullWidth: true,
    },
    content: html`
      ${hydrateHtml(
        <AccessControlRulePage
          accessControl={accessControl}
          isMainRule={isMainRule}
          isNew={isNew}
          courseInstance={pageContext.course_instance}
          csrfToken={resLocals.__csrf_token}
          assessmentId={resLocals.assessment.id}
        />,
      )}
    `,
  });
}
