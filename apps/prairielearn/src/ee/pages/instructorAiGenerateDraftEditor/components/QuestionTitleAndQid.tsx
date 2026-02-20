import clsx from 'clsx';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';

import { validateShortName } from '../../../../lib/short-name.js';

export const DRAFT_QID_PREFIX = '__drafts__/';

function isDraftQid(qid: string): boolean {
  return qid.startsWith(DRAFT_QID_PREFIX);
}

async function renameDraftQuestion({
  csrfToken,
  qid,
  title,
}: {
  csrfToken: string;
  qid?: string;
  title?: string;
}): Promise<{ qid: string; title: string | null }> {
  const response = await fetch(window.location.href, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      __action: 'rename_draft_question',
      __csrf_token: csrfToken,
      ...(qid != null ? { qid } : {}),
      ...(title != null ? { title } : {}),
    }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error ?? 'Failed to rename question');
  }
  return response.json();
}

function InlineEditableField({
  value,
  displayValue,
  placeholder,
  onSave,
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
  onSave: (newValue: string) => Promise<void>;
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
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  // Reset local state when entering edit mode (render-time state sync).
  const [wasEditing, setWasEditing] = useState(false);
  if (isEditing && !wasEditing) {
    setWasEditing(true);
    setLocalValue(value);
    setError(null);
  } else if (!isEditing && wasEditing) {
    setWasEditing(false);
  }

  // Focus and select the input when entering edit mode.
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleSave = useCallback(async () => {
    const trimmed = localValue.trim();

    if (trimmed === value.trim()) {
      onEditEnd();
      return;
    }

    if (disableSaveWhenEmpty && trimmed === '') return;

    if (validate) {
      const validationError = validate(trimmed);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      onEditEnd();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [localValue, value, disableSaveWhenEmpty, validate, onSave, onEditEnd]);

  const handleCancel = useCallback(() => {
    if (isSaving) return;
    onEditEnd();
  }, [isSaving, onEditEnd]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void handleSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleSave, handleCancel],
  );

  if (!isEditing) {
    const shownValue = displayValue ?? value;
    return (
      <div
        role={disabled ? undefined : 'button'}
        tabIndex={disabled ? undefined : 0}
        className={clsx(
          'd-inline-flex align-items-center gap-1 rounded px-1 inline-editable-display',
          disabled && 'disabled',
        )}
        aria-label={`${fieldLabel}: ${shownValue || placeholder}. Click to edit.`}
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : onEditStart}
        onKeyDown={
          disabled
            ? undefined
            : (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onEditStart();
                }
              }
        }
      >
        {displayPrefix}
        <span
          className={clsx('text-truncate text-start', displayClassName)}
          dir={truncateStart ? 'rtl' : undefined}
        >
          {truncateStart ? (
            <span dir="auto">
              {shownValue || <span className="text-muted fst-italic">{placeholder}</span>}
            </span>
          ) : (
            shownValue || <span className="text-muted fst-italic">{placeholder}</span>
          )}
        </span>
        <i className="bi bi-pencil text-muted small" aria-hidden="true" />
      </div>
    );
  }

  const isSaveDisabled = isSaving || (disableSaveWhenEmpty && localValue.trim() === '');

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
          disabled={isSaving}
          aria-label={fieldLabel}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setLocalValue(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="btn btn-sm btn-primary flex-shrink-0"
          aria-label="Save"
          disabled={isSaveDisabled}
          onClick={() => void handleSave()}
        >
          {isSaving ? (
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
          disabled={isSaving}
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
  csrfToken,
  onSaved,
}: {
  currentQid: string | null;
  currentTitle: string | null;
  csrfToken: string;
  onSaved: (update: { qid: string | null; title: string | null }) => void;
}) {
  const [editingField, setEditingField] = useState<'title' | 'qid' | null>(null);

  const qid = currentQid ?? '';
  const hasDraftPrefix = isDraftQid(qid);
  const qidSuffix = hasDraftPrefix ? qid.slice(DRAFT_QID_PREFIX.length) : qid;

  const handleSaveTitle = useCallback(
    async (newTitle: string) => {
      const result = await renameDraftQuestion({
        csrfToken,
        title: newTitle || undefined,
      });
      onSaved(result);
    },
    [csrfToken, onSaved],
  );

  const handleSaveQid = useCallback(
    async (newQidSuffix: string) => {
      const fullQid = hasDraftPrefix ? DRAFT_QID_PREFIX + newQidSuffix : newQidSuffix;
      const result = await renameDraftQuestion({
        csrfToken,
        qid: fullQid,
      });
      onSaved(result);
    },
    [csrfToken, hasDraftPrefix, onSaved],
  );

  const validateQid = useCallback(
    (newQidSuffix: string) => {
      const fullQid = hasDraftPrefix ? DRAFT_QID_PREFIX + newQidSuffix : newQidSuffix;
      const validation = validateShortName(fullQid, qid);
      if (!validation.valid) return validation.message;
      return null;
    },
    [hasDraftPrefix, qid],
  );

  return (
    <div className="d-flex flex-wrap align-items-center gap-2 px-1 py-1 border-bottom bg-light question-title-bar">
      <InlineEditableField
        value={currentTitle ?? ''}
        placeholder="Untitled question"
        fieldLabel="Question title"
        displayClassName="fw-semibold"
        disabled={editingField !== null && editingField !== 'title'}
        isEditing={editingField === 'title'}
        disableSaveWhenEmpty
        onSave={handleSaveTitle}
        onEditStart={() => setEditingField('title')}
        onEditEnd={() => setEditingField(null)}
      />
      <InlineEditableField
        value={qidSuffix}
        displayValue={qid}
        placeholder="e.g. topic/question_name"
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
        validate={validateQid}
        disabled={editingField !== null && editingField !== 'qid'}
        isEditing={editingField === 'qid'}
        truncateStart
        onSave={handleSaveQid}
        onEditStart={() => setEditingField('qid')}
        onEditEnd={() => setEditingField(null)}
      />
    </div>
  );
}
