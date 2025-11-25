import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'preact/compat';
import { Alert, Button } from 'react-bootstrap';

import { escapeHtml, html } from '@prairielearn/html';
import { OverlayTrigger } from '@prairielearn/ui';

import {
  type StaffAssessmentQuestion,
  type StaffInstanceQuestion,
} from '../lib/client/safe-db-types.js';
import { type AssessmentQuestion, type InstanceQuestion } from '../lib/db-types.js';

type EditableField = 'points' | 'auto_points' | 'manual_points' | 'score_perc';

function findLabel(field: EditableField) {
  return {
    points: 'points',
    auto_points: 'auto points',
    manual_points: 'manual points',
    score_perc: 'score percentage',
  }[field];
}

export function EditQuestionPointsScoreButtonHtml({
  field,
  instance_question,
  assessment_question,
  urlPrefix,
  csrfToken,
}: {
  field: 'points' | 'auto_points' | 'manual_points' | 'score_perc';
  instance_question: InstanceQuestion;
  assessment_question: AssessmentQuestion;
  urlPrefix: string;
  csrfToken: string;
}) {
  const editForm = EditQuestionPointsScoreFormHtml({
    field,
    instance_question,
    assessment_question,
    urlPrefix,
    csrfToken,
  });

  return html`<button
    type="button"
    class="btn btn-xs btn-ghost text-muted"
    data-bs-toggle="popover"
    data-bs-container="body"
    data-bs-html="true"
    data-bs-placement="auto"
    aria-label="Change question ${findLabel(field)}"
    data-bs-content="${escapeHtml(editForm)}"
    data-testid="edit-question-points-score-button-${field}"
  >
    <i class="bi bi-pencil-square" aria-hidden="true"></i>
  </button>`;
}

function EditQuestionPointsScoreFormHtml({
  field,
  instance_question,
  assessment_question,
  urlPrefix,
  csrfToken,
}: {
  field: 'points' | 'auto_points' | 'manual_points' | 'score_perc';
  instance_question: InstanceQuestion;
  assessment_question: AssessmentQuestion;
  urlPrefix: string;
  csrfToken: string;
}) {
  const manualGradingUrl = `${urlPrefix}/assessment/${assessment_question.assessment_id}/manual_grading/instance_question/${instance_question.id}`;
  // If the question is configured to use rubrics, don't allow editing the
  // points, unless there is no submission, in which case we allow editing the
  // points manually since the manual grading page will not be available.
  if (assessment_question.manual_rubric_id != null && instance_question.status !== 'unanswered') {
    return html`
      <div>
        <p>
          This question is configured to use rubrics for grading. Changes must be performed in
          <a href="${manualGradingUrl}">the manual grading page</a>.
        </p>
        <div class="text-end">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
        </div>
      </div>
    `;
  }
  const [pointsOrScore, maxPoints] = {
    points: [instance_question.points, assessment_question.max_points],
    manual_points: [instance_question.manual_points, assessment_question.max_manual_points],
    auto_points: [instance_question.auto_points, assessment_question.max_auto_points],
    score_perc: [instance_question.score_perc, 100],
  }[field];

  // Since this component may be rendered by the client,
  // we should take special care to ensure that the modified_at timestamp is a 'Date' object.
  // This is done by re-parsing client-side data with Zod so that timestamps are converted back to 'Date' objects.
  if (!(instance_question.modified_at instanceof Date)) {
    throw new Error('modified_at must be a Date object');
  }

  return html`
    <form name="edit-points-form" method="POST">
      <input type="hidden" name="__action" value="edit_question_points" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="instance_question_id" value="${instance_question.id}" />
      <input
        type="hidden"
        name="modified_at"
        value="${instance_question.modified_at.toISOString()}"
      />
      <div class="mb-3">
        <div class="input-group">
          <input
            type="number"
            required
            step="any"
            class="form-control"
            name="${field}"
            value="${pointsOrScore}"
            aria-label="${findLabel(field)}"
          />
          <span class="input-group-text">
            ${field === 'score_perc' ? '%' : `/${maxPoints ?? 0}`}
          </span>
        </div>
      </div>
      <p>
        <small>
          This will also recalculate the total points and total score at 100% credit. This change
          will be overwritten if the question is answered again by the student.
          ${instance_question.status !== 'unanswered'
            ? html`You may also update the score
                <a href="${manualGradingUrl}">via the manual grading page</a>.`
            : ''}
        </small>
      </p>
      <div class="text-end">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Change</button>
      </div>
    </form>
  `;
}

