import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

export interface Filenames {
  scoresCsvFilename: string;
  scoresAllCsvFilename: string;
  pointsCsvFilename: string;
  pointsAllCsvFilename: string;
  scoresByUsernameCsvFilename: string;
  scoresByUsernameAllCsvFilename: string;
  pointsByUsernameCsvFilename: string;
  pointsByUsernameAllCsvFilename: string;
  instancesCsvFilename: string;
  instancesAllCsvFilename: string;
  instanceQuestionsCsvFilename: string;
  submissionsForManualGradingCsvFilename: string;
  finalSubmissionsCsvFilename: string;
  bestSubmissionsCsvFilename: string;
  allSubmissionsCsvFilename: string;
  filesForManualGradingZipFilename: string;
  finalFilesZipFilename: string;
  bestFilesZipFilename: string;
  allFilesZipFilename: string;
  groupsCsvFilename?: string;
  scoresGroupCsvFilename?: string;
  scoresGroupAllCsvFilename?: string;
  pointsGroupCsvFilename?: string;
  pointsGroupAllCsvFilename?: string;
}

export function InstructorAssessmentDownloads({
  resLocals,
  filenames,
}: {
  resLocals: Record<string, any>;
  filenames: Filenames;
}) {
  const identity = resLocals.assessment.group_work ? 'group' : 'student';
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../pages/partials/head') %>", resLocals)}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar') %>", resLocals)}
        <main id="content" class="container-fluid">
          ${renderEjs(
            __filename,
            "<%- include('../partials/assessmentSyncErrorsAndWarnings'); %>",
            resLocals,
          )}

          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              ${resLocals.assessment_set.name} ${resLocals.assessment.number}: Downloads
            </div>
            ${resLocals.assessment.multiple_instance
              ? html`
                  <div class="card-body">
                    <p>
                      <small>
                        This is a <strong>multiple instance</strong> assessment, so each ${identity}
                        may have more than one assessment instance. The CSV files are available in
                        plain and <strong><code>_all</code></strong> versions. The plain versions
                        contain one record per ${identity}, which is taken to be the assessment
                        instance for that ${identity} with the maximum percentage score. The
                        <strong><code>_all</code></strong> CSV files contain one record per
                        assessment instance, possibly including more than one record per student.
                      </small>
                    </p>
                  </div>
                `
              : ''}

            <div class="table-responsive">
              <table class="table table-sm table-hover">
                <thead>
                  <tr>
                    <th>Data file</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <a
                        href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                          .id}/downloads/${filenames.scoresCsvFilename}"
                        >${filenames.scoresCsvFilename}</a
                      >
                    </td>
                    <td>
                      Total percentage score for each student. Scores range from 0 to 100 (or higher
                      if bonus credit was given).
                    </td>
                  </tr>
                  ${resLocals.assessment.multiple_instance
                    ? html`
                        <tr>
                          <td>
                            <a
                              href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                                .id}/downloads/i${filenames.scoresAllCsvFilename}"
                              >${filenames.scoresAllCsvFilename}</a
                            >
                          </td>
                          <td>
                            Total percentage score for each assessment instance. Scores range from 0
                            to 100 (or higher if bonus credit was given).
                          </td>
                        </tr>
                      `
                    : ''}
                  <tr>
                    <td>
                      <a
                        href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                          .id}/downloads/${filenames.pointsCsvFilename}"
                        >${filenames.pointsCsvFilename}</a
                      >
                    </td>
                    <td>
                      Total points for each student. Points range from 0 to the maximum for this
                      assessment.
                    </td>
                  </tr>
                  ${resLocals.assessment.multiple_instance
                    ? html`
                        <tr>
                          <td>
                            <a
                              href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                                .id}/downloads/${filenames.pointsAllCsvFilename}"
                              >${filenames.pointsAllCsvFilename}</a
                            >
                          </td>
                          <td>
                            Total points for each assessment instance. Points range from 0 to the
                            maximum for this assessment.
                          </td>
                        </tr>
                      `
                    : ''}
                  ${resLocals.assessment.group_work
                    ? html`
                        <tr>
                          <td>
                            <a
                              href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                                .id}/downloads/${filenames.groupsCsvFilename}"
                              >${filenames.groupsCsvFilename}</a
                            >
                          </td>
                          <td>
                            Information about current groups, including group names and group
                            members
                          </td>
                        </tr>
                        <tr>
                          <td>
                            <a
                              href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                                .id}/downloads/${filenames.scoresGroupCsvFilename}"
                              >${filenames.scoresGroupCsvFilename}</a
                            >
                          </td>
                          <td>
                            Total percentage score for each group. Scores range from 0 to 100 (or
                            higher if bonus credit was given).
                          </td>
                        </tr>
                        ${resLocals.assessment.multiple_instance
                          ? html`
                              <tr>
                                <td>
                                  <a
                                    href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                                      .id}/downloads/${filenames.scoresGroupAllCsvFilename}"
                                    >${filenames.scoresGroupAllCsvFilename}</a
                                  >
                                </td>
                                <td>
                                  Total percentage score for each assessment instance. Scores range
                                  from 0 to 100 (or higher if bonus credit was given).
                                </td>
                              </tr>
                            `
                          : ''}
                        <tr>
                          <td>
                            <a
                              href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                                .id}/downloads/${filenames.pointsGroupCsvFilename}"
                              >${filenames.pointsGroupCsvFilename}</a
                            >
                          </td>
                          <td>
                            Total points for each group. Points range from 0 to the maximum for this
                            assessment.
                          </td>
                        </tr>
                        ${resLocals.assessment.multiple_instance
                          ? html`
                              <tr>
                                <td>
                                  <a
                                    href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                                      .id}/downloads/${filenames.pointsGroupAllCsvFilename}"
                                    >${filenames.pointsGroupAllCsvFilename}</a
                                  >
                                </td>
                                <td>
                                  Total points for each assessment instance. Points range from 0 to
                                  the maximum for this assessment.
                                </td>
                              </tr>
                            `
                          : ''}
                      `
                    : ''}
                  <tr>
                    <td>
                      <a
                        href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                          .id}/downloads/${filenames.scoresByUsernameCsvFilename}"
                        >${filenames.scoresByUsernameCsvFilename}</a
                      >
                    </td>
                    <td>
                      Total percentage score for each student, formatted by username for upload into
                      LMS gradebooks. Scores range from 0 to 100 (or higher if bonus credit was
                      given).
                    </td>
                  </tr>
                  ${resLocals.assessment.multiple_instance
                    ? html`
                        <tr>
                          <td>
                            <a
                              href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                                .id}/downloads/${filenames.scoresByUsernameAllCsvFilename}"
                              >${filenames.scoresByUsernameAllCsvFilename}</a
                            >
                          </td>
                          <td>
                            Total percentage score for each assessment instance, formatted by
                            username for upload into LMS gradebooks. Scores range from 0 to 100 (or
                            higher if bonus credit was given).
                          </td>
                        </tr>
                      `
                    : ''}
                  <tr>
                    <td>
                      <a
                        href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                          .id}/downloads/${filenames.pointsByUsernameCsvFilename}"
                        >${filenames.pointsByUsernameCsvFilename}</a
                      >
                    </td>
                    <td>
                      Total points for each student, formatted by username for upload into LMS
                      gradebooks. Points range from 0 to the maximum for this assessment.
                    </td>
                  </tr>
                  ${resLocals.assessment.multiple_instance
                    ? html`
                        <tr>
                          <td>
                            <a
                              href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                                .id}/downloads/${filenames.pointsByUsernameAllCsvFilename}"
                              >${filenames.pointsByUsernameAllCsvFilename}</a
                            >
                          </td>
                          <td>
                            Total points for each assessment instance, formatted by username for
                            upload into LMS gradebooks. Points range from 0 to the maximum for this
                            assessment.
                          </td>
                        </tr>
                      `
                    : ''}
                  <tr>
                    <td>
                      <a
                        href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                          .id}/downloads/${filenames.instancesCsvFilename}"
                        >${filenames.instancesCsvFilename}</a
                      >
                    </td>
                    <td>
                      Detailed data for each ${identity}. Includes points, maximum points,
                      percentage score, duration, and other information.
                    </td>
                  </tr>
                  ${resLocals.assessment.multiple_instance
                    ? html`
                        <tr>
                          <td>
                            <a
                              href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                                .id}/downloads/${filenames.instancesAllCsvFilename}"
                              >${filenames.instancesAllCsvFilename}</a
                            >
                          </td>
                          <td>
                            Detailed data for each assessment instance. Includes points, maximum
                            points, percentage score, duration, and other information.
                          </td>
                        </tr>
                      `
                    : ''}
                  <tr>
                    <td>
                      <a
                        href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                          .id}/downloads/${filenames.instanceQuestionsCsvFilename}"
                        >${filenames.instanceQuestionsCsvFilename}</a
                      >
                    </td>
                    <td>
                      All questions for all ${identity}s for all assessment instances. Shows the
                      score for each question as well as the best submission score and the number of
                      attempts at the question.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <a
                        href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                          .id}/downloads/${filenames.submissionsForManualGradingCsvFilename}"
                        >${filenames.submissionsForManualGradingCsvFilename}</a
                      >
                    </td>
                    <td>
                      Submitted answers for all ${identity}s and all questions, formatted for
                      offline manual grading and re-upload (see the "Upload" tab). For each
                      ${identity} and each question, only the most recent submission from the most
                      recent assessment instance is included. Files are stripped from the submitted
                      answer in the CSV and are available as
                      <code>${filenames.filesForManualGradingZipFilename}</code>.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <a
                        href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                          .id}/downloads/${filenames.filesForManualGradingZipFilename}"
                        >${filenames.filesForManualGradingZipFilename}</a
                      >
                    </td>
                    <td>
                      Submitted files for all ${identity}s and all questions, named for easy use
                      with offline manual grading. These files match the submissions in
                      <code>${filenames.submissionsForManualGradingCsvFilename}</code>. For each
                      ${identity} and each question, only the most recent submitted file from the
                      most recent assessment instance is included. The filename format is
                      <code
                        >&lt;uid&gt;_&lt;qid&gt;_&lt;submission_id&gt;_&lt;uploaded_filename&gt;</code
                      >
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <a
                        href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                          .id}/downloads/${filenames.allSubmissionsCsvFilename}"
                        >${filenames.allSubmissionsCsvFilename}</a
                      >
                    </td>
                    <td>
                      All submitted answers for all ${identity}s for all assessment instances. Not
                      all submitted answers will have been used to compute the final score, as some
                      may have been superseded by subsequent attempts.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <a
                        href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                          .id}/downloads/${filenames.finalSubmissionsCsvFilename}"
                        >${filenames.finalSubmissionsCsvFilename}</a
                      >
                    </td>
                    <td>
                      Final submitted answers for each question for all ${identity}s for all
                      assessment instances.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <a
                        href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                          .id}/downloads/${filenames.bestSubmissionsCsvFilename}"
                        >${filenames.bestSubmissionsCsvFilename}</a
                      >
                    </td>
                    <td>
                      Best submitted answers for each question for all ${identity}s for all
                      assessment instances. If a ${identity} has no graded submissions for a
                      question, then the last submission (if any) is used instead.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <a
                        href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                          .id}/downloads/${filenames.allFilesZipFilename}"
                        >${filenames.allFilesZipFilename}</a
                      >
                    </td>
                    <td>
                      All submitted files for all ${identity}s for all assessment instances. Only
                      data from <code>File</code>-type questions will be included in the zip. Not
                      all submitted files will have been used to compute the final score, as some
                      may have been superseded by subsequent attempts. The filename format is
                      <code
                        >&lt;uid&gt;_&lt;assessment_instance_number&gt;_&lt;qid&gt;_&lt;variant_number&gt;_&lt;submission_number&gt;_&lt;submission_id&gt;_&lt;uploaded_filename&gt;</code
                      >
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <a
                        href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                          .id}/downloads/${filenames.finalFilesZipFilename}"
                        >${filenames.finalFilesZipFilename}</a
                      >
                    </td>
                    <td>
                      Final submitted files for each question for all ${identity}s for all
                      assessment instances. Only data from <code>File</code>-type questions will be
                      included in the zip.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <a
                        href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                          .id}/downloads/${filenames.bestFilesZipFilename}"
                        >${filenames.bestFilesZipFilename}</a
                      >
                    </td>
                    <td>
                      Best submitted files for each question for all ${identity}s for all assessment
                      instances. Only data from <code>File</code>-type questions will be included in
                      the zip. If a ${identity} has no graded submissions for a question then the
                      last submission (if any) is used instead.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
