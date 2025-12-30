import type { Request } from 'express';

import { html } from '@prairielearn/html';
import { Hydrate } from '@prairielearn/preact/server';

import { Modal } from '../../components/Modal.js';
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
    postContent: [
      RoleHelpModal(),
      FingerprintChangesHelpModal(),
      DurationHelpModal(),
      TimeRemainingHelpModal(),
      ...(resLocals.authz_data.has_course_instance_permission_edit
        ? [
            DeleteAllAssessmentInstancesModal({
              assessmentSetName: resLocals.assessment_set.name,
              assessmentNumber: resLocals.assessment.number,
              csrfToken: resLocals.__csrf_token,
            }),
            GradeAllAssessmentInstancesModal({
              assessmentSetName: resLocals.assessment_set.name,
              assessmentNumber: resLocals.assessment.number,
              csrfToken: resLocals.__csrf_token,
            }),
            CloseAllAssessmentInstancesModal({
              assessmentSetName: resLocals.assessment_set.name,
              assessmentNumber: resLocals.assessment.number,
              csrfToken: resLocals.__csrf_token,
            }),
          ]
        : []),
    ],
  });
}

function RoleHelpModal() {
  return Modal({
    id: 'role-help',
    title: 'Roles',
    form: false,
    body: html`
      <ul>
        <li>
          <strong>Staff</strong> is a member of the course staff. They can see the data of all
          users, and depending on course settings may have permission to edit the information of
          other users.
        </li>
        <li>
          <strong>Student</strong> is a student participating in the class. They can only see their
          own information, and can do assessments.
        </li>
        <li>
          <strong>None</strong> is a user who at one point added the course and later removed
          themselves. They can no longer access the course but their work done within the course has
          been retained.
        </li>
      </ul>
    `,
    footer: html`
      <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Close</button>
    `,
  });
}

function FingerprintChangesHelpModal() {
  return Modal({
    id: 'fingerprint-changes-help',
    title: 'Client Fingerprints',
    form: false,
    body: html`
      <p>
        Client fingerprints are a record of a user's IP address, user agent and session. These
        attributes are tracked while a user is accessing an assessment. This value indicates the
        amount of times that those attributes changed as the student accessed the assessment, while
        the assessment was active. Some changes may naturally occur during an assessment, such as if
        a student changes network connections or browsers. However, a high number of changes in an
        exam-like environment could be an indication of multiple people accessing the same
        assessment simultaneously, which may suggest an academic integrity issue. Accesses taking
        place after the assessment has been closed are not counted, as they typically indicate
        scenarios where a student is reviewing their results, which may happen outside of a
        controlled environment.
      </p>
    `,
    footer: html`
      <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Close</button>
    `,
  });
}

function DurationHelpModal() {
  return Modal({
    id: 'duration-help',
    title: 'Duration',
    form: false,
    body: html`
      <p>
        The "Duration" is the amount of time that a student has spent actively working on the
        assessment. The duration time measurement begins when the student starts the assessment and
        continues until the most recent answer submission.
      </p>
      <p>
        <strong>For Homework assessments</strong>, a student is considered to be actively working if
        they have at least one answer submission per hour, so the duration measurement is paused if
        there is a gap of more than one hour between answer submissions. For example:
      </p>
      <ul>
        <li>08:00 - student starts assessment;</li>
        <li>08:30 - student submits answer;</li>
        <li>09:00 - student submits answer;</li>
        <li>(gap of more than one hour)</li>
        <li>11:00 - student submits answer;</li>
        <li>11:30 - student submits answer;</li>
        <li>12:00 - student submits answer.</li>
      </ul>
      <p>
        In the above example, the "duration" would be 2 hours: one hour from 08:00 to 09:00, and
        another hour from 11:00 to 12:00. The two-hour gap between 09:00 to 11:00 is not counted as
        part of the duration.
      </p>
      <p>
        <strong>For Exam assessments</strong>, a student is considered to be actively working
        between the start of the assessment and the last submission, regardless of any potential
        inactivity. For the same example above, the "duration" would be 4 hours, from 08:00 to
        12:00. The two-hour gap is not considered inactivity, since it is assumed that this kind of
        assessment requires students to be active for the duration of the assessment.
      </p>
    `,
    footer: html`
      <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Close</button>
    `,
  });
}

function TimeRemainingHelpModal() {
  return Modal({
    id: 'time-remaining-help',
    title: 'Time Remaining',
    form: false,
    body: html`
      <p>
        For open assessments with a time limit, this column will indicate the number of minutes
        (rounded down) the student has left to complete the assessment. If the value is
        <strong>&lt; 1 min</strong>, the student has less than one minute to complete it. This
        column may also contain one of the following special values.
      </p>
      <ul>
        <li>
          <strong>Expired</strong> indicates the assessment time limit has expired, and will be
          automatically closed as soon as possible. If an assessment is Expired for a prolonged
          period of time, this typically means the student has closed their browser or lost
          connectivity, and the assessment will be closed as soon as the student opens the
          assessment. No further submissions are accepted at this point.
        </li>
        <li>
          <strong>Closed</strong> indicates the assessment has been closed, and no further
          submissions are accepted.
        </li>
        <li>
          <strong>Open (no time limit)</strong> indicates that the assessment is still open and
          accepting submissions, and there is no time limit to submit the assessment (other than
          those indicated by access rules).
        </li>
      </ul>
    `,
    footer: html`
      <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Close</button>
    `,
  });
}

function DeleteAllAssessmentInstancesModal({
  assessmentSetName,
  assessmentNumber,
  csrfToken,
}: {
  assessmentSetName: string;
  assessmentNumber: number;
  csrfToken: string;
}) {
  return Modal({
    id: 'deleteAllAssessmentInstancesModal',
    title: 'Delete all assessment instances',
    body: html`
      Are you sure you want to delete all assessment instances for
      <strong> ${assessmentSetName} ${assessmentNumber} </strong>
      ? This cannot be undone.
    `,
    footer: html`
      <input type="hidden" name="__action" value="delete_all" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-danger">Delete all</button>
    `,
  });
}

function GradeAllAssessmentInstancesModal({
  assessmentSetName,
  assessmentNumber,
  csrfToken,
}: {
  assessmentSetName: string;
  assessmentNumber: number;
  csrfToken: string;
}) {
  return Modal({
    id: 'grade-all-form',
    title: 'Grade all assessment instances',
    body: html`
      Are you sure you want to grade pending submissions for all assessment instances for
      <strong>${assessmentSetName} ${assessmentNumber}</strong>? This cannot be undone.
    `,
    footer: html`
      <input type="hidden" name="__action" value="grade_all" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Grade all</button>
    `,
  });
}

function CloseAllAssessmentInstancesModal({
  assessmentSetName,
  assessmentNumber,
  csrfToken,
}: {
  assessmentSetName: string;
  assessmentNumber: number;
  csrfToken: string;
}) {
  return Modal({
    id: 'closeAllAssessmentInstancesModal',
    title: 'Grade and Close all assessment instances',
    body: html`
      Are you sure you want to grade and close all assessment instances for
      <strong>${assessmentSetName} ${assessmentNumber}</strong>? This cannot be undone.
    `,
    footer: html`
      <input type="hidden" name="__action" value="close_all" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Grade and Close all</button>
    `,
  });
}
