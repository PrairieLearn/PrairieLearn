import { useMutation } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Button, Dropdown, Modal } from 'react-bootstrap';

import { type AppError, AppErrorAlert, getAppError } from '../../../lib/client/errors.js';
import {
  getAssessmentDownloadsUrl,
  getCourseInstanceJobSequenceUrl,
} from '../../../lib/client/url.js';
import type { AssessmentUploadsError } from '../../../trpc/assessment/assessment-uploads.js';
import { useTRPC } from '../../../trpc/assessment/context.js';

type OpenUploadModal = 'instanceQuestionScores' | 'assessmentInstanceScores' | 'submissions' | null;

export function UploadDropdown({
  courseInstanceId,
  assessmentId,
  groupWork,
  isDevMode,
}: {
  courseInstanceId: string;
  assessmentId: string;
  groupWork: boolean;
  isDevMode: boolean;
}) {
  const trpc = useTRPC();
  const [openModal, setOpenModal] = useState<OpenUploadModal>(null);
  const downloadsUrl = getAssessmentDownloadsUrl({ courseInstanceId, assessmentId });

  const redirectToJob = ({ jobSequenceId }: { jobSequenceId: string }) => {
    window.location.assign(getCourseInstanceJobSequenceUrl(courseInstanceId, jobSequenceId));
  };

  const instanceQuestionScores = useMutation({
    ...trpc.assessmentUploads.instanceQuestionScores.mutationOptions(),
    onSuccess: redirectToJob,
  });
  const assessmentInstanceScores = useMutation({
    ...trpc.assessmentUploads.assessmentInstanceScores.mutationOptions(),
    onSuccess: redirectToJob,
  });
  const submissions = useMutation({
    ...trpc.assessmentUploads.submissions.mutationOptions(),
    onSuccess: redirectToJob,
  });

  const uploadFile = (mutation: { mutate: (input: FormData) => void }, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    mutation.mutate(formData);
  };

  return (
    <>
      <Dropdown>
        <Dropdown.Toggle size="sm" variant="light" id="upload-actions">
          <i className="bi bi-upload me-2" aria-hidden="true" />
          Upload
        </Dropdown.Toggle>
        <Dropdown.Menu>
          <Dropdown.Item onClick={() => setOpenModal('instanceQuestionScores')}>
            Upload question scores
          </Dropdown.Item>
          <Dropdown.Item onClick={() => setOpenModal('assessmentInstanceScores')}>
            Upload total scores
          </Dropdown.Item>
          {isDevMode && (
            <Dropdown.Item onClick={() => setOpenModal('submissions')}>
              Upload submissions
            </Dropdown.Item>
          )}
        </Dropdown.Menu>
      </Dropdown>

      <UploadCsvModal
        show={openModal === 'instanceQuestionScores'}
        title="Upload new question scores"
        description="Set per-question scores and feedback for individual students."
        inputId="upload-instance-question-scores-file"
        helpTitle="Accepted formats"
        help={<InstanceQuestionScoresHelp groupWork={groupWork} downloadsUrl={downloadsUrl} />}
        isPending={instanceQuestionScores.isPending}
        appError={getAppError<AssessmentUploadsError['instanceQuestionScores']>(
          instanceQuestionScores.error,
        )}
        onHide={() => setOpenModal(null)}
        onUpload={(file) => uploadFile(instanceQuestionScores, file)}
        onReset={() => instanceQuestionScores.reset()}
      />

      <UploadCsvModal
        show={openModal === 'assessmentInstanceScores'}
        title="Upload new total scores"
        description="Set the total assessment score for individual students."
        inputId="upload-assessment-instance-scores-file"
        helpTitle="Accepted formats"
        help={<AssessmentInstanceScoresHelp groupWork={groupWork} />}
        isPending={assessmentInstanceScores.isPending}
        appError={getAppError<AssessmentUploadsError['assessmentInstanceScores']>(
          assessmentInstanceScores.error,
        )}
        onHide={() => setOpenModal(null)}
        onUpload={(file) => uploadFile(assessmentInstanceScores, file)}
        onReset={() => assessmentInstanceScores.reset()}
      />

      {isDevMode && (
        <UploadCsvModal
          show={openModal === 'submissions'}
          title="Upload submissions CSV"
          description="Recreate users, assessment instances, questions, variants, and submissions from a downloaded submissions CSV. Available in development mode only."
          inputId="upload-submissions-file"
          warning={
            <div className="alert alert-danger">
              This will <strong>delete all existing assessment instances and submissions</strong>{' '}
              for this assessment and replace them with the contents of the CSV file. This action
              cannot be undone.
            </div>
          }
          helpTitle="Before you upload"
          help={<SubmissionsHelp downloadsUrl={downloadsUrl} />}
          isPending={submissions.isPending}
          appError={getAppError<AssessmentUploadsError['submissions']>(submissions.error)}
          onHide={() => setOpenModal(null)}
          onUpload={(file) => uploadFile(submissions, file)}
          onReset={() => submissions.reset()}
        />
      )}
    </>
  );
}