// Preact version with mutation support
interface EditQuestionPointsMutationParams {
  instance_question_id: string;
  modified_at: string;
  field: 'points' | 'auto_points' | 'manual_points' | 'score_perc';
  value: number | null;
}

type EditQuestionPointsMutationResponse = {
  conflict_grading_job_id: string;
  conflict_details_url: string;
} | null;

function useEditQuestionPointsMutation({ csrfToken }: { csrfToken: string }) {
  return useMutation<EditQuestionPointsMutationResponse, Error, EditQuestionPointsMutationParams>({
    mutationFn: async (params: EditQuestionPointsMutationParams) => {
      const requestBody: Record<string, any> = {
        __action: 'edit_question_points',
        __csrf_token: csrfToken,
        instance_question_id: params.instance_question_id,
        modified_at: params.modified_at,
        [params.field]: params.value,
      };

      // TODO: This could probably be a proper URL once we use on multiple pages.
      const response = await fetch(window.location.pathname, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.status === 204) {
        return null;
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      return await response.json();
    },
  });
}

function EditQuestionPointsScoreForm({
  field,
  instanceQuestion,
  assessmentQuestion,
  urlPrefix,
  mutation,
  onSuccess,
  onConflict,
  onCancel,
}: {
  field: 'points' | 'auto_points' | 'manual_points' | 'score_perc';
  instanceQuestion: StaffInstanceQuestion;
  assessmentQuestion: StaffAssessmentQuestion;
  urlPrefix: string;
  mutation: ReturnType<typeof useEditQuestionPointsMutation>;
  onSuccess: () => void;
  onConflict: (conflictDetailsUrl: string) => void;
  onCancel: () => void;
}) {
  const [pointsOrScore, maxPoints] = {
    points: [instanceQuestion.points, assessmentQuestion.max_points],
    manual_points: [instanceQuestion.manual_points, assessmentQuestion.max_manual_points],
    auto_points: [instanceQuestion.auto_points, assessmentQuestion.max_auto_points],
    score_perc: [instanceQuestion.score_perc, 100],
  }[field];

  const [value, setValue] = useState<string>(pointsOrScore != null ? pointsOrScore.toString() : '');
  const [error, setError] = useState<string | null>(null);

  // Ensure modified_at is a Date object
  if (!(instanceQuestion.modified_at instanceof Date)) {
    throw new Error('modified_at must be a Date object');
  }

  const manualGradingUrl = `${urlPrefix}/assessment/${assessmentQuestion.assessment_id}/manual_grading/instance_question/${instanceQuestion.id}`;

  // If the question is configured to use rubrics, don't allow editing the
  // points, unless there is no submission, in which case we allow editing the
  // points manually since the manual grading page will not be available.
  if (assessmentQuestion.manual_rubric_id != null && instanceQuestion.status !== 'unanswered') {
    return (
      <div>
        <p>
          This question is configured to use rubrics for grading. Changes must be performed in{' '}
          <a href={manualGradingUrl}>the manual grading page</a>.
        </p>
        <div class="text-end">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    setError(null);

    const numValue = value === '' ? null : Number.parseFloat(value);
    if (value !== '' && Number.isNaN(numValue!)) {
      setError('Please enter a valid number');
      return;
    }

    mutation.mutate(
      {
        instance_question_id: instanceQuestion.id,
        modified_at: instanceQuestion.modified_at.toISOString(),
        field,
        value: numValue,
      },
      {
        onSuccess: (data) => {
          if (data) {
            onConflict(data.conflict_details_url);
          } else {
            onSuccess();
          }
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <div class="mb-3">
        <div class="input-group">
          <input
            type="number"
            step="any"
            class="form-control"
            value={value}
            aria-label={findLabel(field)}
            required
            onChange={(e) => {
              setValue((e.target as HTMLInputElement).value);
            }}
          />
          <span class="input-group-text">
            {field === 'score_perc' ? '%' : `/${maxPoints ?? 0}`}
          </span>
        </div>
        {error && <div class="text-danger mt-2">{error}</div>}
        {mutation.isError && (
          <Alert variant="danger" class="mt-2" dismissible onClose={() => mutation.reset()}>
            {mutation.error.message}
          </Alert>
        )}
      </div>
      <p>
        <small>
          This will also recalculate the total points and total score at 100% credit. This change
          will be overwritten if the question is answered again by the student.
          {instanceQuestion.status !== 'unanswered' && (
            <>
              {' '}
              You may also update the score{' '}
              <a href={manualGradingUrl}>via the manual grading page</a>.
            </>
          )}
        </small>
      </p>
      <div class="text-end">
        <Button disabled={mutation.isPending} variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={mutation.isPending} type="submit" variant="primary">
          {mutation.isPending ? 'Changing...' : 'Change'}
        </Button>
      </div>
    </form>
  );
}

export function EditQuestionPointsScoreButton({
  field,
  instanceQuestion,
  assessmentQuestion,
  csrfToken,
  urlPrefix,
  onSuccess,
  onConflict,
  scrollRef,
}: {
  field: 'points' | 'auto_points' | 'manual_points' | 'score_perc';
  instanceQuestion: StaffInstanceQuestion;
  assessmentQuestion: StaffAssessmentQuestion;
  csrfToken: string;
  urlPrefix: string;
  onSuccess: () => void;
  onConflict: (conflictDetailsUrl: string) => void;
  scrollRef?: React.RefObject<HTMLDivElement> | null;
}) {
  const mutation = useEditQuestionPointsMutation({ csrfToken });
  const [show, setShow] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleSuccess = () => {
    setShow(false);
    onSuccess();
  };

  const handleConflict = (conflictDetailsUrl: string) => {
    setShow(false);
    onConflict(conflictDetailsUrl);
  };

  const handleCancel = () => {
    setShow(false);
    mutation.reset();
  };

  // Close popover when table scrolls
  useEffect(() => {
    if (!show || !buttonRef.current || !scrollRef) return;
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      if (!buttonRef.current) return;

      const containerRect = scrollContainer.getBoundingClientRect();
      const buttonRect = buttonRef.current.getBoundingClientRect();

      // Check if button is outside the visible scroll area
      const isOutOfView =
        buttonRect.bottom < containerRect.top ||
        buttonRect.top > containerRect.bottom ||
        buttonRect.right < containerRect.left ||
        buttonRect.left > containerRect.right;

      if (isOutOfView) {
        setShow(false);
      }
    };

    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-live-state-to-parent
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  return (
    <OverlayTrigger
      popover={{
        body: (
          <EditQuestionPointsScoreForm
            assessmentQuestion={assessmentQuestion}
            field={field}
            instanceQuestion={instanceQuestion}
            mutation={mutation}
            urlPrefix={urlPrefix}
            onCancel={handleCancel}
            onConflict={handleConflict}
            onSuccess={handleSuccess}
          />
        ),
      }}
      placement="auto"
      rootClose={true}
      show={show}
      trigger="click"
      onToggle={setShow}
    >
      <button
        ref={buttonRef}
        type="button"
        class="btn btn-xs btn-ghost text-muted"
        aria-label={`Change question ${findLabel(field)}`}
      >
        <i class="bi bi-pencil-square" aria-hidden="true" />
      </button>
    </OverlayTrigger>
  );
}
