import { useMutation } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Button, Dropdown, Modal } from 'react-bootstrap';

import { type AppError, AppErrorAlert, getAppError } from '../../../lib/client/errors.js';
import { getCourseInstanceJobSequenceUrl } from '../../../lib/client/url.js';
import type { AssessmentUploadsError } from '../../../trpc/assessment/assessment-uploads.js';
import { useTRPC } from '../../../trpc/assessment/context.js';

type OpenUploadModal = 'instanceQuestionScores' | 'assessmentInstanceScores' | 'submissions' | null;

export function UploadDropdown({
  courseInstanceId,
  groupWork,
  isDevMode,
}: {
  courseInstanceId: string;
  groupWork: boolean;
  isDevMode: boolean;
}) {
  const trpc = useTRPC();
  const [openModal, setOpenModal] = useState<OpenUploadModal>(null);

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
        inputId="upload-instance-question-scores-file"
        help={<InstanceQuestionScoresHelp groupWork={groupWork} />}
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
        inputId="upload-assessment-instance-scores-file"
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
          inputId="upload-submissions-file"
          help={<SubmissionsHelp />}
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
  inputId,
  help,
  isPending,
  appError,
  onUpload,
  onReset,
}: {
  show: boolean;
  onHide: () => void;
  title: string;
  inputId: string;
  help: ReactNode;
  isPending: boolean;
  appError: AppError<never> | null;
  onUpload: (file: File) => void;
  onReset: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);

  return (
    <Modal
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
        {help}
        <div className="mb-3">
          <label className="form-label" htmlFor={inputId}>
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

function InstanceQuestionScoresHelp({ groupWork }: { groupWork: boolean }) {
  const idColumn = groupWork ? 'group_name' : 'uid';
  const id1 = groupWork ? 'group1' : 'student1@example.com';
  const id2 = groupWork ? 'group2' : 'student2@example.com';
  return (
    <>
      <p>
        Upload a CSV file in the format of the{' '}
        <code>
          <i>&lt;assessment&gt;</i>_submissions_for_manual_grading.csv
        </code>{' '}
        file from the Downloads page. Alternatively, the CSV file can be in the format:
      </p>
      <pre className="ms-4">
        {`${idColumn},instance,qid,score_perc,feedback
${id1},1,addTwoNumbers,34.5,The second step was wrong
${id2},1,addTwoNumbers,78.92,
${id2},1,matrixMultiply,100,Great job!`}
      </pre>
      <p>
        Additional information, including instructions on how to update points instead of percentage
        or to update the auto/manual portions of the score, can be found in the{' '}
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
      <p>Upload a CSV file like this:</p>
      <pre className="ms-4">
        {`${idColumn},instance,score_perc
${id1},1,63.5
${id2},1,100`}
      </pre>
      <p>
        The example above will change the total assessment percentage scores for{' '}
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
        to 100%. The <code>instance</code> column indicates which assessment instance to modify, and
        should be <code>1</code> if there is only a single instance per {subject}.
      </p>
      <p>
        Alternatively, the total assessment points can be changed with a CSV containing a{' '}
        <code>points</code> column, like:
      </p>
      <pre className="ms-4">
        {`${idColumn},instance,points
${id1},1,120
${id2},1,130.27`}
      </pre>
    </>
  );
}

function SubmissionsHelp() {
  return (
    <>
      <p>
        Upload a CSV file to recreate users, assessment instances, questions, variants, and
        submissions.
      </p>
      <p>
        You should upload one of the submissions CSV files (<code>*_all_submissions.csv</code>,{' '}
        <code>*_final_submissions.csv</code>, or <code>*_best_submissions.csv</code>) from the
        Downloads page.
      </p>
      <p>
        The download/upload process is lossy. Some information, such as <code>format_errors</code>,{' '}
        <code>raw_submitted_answers</code>, whether or not a submission was considered gradable, and
        scores (including manual grading and rubrics) will not be preserved.
      </p>
      <p>
        If the assessment has questions that use <b>manual rubric grading</b>, upload their rubrics
        before uploading the CSV. The rubrics must be identical to those used when the submissions
        were downloaded.
      </p>
      <div className="alert alert-danger">
        This will delete all existing assessment instances and submissions for this assessment and
        replace them with the submissions from the CSV file. This action cannot be undone.
      </div>
    </>
  );
}
