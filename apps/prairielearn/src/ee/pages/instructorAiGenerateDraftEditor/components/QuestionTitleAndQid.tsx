import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

import {
  getAppError,
  renderAppError,
  syncJobFailedRenderer,
} from '../../../../lib/client/errors.js';
import { DRAFT_QID_PREFIX, isDraftQid } from '../../../../lib/draft-question.ts';
import { validateShortName } from '../../../../lib/short-name.js';
import type { AiDraftFilesError } from '../../../../trpc/course/ai-draft-files.js';
import { useTRPC } from '../../../../trpc/course/context.js';

import { useDraftFiles } from './draftFilesContext.js';

function InlineEditableField({
  value,
  displayValue,
  placeholder,
  isPending,
  serverError,
  onSave,
  onResetServerError,
  fieldLabel,
  displayClassName,
  inputClassName,
  displayPrefix,
  inputPrefix,
  validate,
  disableSaveWhenEmpty,
  truncateStart,
  disabled,
  isEditing,
  onEditStart,
  onEditEnd,
}: {
  value: string;
  /** Text shown in display mode. Defaults to `value` if not provided. */
  displayValue?: string;
  placeholder: string;
  isPending: boolean;
  serverError: ReactNode;
  onSave: (newValue: string) => void;
  onResetServerError: () => void;
  /** Accessible label for both the edit trigger and the input field. */
  fieldLabel: string;
  displayClassName?: string;
  inputClassName?: string;
  displayPrefix?: ReactNode;
  inputPrefix?: ReactNode;
  validate?: (value: string) => string | null;
  disableSaveWhenEmpty?: boolean;
  /** Show ellipsis at the start of the text instead of the end. */
  truncateStart?: boolean;
  disabled?: boolean;
  isEditing: boolean;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  const [localValue, setLocalValue] = useState(value);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  const error = validationError ?? serverError;

  function handleEditStart() {
    setLocalValue(value);
    setValidationError(null);
    onResetServerError();
    onEditStart();
  }

  // Focus and select the input when entering edit mode.
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  function handleSave() {
    const trimmed = localValue.trim();

    if (trimmed === value.trim()) {
      onEditEnd();
      return;
    }

    if (disableSaveWhenEmpty && trimmed === '') return;

    if (validate) {
      const validationError = validate(trimmed);
      if (validationError) {
        setValidationError(validationError);
        return;
      }
    }

    setValidationError(null);
    onSave(trimmed);
  }

  function handleCancel() {
    if (isPending) return;
    onEditEnd();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  }

  if (!isEditing) {
    const shownValue = displayValue ?? value;
    return (
      <button
        type="button"
        className="d-inline-flex align-items-center gap-1 rounded px-1 inline-editable-display"
        aria-label={`${fieldLabel}: ${shownValue || placeholder}. Click to edit.`}
        disabled={disabled}
        onClick={handleEditStart}
      >
        {displayPrefix}
        <span
          className={clsx('text-truncate text-start', displayClassName)}
          dir={truncateStart ? 'rtl' : undefined}
        >
          <span dir="auto">
            {shownValue || <span className="text-muted fst-italic">{placeholder}</span>}
          </span>
        </span>
        <i className="bi bi-pencil text-muted small" aria-hidden="true" />
      </button>
    );
  }

  const isSaveDisabled = isPending || (disableSaveWhenEmpty && localValue.trim() === '');

  return (
    <div>
      <div className="d-flex align-items-center gap-1 px-1 inline-editable-edit">
        {inputPrefix}
        <input
          ref={inputRef}
          type="text"
          className={clsx('form-control form-control-sm', inputClassName, error && 'is-invalid')}
          value={localValue}
          placeholder={placeholder}
          disabled={isPending}
          aria-label={fieldLabel}
          aria-invalid={error ? true : undefined}
          aria-errormessage={error ? errorId : undefined}
          onChange={(e) => {
            setLocalValue(e.target.value);
            setValidationError(null);
            onResetServerError();
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="btn btn-sm btn-primary flex-shrink-0"
          aria-label="Save"
          disabled={isSaveDisabled}
          onClick={handleSave}
        >
          {isPending ? (
            <span className="spinner-border spinner-border-text" role="status">
              <span className="visually-hidden">Saving...</span>
            </span>
          ) : (
            <i className="bi bi-check2" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-secondary flex-shrink-0"
          aria-label="Cancel"
          disabled={isPending}
          onClick={handleCancel}
        >
          <i className="bi bi-x-lg" aria-hidden="true" />
        </button>
      </div>
      {error ? (
        <div id={errorId} className="text-danger small mt-1" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export function QuestionTitleAndQid({
  currentQid,
  currentTitle,
  onSaved,
}: {
  currentQid: string | null;
  currentTitle: string | null;
  onSaved: (update: { qid: string | null; title: string | null }) => void;
}) {
  const trpc = useTRPC();
  const { questionId, urlPrefix } = useDraftFiles();
  const [editingField, setEditingField] = useState<'title' | 'qid' | null>(null);

  const qid = currentQid ?? '';
  const hasDraftPrefix = isDraftQid(qid);
  const qidSuffix = hasDraftPrefix ? qid.slice(DRAFT_QID_PREFIX.length) : qid;

  const renameMutation = useMutation(
    trpc.aiDraftFiles.renameQuestion.mutationOptions({
      onSuccess: (result) => {
        onSaved(result);
        setEditingField(null);
      },
    }),
  );

  const renameError = getAppError<AiDraftFilesError['RenameQuestion']>(renameMutation.error);
  const serverError: ReactNode = renameError
    ? renderAppError(renameError, {
        SYNC_JOB_FAILED: syncJobFailedRenderer(urlPrefix),
        UNKNOWN: ({ message }) => message,
      })
    : null;

  function handleSaveTitle(newTitle: string) {
    renameMutation.mutate({ questionId, title: newTitle || undefined });
  }

  function handleSaveQid(newQidSuffix: string) {
    const fullQid = hasDraftPrefix ? DRAFT_QID_PREFIX + newQidSuffix : newQidSuffix;
    renameMutation.mutate({ questionId, qid: fullQid });
  }

  function validateQid(newQidSuffix: string) {
    const fullQid = hasDraftPrefix ? DRAFT_QID_PREFIX + newQidSuffix : newQidSuffix;
    const validation = validateShortName(fullQid, qid);
    if (!validation.valid) return validation.message;
    return null;
  }

  return (
    <div className="d-flex flex-wrap align-items-center gap-2 px-1 py-1 border-bottom bg-light question-title-bar">
      <InlineEditableField
        value={currentTitle ?? ''}
        placeholder="Untitled question"
        fieldLabel="Question title"
        displayClassName="fw-semibold"
        isPending={renameMutation.isPending}
        serverError={editingField === 'title' ? serverError : null}
        disabled={editingField !== null && editingField !== 'title'}
        isEditing={editingField === 'title'}
        disableSaveWhenEmpty
        onResetServerError={() => renameMutation.reset()}
        onSave={handleSaveTitle}
        onEditStart={() => setEditingField('title')}
        onEditEnd={() => setEditingField(null)}
      />
      <InlineEditableField
        value={qidSuffix}
        displayValue={qid}
        placeholder="add-random-numbers"
        fieldLabel="Question QID"
        displayClassName="font-monospace small text-muted"
        inputClassName="font-monospace"
        displayPrefix={
          <span className="badge bg-secondary bg-opacity-25 text-muted fw-normal">QID</span>
        }
        inputPrefix={
          <>
            <span className="badge bg-secondary bg-opacity-25 text-muted fw-normal">QID</span>
            {hasDraftPrefix ? (
              <span className="text-muted font-monospace small text-nowrap">
                {DRAFT_QID_PREFIX}
              </span>
            ) : null}
          </>
        }
        isPending={renameMutation.isPending}
        serverError={editingField === 'qid' ? serverError : null}
        validate={validateQid}
        disabled={editingField !== null && editingField !== 'qid'}
        isEditing={editingField === 'qid'}
        truncateStart
        onResetServerError={() => renameMutation.reset()}
        onSave={handleSaveQid}
        onEditStart={() => setEditingField('qid')}
        onEditEnd={() => setEditingField(null)}
      />
    </div>
  );
}
