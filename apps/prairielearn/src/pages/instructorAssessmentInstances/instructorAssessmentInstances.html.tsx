import type { Request } from 'express';

import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../../components/PageLayout.js';
import type { UntypedResLocals } from '../../lib/res-locals.types.js';
import { getUrl } from '../../lib/url.js';

import { AssessmentInstancesTable } from './components/AssessmentInstancesTable.js';
import type { AssessmentInstanceRow } from './instructorAssessmentInstances.types.js';

export function InstructorAssessmentInstances({
  resLocals,
  assessmentInstances,
  req,
}: {
  resLocals: UntypedResLocals;
  assessmentInstances: AssessmentInstanceRow[];
  req: Request;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Instances',
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'instances',
    },
    options: {
      fullWidth: true,
      fullHeight: true,
    },
    content: (
      <Hydrate fullHeight>
        <AssessmentInstancesTable
          csrfToken={resLocals.__csrf_token}
          urlPrefix={resLocals.urlPrefix}
          assessmentId={resLocals.assessment.id}
          assessmentSetName={resLocals.assessment_set.name}
          assessmentSetAbbr={resLocals.assessment_set.abbreviation}
          assessmentNumber={resLocals.assessment.number}
          assessmentGroupWork={resLocals.assessment.team_work}
          assessmentMultipleInstance={resLocals.assessment.multiple_instance}
          hasCourseInstancePermissionEdit={resLocals.authz_data.has_course_instance_permission_edit}
          timezone={resLocals.course_instance.display_timezone}
          initialData={assessmentInstances}
          search={getUrl(req).search}
          isDevMode={process.env.NODE_ENV === 'development'}
        />
      </Hydrate>
    ),
  });
}
