import { z } from 'zod';

import { html } from '@prairielearn/html';

import { JobStatus } from '../../components/JobStatus.js';
import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { config } from '../../lib/config.js';
import { JobSequenceSchema, UserSchema } from '../../lib/db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

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
  resLocals: ResLocalsForPage<'assessment'>;
  uploadJobSequences: UploadJobSequence[];
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Uploads',
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'uploads',
    },
    options: {
      fullWidth: true,
    },
    content: html`
      ${resLocals.authz_data.has_course_instance_permission_edit
        ? html`
            ${UploadInstanceQuestionScoresModal({
              csrfToken: resLocals.__csrf_token,
              groupWork: resLocals.assessment.team_work,
            })}
            ${UploadAssessmentInstanceScoresModal({
              csrfToken: resLocals.__csrf_token,
              groupWork: resLocals.assessment.team_work,
            })}
            ${config.devMode
              ? UploadSubmissionsCsvModal({ csrfToken: resLocals.__csrf_token })
              : ''}
          `
        : ''}
      ${AssessmentUploadCard({
        groupWork: resLocals.assessment.team_work,
        assessmentSetName: resLocals.assessment_set.name,
        assessmentNumber: resLocals.assessment.number,
        authzHasPermissionEdit: resLocals.authz_data.has_course_instance_permission_edit,
        uploadJobSequences,
        urlPrefix: resLocals.urlPrefix,
      })}
    `,
  });
}

