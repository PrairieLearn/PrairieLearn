import { z } from 'zod';

import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { JobStatus } from '../../components/JobStatus.html.js';
import { Modal } from '../../components/Modal.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { JobSequenceSchema, UserSchema } from '../../lib/db-types.js';

export const UploadJobSequenceSchema = z.object({
  job_sequence: JobSequenceSchema,
  start_date_formatted: z.string(),
  user_uid: UserSchema.shape.uid,
});
type UploadJobSequence = z.infer<typeof UploadJobSequenceSchema>;

export function InstructorAssessmentUploads({
  resLocals,
  uploadJobSequences,
}: {
  resLocals: Record<string, any>;
  uploadJobSequences: UploadJobSequence[];
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container-fluid">
          ${AssessmentSyncErrorsAndWarnings({
            authz_data: resLocals.authz_data,
            assessment: resLocals.assessment,
            courseInstance: resLocals.course_instance,
            course: resLocals.course,
            urlPrefix: resLocals.urlPrefix,
          })}
          ${resLocals.authz_data.has_course_instance_permission_edit
            ? html`
                ${UploadInstanceQuestionScoresModal({ csrfToken: resLocals.__csrf_token })}
                ${UploadAssessmentInstanceScoresModal({ csrfToken: resLocals.__csrf_token })}
              `
            : ''}
          ${AssessmentUploadCard({
            assessmentSetName: resLocals.assessment_set.name,
            assessmentNumber: resLocals.assessment.number,
            authzHasPermissionEdit: resLocals.authz_data.has_course_instance_permission_edit,
            uploadJobSequences,
            urlPrefix: resLocals.urlPrefix,
          })}
        </main>
      </body>
    </html>
  `.toString();
}

function AssessmentUploadCard({
  assessmentSetName,
  assessmentNumber,
  authzHasPermissionEdit,
  uploadJobSequences,
  urlPrefix,
}: {
  assessmentSetName: string;
  assessmentNumber: number;
  authzHasPermissionEdit: boolean;
  uploadJobSequences: UploadJobSequence[];
  urlPrefix: string;
}) {
  return html`
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">
        <h1>${assessmentSetName} ${assessmentNumber}: Uploads</h1>
      </div>

      ${authzHasPermissionEdit
        ? html`
            <div class="table-responsive pb-0">
              <table class="table" aria-label="Score uploads">
                <tr>
                  <td style="width: 1%">
                    <button
                      type="button"
                      class="btn btn-primary text-nowrap"
                      data-toggle="modal"
                      data-target="#upload-instance-question-scores-form"
                    >
                      <i class="fas fa-upload"></i> Upload new question scores
                    </button>
                  </td>
                  <td>
                    <p>
                      Upload a CSV file to set per-question scores for individual students.
                      <a data-toggle="collapse" href="#uploadInstanceQuestionScoresHelp">
                        Show details...
                      </a>
                    </p>
                    <div class="collapse" id="uploadInstanceQuestionScoresHelp">
                      ${CsvHelpInstanceQuestionScores()}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="width: 1%">
                    <button
                      type="button"
                      class="btn btn-primary text-nowrap"
                      data-toggle="modal"
                      data-target="#upload-assessment-instance-scores-form"
                    >
                      <i class="fas fa-upload"></i> Upload new total scores
                    </button>
                  </td>
                  <td>
                    <p>
                      Upload a CSV file to set the total assessment score for individual students.
                      <a data-toggle="collapse" href="#uploadAssessmentScoresHelp"
                        >Show details...</a
                      >
                    </p>
                    <div class="collapse" id="uploadAssessmentScoresHelp">
                      ${CsvHelpAssessmentInstanceScores()}
                    </div>
                  </td>
                </tr>
              </table>
            </div>
          `
        : ''}

      <div class="table-responsive">
        <table class="table table-sm table-hover" aria-label="Score upload job history">
          <thead>
            <tr>
              <th>Number</th>
              <th>Date</th>
              <th>Description</th>
              <th>User</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${uploadJobSequences && uploadJobSequences.length > 0
              ? uploadJobSequences.map((job_sequence) => {
                  return html`
                    <tr>
                      <td>${job_sequence.job_sequence.number}</td>
                      <td>${job_sequence.start_date_formatted}</td>
                      <td>${job_sequence.job_sequence.description}</td>
                      <td>${job_sequence.user_uid}</td>
                      <td>${JobStatus({ status: job_sequence.job_sequence.status })}</td>
                      <td>
                        <a
                          href="${urlPrefix}/jobSequence/${job_sequence.job_sequence.id}"
                          class="btn btn-xs btn-info"
                          >Details</a
                        >
                      </td>
                    </tr>
                  `;
                })
              : html`
                  <tr>
                    <td colspan="6">No previous uploads.</td>
                  </tr>
                `}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function CsvHelpInstanceQuestionScores() {
  return html`
    <p>
      Upload a CSV file in the format of the
      <code><i>&lt;assessment&gt;</i>_submissions_for_manual_grading.csv</code>
      file from the Downloads page. See the
      <a href="https://prairielearn.readthedocs.io/en/latest/manualGrading/"
        >Manual Grading documentation</a
      >.
    </p>
    <p>Alternatively, the CSV file can be in the format:</p>
    <pre class="ml-4">
uid,instance,qid,score_perc,feedback
student1@example.com,1,addTwoNumbers,34.5,The second step was wrong
student2@example.com,1,addTwoNumbers,78.92,
student2@example.com,1,matrixMultiply,100,Great job!</pre
    >
    <p>
      The <code>instance</code> column indicates which assessment instance to modify. The total
      scores for the assessments will be automatically recalculated. The feedback will be attached
      to the most recent student submission. To change the per-question points, replace the
      <code>score_perc</code> column above with a <code>points</code> column.
    </p>
    <p>
      By default the updates above change the manual portion of the grades for the instance
      question, in such a way that the sum of the new manual portion with the existing autograding
      portion matches the total listed in the <code>points</code> or <code>score_perc</code> columns
      above. It is, however, possible to replace these columns with <code>manual_points</code> and
      <code>auto_points</code> (or <code>manual_score_perc</code> and <code>auto_score_perc</code>)
      for more fine-tuned change of grade components.
    </p>
  `;
}

function CsvHelpAssessmentInstanceScores() {
  return html`
    <p>Upload a CSV file like this:</p>
    <pre class="ml-4">
uid,instance,score_perc
student1@example.com,1,63.5
student2@example.com,1,100</pre
    >
    <p>
      The example above will change the total assessment percentage scores for
      <code>student1@example.com</code> to 63.5% and for <code>student2@example.com</code> to 100%.
      The <code>instance</code> column indicates which assessment instance to modify, and should be
      <code>1</code> if there is only a single instance per student.
    </p>
    <p>
      Alternatively, the total assessment points can be changed with a CSV containing a
      <code>points</code> column, like:
    </p>
    <pre class="ml-4">
uid,instance,points
student1@example.com,1,120
student2@example.com,1,130.27</pre
    >
    <p>For assessments using group work, use the <code>group_name</code> column instead:</p>
    <pre class="ml-4">
group_name,instance,score_perc
myhappygroup,1,95
greatgroup,1,85</pre
    >
  `;
}

function UploadInstanceQuestionScoresModal({ csrfToken }: { csrfToken: string }) {
  return Modal({
    id: 'upload-instance-question-scores-form',
    title: 'Upload new question scores',
    formEncType: 'multipart/form-data',
    body: html`
      ${CsvHelpInstanceQuestionScores()}
      <div class="form-group">
        <div class="custom-file">
          <input
            type="file"
            name="file"
            class="custom-file-input"
            id="uploadInstanceQuestionScoresFileInput"
          />
          <label class="custom-file-label" for="uploadInstanceQuestionScoresFileInput">
            Choose CSV file
          </label>
        </div>
      </div>
    `,
    footer: html`
      <input type="hidden" name="__action" value="upload_instance_question_scores" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Upload</button>
    `,
  });
}

function UploadAssessmentInstanceScoresModal({ csrfToken }: { csrfToken: string }) {
  return Modal({
    id: 'upload-assessment-instance-scores-form',
    title: 'Upload new total scores',
    formEncType: 'multipart/form-data',
    body: html`
      ${CsvHelpAssessmentInstanceScores()}
      <div class="form-group">
        <div class="custom-file">
          <input
            type="file"
            name="file"
            class="custom-file-input"
            id="uploadAssessmentInstanceScoresFileInput"
          />
          <label class="custom-file-label" for="uploadAssessmentInstanceScoresFileInput"
            >Choose CSV file</label
          >
        </div>
      </div>
    `,
    footer: html`
      <input type="hidden" name="__action" value="upload_assessment_instance_scores" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Upload</button>
    `,
  });
}
