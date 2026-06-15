import { useState } from 'react';

import type { Student } from '../../lib/canvas-matching.js';

import { CanvasDownloadModal } from './components/CanvasDownloadModal.js';

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
  canvasScoresCsvFilename: string;
  canvasPointsCsvFilename: string;
  groupsCsvFilename?: string;
  scoresGroupCsvFilename?: string;
  scoresGroupAllCsvFilename?: string;
  pointsGroupCsvFilename?: string;
  pointsGroupAllCsvFilename?: string;
}

function DownloadRow({
  downloadUrl,
  filename,
  description,
}: {
  downloadUrl: string;
  filename: string;
  description: React.ReactNode;
}) {
  return (
    <tr>
      <td>
        <a href={downloadUrl}>{filename}</a>
      </td>
      <td>{description}</td>
    </tr>
  );
}

function CanvasDownloadRow({
  filename,
  description,
  onClick,
}: {
  filename: string;
  description: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <tr>
      <td>
        <button type="button" className="btn btn-link p-0 text-start" onClick={onClick}>
          {filename}
        </button>
      </td>
      <td>{description}</td>
    </tr>
  );
}

export function InstructorAssessmentDownloads({
  urlPrefix,
  assessmentId,
  assessmentSetName,
  assessmentNumber,
  isMultipleInstance,
  isTeamWork,
  filenames,
  students,
}: {
  urlPrefix: string;
  assessmentId: string;
  assessmentSetName: string;
  assessmentNumber: string;
  isMultipleInstance: boolean;
  isTeamWork: boolean;
  filenames: Filenames;
  students: Student[];
}) {
  const identity = isTeamWork ? 'group' : 'student';
  const downloadsBase = `${urlPrefix}/assessment/${assessmentId}/downloads/`;

  const [canvasModal, setCanvasModal] = useState<{
    filename: string;
    downloadUrl: string;
  } | null>(null);

  return (
    <>
      <div className="card mb-4">
        <div className="card-header bg-primary text-white">
          <h1>
            {assessmentSetName} {assessmentNumber}: Downloads
          </h1>
        </div>
        {isMultipleInstance && (
          <div className="card-body">
            <p>
              <small>
                This is a <strong>multiple instance</strong> assessment, so each {identity} may have
                more than one assessment instance. The CSV files are available in plain and{' '}
                <strong>
                  <code>_all</code>
                </strong>{' '}
                versions. The plain versions contain one record per {identity}, which is taken to be
                the assessment instance for that {identity} with the maximum percentage score. The{' '}
                <strong>
                  <code>_all</code>
                </strong>{' '}
                CSV files contain one record per assessment instance, possibly including more than
                one record per {identity}.
              </small>
            </p>
          </div>
        )}

        <div className="table-responsive">
          <table className="table table-sm table-hover" aria-label="File downloads">
            <thead>
              <tr>
                <th>Data file</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <DownloadRow
                downloadUrl={`${downloadsBase}${filenames.scoresCsvFilename}`}
                filename={filenames.scoresCsvFilename}
                description="Total percentage score for each student. Scores range from 0 to 100 (or higher if bonus credit was given)."
              />
              {isMultipleInstance && (
                <DownloadRow
                  downloadUrl={`${downloadsBase}${filenames.scoresAllCsvFilename}`}
                  filename={filenames.scoresAllCsvFilename}
                  description="Total percentage score for each assessment instance. Scores range from 0 to 100 (or higher if bonus credit was given)."
                />
              )}
              <DownloadRow
                downloadUrl={`${downloadsBase}${filenames.pointsCsvFilename}`}
                filename={filenames.pointsCsvFilename}
                description="Total points for each student. Points range from 0 to the maximum for this assessment."
              />
              {isMultipleInstance && (
                <DownloadRow
                  downloadUrl={`${downloadsBase}${filenames.pointsAllCsvFilename}`}
                  filename={filenames.pointsAllCsvFilename}
                  description="Total points for each assessment instance. Points range from 0 to the maximum for this assessment."
                />
              )}
              {isTeamWork && (
                <>
                  <DownloadRow
                    downloadUrl={`${downloadsBase}${filenames.groupsCsvFilename}`}
                    filename={filenames.groupsCsvFilename!}
                    description="Information about current groups, including group names and group members"
                  />
                  <DownloadRow
                    downloadUrl={`${downloadsBase}${filenames.scoresGroupCsvFilename}`}
                    filename={filenames.scoresGroupCsvFilename!}
                    description="Total percentage score for each group. Scores range from 0 to 100 (or higher if bonus credit was given)."
                  />
                  {isMultipleInstance && (
                    <DownloadRow
                      downloadUrl={`${downloadsBase}${filenames.scoresGroupAllCsvFilename}`}
                      filename={filenames.scoresGroupAllCsvFilename!}
                      description="Total percentage score for each assessment instance. Scores range from 0 to 100 (or higher if bonus credit was given)."
                    />
                  )}
                  <DownloadRow
                    downloadUrl={`${downloadsBase}${filenames.pointsGroupCsvFilename}`}
                    filename={filenames.pointsGroupCsvFilename!}
                    description="Total points for each group. Points range from 0 to the maximum for this assessment."
                  />
                  {isMultipleInstance && (
                    <DownloadRow
                      downloadUrl={`${downloadsBase}${filenames.pointsGroupAllCsvFilename}`}
                      filename={filenames.pointsGroupAllCsvFilename!}
                      description="Total points for each assessment instance. Points range from 0 to the maximum for this assessment."
                    />
                  )}
                </>
              )}
              <DownloadRow
                downloadUrl={`${downloadsBase}${filenames.scoresByUsernameCsvFilename}`}
                filename={filenames.scoresByUsernameCsvFilename}
                description="Total percentage score for each student, formatted by username for upload into LMS gradebooks. Scores range from 0 to 100 (or higher if bonus credit was given)."
              />
              {isMultipleInstance && (
                <DownloadRow
                  downloadUrl={`${downloadsBase}${filenames.scoresByUsernameAllCsvFilename}`}
                  filename={filenames.scoresByUsernameAllCsvFilename}
                  description="Total percentage score for each assessment instance, formatted by username for upload into LMS gradebooks. Scores range from 0 to 100 (or higher if bonus credit was given)."
                />
              )}
              <DownloadRow
                downloadUrl={`${downloadsBase}${filenames.pointsByUsernameCsvFilename}`}
                filename={filenames.pointsByUsernameCsvFilename}
                description="Total points for each student, formatted by username for upload into LMS gradebooks. Points range from 0 to the maximum for this assessment."
              />
              {isMultipleInstance && (
                <DownloadRow
                  downloadUrl={`${downloadsBase}${filenames.pointsByUsernameAllCsvFilename}`}
                  filename={filenames.pointsByUsernameAllCsvFilename}
                  description="Total points for each assessment instance, formatted by username for upload into LMS gradebooks. Points range from 0 to the maximum for this assessment."
                />
              )}
              <CanvasDownloadRow
                filename={filenames.canvasScoresCsvFilename}
                description="Percentage scores for each student, formatted for import into Canvas. Scores range from 0 to 100 (or higher if bonus credit was given)."
                onClick={() =>
                  setCanvasModal({
                    filename: filenames.canvasScoresCsvFilename,
                    downloadUrl: `${downloadsBase}${filenames.canvasScoresCsvFilename}`,
                  })
                }
              />
              <CanvasDownloadRow
                filename={filenames.canvasPointsCsvFilename}
                description="Total points for each student, formatted for import into Canvas. Points range from 0 to the maximum for this assessment (or higher if bonus credit was given)."
                onClick={() =>
                  setCanvasModal({
                    filename: filenames.canvasPointsCsvFilename,
                    downloadUrl: `${downloadsBase}${filenames.canvasPointsCsvFilename}`,
                  })
                }
              />
              <DownloadRow
                downloadUrl={`${downloadsBase}${filenames.instancesCsvFilename}`}
                filename={filenames.instancesCsvFilename}
                description={`Detailed data for each ${identity}. Includes points, maximum points, percentage score, duration, and other information.`}
              />
              {isMultipleInstance && (
                <DownloadRow
                  downloadUrl={`${downloadsBase}${filenames.instancesAllCsvFilename}`}
                  filename={filenames.instancesAllCsvFilename}
                  description="Detailed data for each assessment instance. Includes points, maximum points, percentage score, duration, and other information."
                />
              )}
              <DownloadRow
                downloadUrl={`${downloadsBase}${filenames.instanceQuestionsCsvFilename}`}
                filename={filenames.instanceQuestionsCsvFilename}
                description={`All questions for all ${identity}s for all assessment instances. Shows the score for each question as well as the best submission score and the number of attempts at the question.`}
              />
              <DownloadRow
                downloadUrl={`${downloadsBase}${filenames.submissionsForManualGradingCsvFilename}`}
                filename={filenames.submissionsForManualGradingCsvFilename}
                description={
                  <>
                    Submitted answers for all {identity}s and all questions, formatted for offline
                    manual grading and re-upload (see the "Upload" tab). For each {identity} and
                    each question, only the most recent submission from the most recent assessment
                    instance is included. Files are stripped from the submitted answer in the CSV
                    and are available as <code>{filenames.filesForManualGradingZipFilename}</code>.
                  </>
                }
              />
              <DownloadRow
                downloadUrl={`${downloadsBase}${filenames.filesForManualGradingZipFilename}`}
                filename={filenames.filesForManualGradingZipFilename}
                description={
                  <>
                    Submitted files for all {identity}s and all questions, named for easy use with
                    offline manual grading. These files match the submissions in{' '}
                    <code>{filenames.submissionsForManualGradingCsvFilename}</code>. For each{' '}
                    {identity} and each question, only the most recent submitted file from the most
                    recent assessment instance is included. The filename format is{' '}
                    <code>
                      {isTeamWork ? (
                        <>
                          &lt;group_name&gt;_&lt;qid&gt;_&lt;submission_id&gt;_&lt;uploaded_filename&gt;
                        </>
                      ) : (
                        <>&lt;uid&gt;_&lt;qid&gt;_&lt;submission_id&gt;_&lt;uploaded_filename&gt;</>
                      )}
                    </code>
                  </>
                }
              />
              <DownloadRow
                downloadUrl={`${downloadsBase}${filenames.allSubmissionsCsvFilename}`}
                filename={filenames.allSubmissionsCsvFilename}
                description={`All submitted answers for all ${identity}s for all assessment instances. Not all submitted answers will have been used to compute the final score, as some may have been superseded by subsequent attempts.`}
              />
              <DownloadRow
                downloadUrl={`${downloadsBase}${filenames.finalSubmissionsCsvFilename}`}
                filename={filenames.finalSubmissionsCsvFilename}
                description={`Final submitted answers for each question for all ${identity}s for all assessment instances.`}
              />
              <DownloadRow
                downloadUrl={`${downloadsBase}${filenames.bestSubmissionsCsvFilename}`}
                filename={filenames.bestSubmissionsCsvFilename}
                description={`Best submitted answers for each question for all ${identity}s for all assessment instances. If a ${identity} has no graded submissions for a question, then the last submission (if any) is used instead.`}
              />
              <DownloadRow
                downloadUrl={`${downloadsBase}${filenames.allFilesZipFilename}`}
                filename={filenames.allFilesZipFilename}
                description={
                  <>
                    All submitted files for all {identity}s for all assessment instances. Only data
                    from <code>File</code>-type questions will be included in the zip. Not all
                    submitted files will have been used to compute the final score, as some may have
                    been superseded by subsequent attempts. The filename format is{' '}
                    <code>
                      {isTeamWork ? (
                        <>
                          &lt;group_name&gt;_&lt;assessment_instance_number&gt;_&lt;qid&gt;_&lt;variant_number&gt;_&lt;submission_number&gt;_&lt;submission_id&gt;_&lt;uploaded_filename&gt;
                        </>
                      ) : (
                        <>
                          &lt;uid&gt;_&lt;assessment_instance_number&gt;_&lt;qid&gt;_&lt;variant_number&gt;_&lt;submission_number&gt;_&lt;submission_id&gt;_&lt;uploaded_filename&gt;
                        </>
                      )}
                    </code>
                  </>
                }
              />
              <DownloadRow
                downloadUrl={`${downloadsBase}${filenames.finalFilesZipFilename}`}
                filename={filenames.finalFilesZipFilename}
                description={
                  <>
                    Final submitted files for each question for all {identity}s for all assessment
                    instances. Only data from <code>File</code>-type questions will be included in
                    the zip.
                  </>
                }
              />
              <DownloadRow
                downloadUrl={`${downloadsBase}${filenames.bestFilesZipFilename}`}
                filename={filenames.bestFilesZipFilename}
                description={
                  <>
                    Best submitted files for each question for all {identity}s for all assessment
                    instances. Only data from <code>File</code>-type questions will be included in
                    the zip. If a {identity} has no graded submissions for a question then the last
                    submission (if any) is used instead.
                  </>
                }
              />
            </tbody>
          </table>
        </div>
      </div>

      {canvasModal && (
        <CanvasDownloadModal
          downloadUrl={canvasModal.downloadUrl}
          filename={canvasModal.filename}
          students={students}
          show
          onHide={() => setCanvasModal(null)}
        />
      )}
    </>
  );
}

InstructorAssessmentDownloads.displayName = 'InstructorAssessmentDownloads';