function UploadCsvModal({
  show,
  onHide,
  title,
  description,
  inputId,
  warning,
  helpTitle,
  help,
  isPending,
  appError,
  onUpload,
  onReset,
}: {
  show: boolean;
  onHide: () => void;
  title: string;
  description: ReactNode;
  inputId: string;
  warning?: ReactNode;
  helpTitle: string;
  help: ReactNode;
  isPending: boolean;
  appError: AppError<never> | null;
  onUpload: (file: File) => void;
  onReset: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);

  return (
    <Modal
      size="lg"
      show={show}
      onHide={onHide}
      onExited={() => {
        setFile(null);
        onReset();
      }}
    >
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>{description}</p>
        {warning}
        <div className="mb-4">
          <label className="form-label fw-semibold" htmlFor={inputId}>
            Choose CSV file
          </label>
          <input
            type="file"
            accept=".csv"
            className="form-control"
            id={inputId}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <section className="border-top pt-3">
          <h2 className="h6 fw-semibold">{helpTitle}</h2>
          {help}
        </section>
        <AppErrorAlert
          error={appError}
          render={{ UNKNOWN: ({ message }) => message }}
          onDismiss={onReset}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!file || isPending}
          onClick={() => file && onUpload(file)}
        >
          {isPending ? 'Uploading...' : 'Upload'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function InstanceQuestionScoresHelp({
  groupWork,
  downloadsUrl,
}: {
  groupWork: boolean;
  downloadsUrl: string;
}) {
  const idColumn = groupWork ? 'group_name' : 'uid';
  const id1 = groupWork ? 'group1' : 'student1@example.com';
  const id2 = groupWork ? 'group2' : 'student2@example.com';
  return (
    <>
      <p className="mb-2">Upload a CSV file in either of these formats:</p>
      <ul>
        <li>
          The{' '}
          <code>
            <i>&lt;assessment&gt;</i>_submissions_for_manual_grading.csv
          </code>{' '}
          file from the <a href={downloadsUrl}>Downloads tab</a>.
        </li>
        <li>
          A CSV with <code>{idColumn}</code>, <code>instance</code>, <code>qid</code>,{' '}
          <code>score_perc</code>, and <code>feedback</code> columns:
        </li>
      </ul>
      <pre className="ms-4">
        {`${idColumn},instance,qid,score_perc,feedback
${id1},1,addTwoNumbers,34.5,The second step was wrong
${id2},1,addTwoNumbers,78.92,
${id2},1,matrixMultiply,100,Great job!`}
      </pre>
      <p className="mb-0">
        To update points instead of a percentage, or to update only the auto or manual portion of a
        score, see the{' '}
        <a
          href="https://docs.prairielearn.com/manualGrading/#manual-grading-using-file-uploads"
          target="_blank"
          rel="noopener noreferrer"
        >
          Manual Grading documentation
        </a>
        .
      </p>
    </>
  );
}

function AssessmentInstanceScoresHelp({ groupWork }: { groupWork: boolean }) {
  const idColumn = groupWork ? 'group_name' : 'uid';
  const id1 = groupWork ? 'group1' : 'student1@example.com';
  const id2 = groupWork ? 'group2' : 'student2@example.com';
  const subject = groupWork ? 'group' : 'student';
  return (
    <>
      <p className="mb-2">
        To set percentage scores, upload a CSV file with a <code>score_perc</code> column:
      </p>
      <pre className="ms-4">
        {`${idColumn},instance,score_perc
${id1},1,63.5
${id2},1,100`}
      </pre>
      <p>
        This sets the total assessment percentage score for{' '}
        {groupWork ? (
          <>
            group <code>group1</code>
          </>
        ) : (
          <code>student1@example.com</code>
        )}{' '}
        to 63.5% and for{' '}
        {groupWork ? (
          <>
            group <code>group2</code>
          </>
        ) : (
          <code>student2@example.com</code>
        )}{' '}
        to 100%. The <code>instance</code> column selects which assessment instance to modify, and
        should be <code>1</code> when there is only one instance per {subject}.
      </p>
      <p className="mb-2">
        To set total points instead, upload a CSV file with a <code>points</code> column:
      </p>
      <pre className="ms-4 mb-0">
        {`${idColumn},instance,points
${id1},1,120
${id2},1,130.27`}
      </pre>
    </>
  );
}

function SubmissionsHelp({ downloadsUrl }: { downloadsUrl: string }) {
  return (
    <ul className="mb-0">
      <li>
        Upload one of the submissions CSV files (<code>*_all_submissions.csv</code>,{' '}
        <code>*_final_submissions.csv</code>, or <code>*_best_submissions.csv</code>) from the{' '}
        <a href={downloadsUrl}>Downloads tab</a>.
      </li>
      <li>
        The download/upload process is lossy. Some information, such as <code>format_errors</code>,{' '}
        <code>raw_submitted_answers</code>, whether or not a submission was considered gradable, and
        scores (including manual grading and rubrics) will not be preserved.
      </li>
      <li>
        If the assessment has questions that use <b>manual rubric grading</b>, upload their rubrics
        before uploading the CSV. The rubrics must be identical to those used when the submissions
        were downloaded.
      </li>
    </ul>
  );
}
