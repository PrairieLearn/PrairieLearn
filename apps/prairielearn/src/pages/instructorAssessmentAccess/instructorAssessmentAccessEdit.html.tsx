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

const GroupSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const IndividualTargetSchema = z.object({
  enrollmentId: z.string(),
  uid: z.string(),
  name: z.string().nullable(),
});

export const AccessControlWithGroupsSchema = RawStaffAssessmentAccessControlSchema.extend({
  groups: z.array(GroupSchema).nullable(),
  individual_targets: z.array(IndividualTargetSchema).nullable(),
  early_deadlines: z.array(DeadlineSchema).nullable(),
  late_deadlines: z.array(DeadlineSchema).nullable(),
  prairietest_exams: z.array(PrairieTestExamSchema).nullable(),
});
export type AccessControlWithGroups = z.infer<typeof AccessControlWithGroupsSchema>;

export function InstructorAssessmentAccessEdit({
  resLocals,
  accessControl,
  isNewMainRule = false,
}: {
  resLocals: ResLocalsForPage<'assessment'>;
  accessControl: AccessControlWithGroups | null;
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
    const groups = accessControl.groups ?? [];
    const individuals = accessControl.individual_targets ?? [];

    if (groups.length > 0) {
      if (groups.length === 1) {
        pageTitle = `Edit override for ${groups[0].name}`;
      } else if (groups.length === 2) {
        pageTitle = `Edit override for ${groups[0].name} and ${groups[1].name}`;
      } else {
        pageTitle = `Edit override for ${groups[0].name}, ${groups[1].name}, and ${groups.length - 2} others`;
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
          urlPrefix={resLocals.urlPrefix}
          assessmentId={resLocals.assessment.id}
        />,
      )}
    `,
  });
}