function AssessmentUploadCard({
  groupWork,
  assessmentSetName,
  assessmentNumber,
  authzHasPermissionEdit,
  uploadJobSequences,
  urlPrefix,
}: {
  groupWork: boolean;
  assessmentSetName: string;
  assessmentNumber: string;
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
                <tbody>
                  <tr>
                    <td style="width: 1%">
                      <button
                        type="button"
                        class="btn btn-primary text-nowrap"
                        data-bs-toggle="modal"
                        data-bs-target="#upload-instance-question-scores-form"
                      >
                        <i class="fas fa-upload"></i> Upload new question scores
                      </button>
                    </td>
                    <td>
                      <p>
                        Upload a CSV file to set per-question scores for individual students.
                        <a data-bs-toggle="collapse" href="#uploadInstanceQuestionScoresHelp">
                          Show details...
                        </a>
                      </p>
                      <div class="collapse" id="uploadInstanceQuestionScoresHelp">
                        ${CsvHelpInstanceQuestionScores({ groupWork })}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="width: 1%">
                      <button
                        type="button"
                        class="btn btn-primary text-nowrap"
                        data-bs-toggle="modal"
                        data-bs-target="#upload-assessment-instance-scores-form"
                      >
                        <i class="fas fa-upload"></i> Upload new total scores
                      </button>
                    </td>
                    <td>
                      <p>
                        Upload a CSV file to set the total assessment score for individual students.
                        <a data-bs-toggle="collapse" href="#uploadAssessmentScoresHelp">
                          Show details...
                        </a>
                      </p>
                      <div class="collapse" id="uploadAssessmentScoresHelp">
                        ${CsvHelpAssessmentInstanceScores({ groupWork })}
                      </div>
                    </td>
                  </tr>
                  ${config.devMode
                    ? html`
                        <tr>
                          <td style="width: 1%">
                            <button
                              type="button"
                              class="btn btn-primary text-nowrap"
                              data-bs-toggle="modal"
                              data-bs-target="#upload-submissions-csv-form"
                            >
                              <i class="fas fa-upload"></i> Upload submissions
                            </button>
                          </td>
                          <td>
                            <p>
                              Upload a CSV file to recreate users, assessment instances, questions,
                              variants, and submissions. Useful for local testing with real data.
                              <strong>Only available in development mode.</strong>
                            </p>
                          </td>
                        </tr>
                      `
                    : ''}
                </tbody>
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
            ${uploadJobSequences.length > 0
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

function CsvHelpInstanceQuestionScores({ groupWork }: { groupWork: boolean }) {
  return html`
    <p>
      Upload a CSV file in the format of the
      <code><i>&lt;assessment&gt;</i>_submissions_for_manual_grading.csv</code>
      file from the Downloads page. Alternatively, the CSV file can be in the format:
    </p>
    <pre class="ms-4">
${groupWork ? 'group_name' : 'uid'},instance,qid,score_perc,feedback
${groupWork ? 'group1' : 'student1@example.com'},1,addTwoNumbers,34.5,The second step was wrong
${groupWork ? 'group2' : 'student2@example.com'},1,addTwoNumbers,78.92,
${groupWork ? 'group2' : 'student2@example.com'},1,matrixMultiply,100,Great job!</pre
    >
    <p>
      Additional information, including instructions on how to update points instead of percentage
      or to update the auto/manual portions of the score, can be found in the
      <a
        href="https://docs.prairielearn.com/manualGrading/#manual-grading-using-file-uploads"
        target="_blank"
        rel="noopener noreferrer"
        >Manual Grading documentation</a
      >.
    </p>
  `;
}

function CsvHelpAssessmentInstanceScores({ groupWork }: { groupWork: boolean }) {
  return html`
    <p>Upload a CSV file like this:</p>
    <pre class="ms-4">
${groupWork ? 'group_name' : 'uid'},instance,score_perc
${groupWork ? 'group1' : 'student1@example.com'},1,63.5
${groupWork ? 'group2' : 'student2@example.com'},1,100</pre
    >
    <p>
      The example above will change the total assessment percentage scores for
      ${groupWork ? html`group <code>group1</code>` : html`<code>student1@example.com</code>`} to
      63.5% and for
      ${groupWork ? html`group <code>group2</code>` : html`<code>student2@example.com</code>`} to
      100%. The <code>instance</code> column indicates which assessment instance to modify, and
      should be <code>1</code> if there is only a single instance per
      ${groupWork ? 'group' : 'student'}.
    </p>
    <p>
      Alternatively, the total assessment points can be changed with a CSV containing a
      <code>points</code> column, like:
    </p>
    <pre class="ms-4">
${groupWork ? 'group_name' : 'uid'},instance,points
${groupWork ? 'group1' : 'student1@example.com'},1,120
${groupWork ? 'group2' : 'student2@example.com'},1,130.27</pre
    >
  `;
}

function UploadInstanceQuestionScoresModal({
  csrfToken,
  groupWork,
}: {
  csrfToken: string;
  groupWork: boolean;
}) {
  return Modal({
    id: 'upload-instance-question-scores-form',
    title: 'Upload new question scores',
    formEncType: 'multipart/form-data',
    body: html`
      ${CsvHelpInstanceQuestionScores({ groupWork })}
      <div class="mb-3">
        <label class="form-label" for="uploadInstanceQuestionScoresFileInput">
          Choose CSV file
        </label>
        <input
          type="file"
          name="file"
          class="form-control"
          id="uploadInstanceQuestionScoresFileInput"
        />
      </div>
    `,
    footer: html`
      <input type="hidden" name="__action" value="upload_instance_question_scores" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Upload</button>
    `,
  });
}

function UploadAssessmentInstanceScoresModal({
  csrfToken,
  groupWork,
}: {
  csrfToken: string;
  groupWork: boolean;
}) {
  return Modal({
    id: 'upload-assessment-instance-scores-form',
    title: 'Upload new total scores',
    formEncType: 'multipart/form-data',
    body: html`
      ${CsvHelpAssessmentInstanceScores({ groupWork })}
      <div class="mb-3">
        <label class="form-label" for="uploadAssessmentInstanceScoresFileInput">
          Choose CSV file
        </label>
        <input
          type="file"
          name="file"
          class="form-control"
          id="uploadAssessmentInstanceScoresFileInput"
        />
      </div>
    `,
    footer: html`
      <input type="hidden" name="__action" value="upload_assessment_instance_scores" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Upload</button>
    `,
  });
}

function UploadSubmissionsCsvModal({ csrfToken }: { csrfToken: string }) {
  return Modal({
    id: 'upload-submissions-csv-form',
    title: 'Upload Submissions CSV',
    formEncType: 'multipart/form-data',
    body: html`
      <p>
        Upload a CSV file to recreate users, assessment instances, questions, variants, and
        submissions.
      </p>
      <p>
        You should upload one of the submissions CSV files (<code>*_all_submissions.csv</code>,
        <code>*_final_submissions.csv</code>, or <code>*_best_submissions.csv</code>) from the
        Downloads page.
      </p>
      <p>
        The download/upload process is lossy. Some information, such as <code>format_errors</code>,
        <code>raw_submitted_answers</code>, whether or not a submission was considered gradable, and
        scores (including manual grading and rubrics) will not be preserved.
      </p>
      <p>
        If the assessment has questions that use <b>manual rubric grading</b>, upload their rubrics
        before uploading the CSV. The rubrics must be identical to those used when the submissions
        were downloaded.
      </p>
      <div class="alert alert-danger">
        This will delete all existing assessment instances and submissions for this assessment and
        replace them with the submissions from the CSV file. This action cannot be undone.
      </div>
      <div class="mb-3">
        <label class="form-label" for="uploadSubmissionsCsvFileInput">Choose CSV file</label>
        <input
          type="file"
          name="file"
          class="form-control"
          id="uploadSubmissionsCsvFileInput"
          accept=".csv"
        />
      </div>
    `,
    footer: html`
      <input type="hidden" name="__action" value="upload_submissions" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Upload</button>
    `,
  });
}
