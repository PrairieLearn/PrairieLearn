import clsx from 'clsx';
import { Alert, Badge, Button, Card, Form, Spinner } from 'react-bootstrap';
import { useFormContext } from 'react-hook-form';

import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';

import type { PrintPreparationQuestion } from '../../../lib/client/printing/print-preparation.js';
import { getQuestionUrl } from '../../../lib/client/url.js';
import type { PrintSettings, SavePrintSetting } from '../../../lib/printing/print-settings.js';
import type { PrintFormsError } from '../../../trpc/assessment/print-forms.js';

import { BLOCK_SIZE_LABELS } from './PaperLayoutCard.js';

/** The form's questions with their review flags, selection checkboxes, and spacing. */
export function QuestionsCard({
  questions,
  questionsError,
  questionsPending,
  includedQuestions,
  excludedQuestions,
  questionSizes,
  omitted,
  includedOmittedCount,
  omittedRecovery,
  reviewCount,
  reviewOnly,
  setReviewOnly,
  selectedQuestion,
  setSelectedQuestion,
  questionSelectionLocked,
  isPreviousForm,
  isDirty,
  settingsLocked,
  controlsBusy,
  canEditPrintForms,
  courseInstanceId,
  saveSetting,
  onReviseSelection,
}: {
  questions: PrintPreparationQuestion[] | undefined;
  questionsError: unknown;
  questionsPending: boolean;
  includedQuestions: PrintPreparationQuestion[] | undefined;
  excludedQuestions: string[];
  questionSizes: PrintSettings['questionSizes'];
  /** Omission messages from the preview, by question number. */
  omitted: Map<string, string>;
  includedOmittedCount: number;
  omittedRecovery: string;
  reviewCount: number;
  reviewOnly: boolean;
  setReviewOnly: (reviewOnly: boolean) => void;
  selectedQuestion: { number: string } | null;
  setSelectedQuestion: (question: { number: string } | null) => void;
  questionSelectionLocked: boolean;
  isPreviousForm: boolean;
  isDirty: boolean;
  settingsLocked: boolean;
  controlsBusy: boolean;
  canEditPrintForms: boolean;
  courseInstanceId: string;
  saveSetting: SavePrintSetting;
  /** Downloaded forms change their selection by creating a new version. */
  onReviseSelection: (questionNumber: string, included: boolean) => void;
}) {
  const { setValue } = useFormContext<PrintSettings>();
  const excludedQuestionNumbers = new Set(excludedQuestions);
  return (
    <Card id="print-preparation-questions" className="mb-3">
      <Card.Header className="bg-white d-flex flex-wrap align-items-center justify-content-between gap-3 py-3">
        <div>
          <h2 className="h6 mb-1">
            Questions in this form{' '}
            {questions && <span className="text-muted">({questions.length})</span>}
          </h2>
          {includedQuestions && (
            <p className="small fw-semibold mb-2">
              {includedQuestions.length} of {questions?.length} selected ·{' '}
              {includedQuestions.reduce((total, question) => total + question.points, 0)} points
            </p>
          )}
          <p className="small text-muted mb-0">
            The list marks printing concerns and questions that could not be included. Check the
            preview for layout and complete instructions.
          </p>
          {canEditPrintForms && questionSelectionLocked && !isPreviousForm && (
            <p className="small text-muted mb-0 mt-1">
              A download has started for this form. Changing its question selection creates a new
              numbered version; the original stays in Previous forms.
            </p>
          )}
        </div>
        {reviewCount > 0 && (
          <Form.Check
            type="switch"
            id="print-review-only"
            label={`Show only items to review (${reviewCount})`}
            checked={reviewOnly}
            disabled={controlsBusy}
            onChange={(event) => setReviewOnly(event.target.checked)}
          />
        )}
      </Card.Header>
      <AppErrorAlert
        error={getAppError<PrintFormsError['questions']>(questionsError)}
        render={{ UNKNOWN: ({ message }) => message }}
      />
      {questionsPending && (
        <div className="p-3" role="status">
          <Spinner size="sm" className="me-2" />
          Checking question content…
        </div>
      )}
      {includedOmittedCount > 0 && (
        <Alert variant="danger" className="m-3">
          {includedOmittedCount}{' '}
          {includedOmittedCount === 1 ? 'question cannot' : 'questions cannot'} be printed.{' '}
          {omittedRecovery}
        </Alert>
      )}
      {questions
        ?.filter(
          (question) =>
            !reviewOnly ||
            reviewCount === 0 ||
            (!excludedQuestionNumbers.has(question.number) &&
              (question.concerns.length > 0 || omitted.has(question.number))),
        )
        .map((question) => {
          const excluded = excludedQuestionNumbers.has(question.number);
          const error = excluded ? undefined : omitted.get(question.number);
          return (
            <div
              key={question.number}
              id={`print-preparation-question-${question.number}`}
              role="group"
              aria-label={`Question ${question.number}: ${question.title}`}
              tabIndex={error || (!excluded && question.concerns.length > 0) ? -1 : undefined}
              className={clsx('print-preparation-question', {
                'bg-danger-subtle': error,
                'bg-body-tertiary': excluded,
                'print-preparation-question-selected': selectedQuestion?.number === question.number,
              })}
            >
              <Form.Check
                type="checkbox"
                id={`print-question-include-${question.number}`}
                className="print-preparation-question-include"
                aria-label={`Include question ${question.number}`}
                checked={!excluded}
                disabled={settingsLocked || (questionSelectionLocked && isDirty)}
                onChange={(event) => {
                  if (questionSelectionLocked) {
                    onReviseSelection(question.number, event.target.checked);
                    return;
                  }
                  const next = event.target.checked
                    ? excludedQuestions.filter((number) => number !== question.number)
                    : [...excludedQuestions, question.number].sort((a, b) =>
                        a.localeCompare(b, undefined, { numeric: true }),
                      );
                  setValue('excludedQuestions', next, { shouldDirty: true });
                  void saveSetting('excludedQuestions', next).catch(() => {});
                  if (selectedQuestion?.number === question.number) {
                    setSelectedQuestion(null);
                  }
                }}
              />
              <span className="print-preparation-question-number">{question.number}</span>
              <div className="print-preparation-question-title">
                <Button
                  type="button"
                  variant="link"
                  className="p-0 text-start fw-semibold text-decoration-none"
                  disabled={controlsBusy || !!error || excluded}
                  onClick={() => {
                    setSelectedQuestion({ number: question.number });
                    window.document
                      .querySelector('.print-preparation-preview-card')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }}
                >
                  {question.title}
                </Button>
                <div className="text-muted small mt-1">{question.points} points</div>
              </div>
              {(error || question.concerns.length > 0) && (
                <div className="print-preparation-question-review small">
                  {error ? (
                    <>
                      <Badge bg="danger" className="mb-1">
                        Omitted
                      </Badge>
                      <div>{error}</div>
                    </>
                  ) : (
                    <>
                      <Badge bg="warning" text="dark" className="mb-1">
                        Review printability
                      </Badge>
                      <div>{question.concerns.join(' ')}</div>
                    </>
                  )}
                </div>
              )}
              <Form.Group
                controlId={`print-question-space-${question.number}`}
                className="print-preparation-question-space"
              >
                <Form.Label className="small mb-0">Spacing</Form.Label>
                <Form.Select
                  size="sm"
                  disabled={settingsLocked || !!error || excluded}
                  aria-label={`Spacing for question ${question.number}`}
                  value={questionSizes[question.number] ?? ''}
                  onChange={(event) => {
                    // Homework labels contain dots, which register() treats as nested paths.
                    const next = {
                      ...questionSizes,
                      [question.number]: event.target
                        .value as PrintSettings['questionSizes'][string],
                    };
                    setValue('questionSizes', next, { shouldDirty: true });
                    void saveSetting('questionSizes', next).catch(() => {});
                  }}
                >
                  <option value="">Automatic</option>
                  {Object.entries(BLOCK_SIZE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Form.Select>
                <a
                  href={getQuestionUrl({
                    courseInstanceId,
                    questionId: question.questionId,
                  })}
                  className="small text-nowrap"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${canEditPrintForms ? 'Edit' : 'View'} question ${question.number} (opens in a new tab)`}
                >
                  {canEditPrintForms ? 'Edit' : 'View'} question
                </a>
              </Form.Group>
            </div>
          );
        })}
      {questions?.length === 0 && (
        <p className="p-3 mb-0 text-muted">
          There are no questions in this form. Add questions to the assessment before printing.
        </p>
      )}
    </Card>
  );
}
