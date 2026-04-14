import clsx from 'clsx';
import { useCallback, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Form from 'react-bootstrap/Form';

import { OverlayTrigger, Radio, RadioGroup } from '@prairielearn/ui';

import {
  type AmbiguousMatch,
  type CanvasStudent,
  type MatchResult,
  type MatchStrategy,
  type PlStudent,
  type StrategyResult,
  parseCanvasCsv,
  runAllStrategies,
  strategyDescription,
  strategyLabel,
} from '../lib/canvas-matching.js';

export interface CanvasMatchingState {
  canvasStudents: CanvasStudent[];
  strategyResults: StrategyResult[];
  selectedStrategy: MatchStrategy;
  currentResult: MatchResult;
}

/**
 * Shared panel for uploading a Canvas gradebook CSV and selecting a matching
 * strategy. Used in both the Gradebook and Assessment Downloads Canvas export
 * modals.
 */
export function CanvasMatchingPanel({
  plStudents,
  matchingState,
  onMatchingStateChange,
}: {
  plStudents: PlStudent[];
  matchingState: CanvasMatchingState | null;
  onMatchingStateChange: (state: CanvasMatchingState | null) => void;
}) {
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        onMatchingStateChange(null);
        setParseError(null);
        return;
      }

      const text = await file.text();
      const { students, error } = parseCanvasCsv(text);

      if (error) {
        setParseError(error);
        onMatchingStateChange(null);
        return;
      }

      if (students.length === 0) {
        setParseError('No student rows found in the uploaded CSV.');
        onMatchingStateChange(null);
        return;
      }

      setParseError(null);

      const results = runAllStrategies(plStudents, students);
      const best = results[0];

      onMatchingStateChange({
        canvasStudents: students,
        strategyResults: results,
        selectedStrategy: best.strategy,
        currentResult: best.result,
      });
    },
    [plStudents, onMatchingStateChange],
  );

  const handleStrategyChange = useCallback(
    (strategy: MatchStrategy) => {
      if (!matchingState) return;
      const found = matchingState.strategyResults.find((r) => r.strategy === strategy);
      if (!found) return;
      onMatchingStateChange({
        ...matchingState,
        selectedStrategy: strategy,
        currentResult: found.result,
      });
    },
    [matchingState, onMatchingStateChange],
  );

  const handleAmbiguousSelection = useCallback(
    (plUid: string, canvasIndex: number) => {
      if (!matchingState) return;
      const updatedAmbiguous = matchingState.currentResult.ambiguous.map((a) =>
        a.plStudent.uid === plUid ? { ...a, selectedCanvasIndex: canvasIndex } : a,
      );
      onMatchingStateChange({
        ...matchingState,
        currentResult: { ...matchingState.currentResult, ambiguous: updatedAmbiguous },
      });
    },
    [matchingState, onMatchingStateChange],
  );

  const handleClear = useCallback(() => {
    onMatchingStateChange(null);
    setParseError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onMatchingStateChange]);

  const hasAnyMatches = matchingState?.strategyResults.some(
    (s) => s.result.matched.length > 0,
  ) ?? false;

  return (
    <div>
      <h6>Canvas gradebook import (optional)</h6>
      <p className="text-muted small mb-1">
        Upload a gradebook CSV exported from Canvas so PrairieLearn can reuse each student&apos;s
        roster identity from that file. Without this, values that identify students to Canvas will
        use each student&apos;s PrairieLearn sign-in identifier instead.
      </p>
      <p className="small mb-3">
        <a
          href="https://prairielearn.readthedocs.io/en/latest/lmsIntegrationInstructor/#exporting-canvas-compatible-csv-files"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn more about exporting grades to Canvas
        </a>
      </p>

      <Form.Group controlId="canvas-csv-upload" className="mb-3">
        <Form.Label>Canvas gradebook CSV</Form.Label>
        <div className="d-flex align-items-center gap-2">
          <Form.Control ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} />
          {matchingState && (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary text-nowrap"
              onClick={handleClear}
            >
              Clear
            </button>
          )}
        </div>
      </Form.Group>

      {parseError && <Alert variant="danger">{parseError}</Alert>}

      {matchingState && (
        <>
          <h6>Matching strategy</h6>
          <RadioGroup
            className="d-flex flex-column gap-3 w-100"
            value={matchingState.selectedStrategy}
            onChange={handleStrategyChange}
          >
            {matchingState.strategyResults.map((sr) => {
              const disabled = hasAnyMatches && sr.result.matched.length === 0;
              return (
              <Radio key={sr.strategy} value={sr.strategy} isDisabled={disabled}>
                <span
                  className={clsx('d-inline-flex flex-column gap-1 min-w-0 justify-content-start', disabled && 'text-secondary')}
                >
                  <span>
                    {strategyLabel(sr.strategy)}{' '}
                    <OverlayTrigger
                      tooltip={{
                        body: strategyDescription(sr.strategy),
                        props: { id: `strategy-tooltip-${sr.strategy}` },
                      }}
                    >
                      <i className="bi bi-question-circle text-muted" aria-hidden="true" />
                    </OverlayTrigger>
                  </span>
                  <span className="text-muted small">
                    {sr.result.matched.length} matched, {sr.result.ambiguous.length} ambiguous,{' '}
                    {sr.result.unmatchedPl.length} unmatched PL, {sr.result.unmatchedCanvas.length}{' '}
                    unmatched Canvas
                  </span>
                </span>
              </Radio>
              );
            })}
          </RadioGroup>

          <MatchSummary result={matchingState.currentResult} />

          {matchingState.currentResult.ambiguous.length > 0 && (
            <AmbiguousMatchTable
              ambiguous={matchingState.currentResult.ambiguous}
              onSelect={handleAmbiguousSelection}
            />
          )}
        </>
      )}
    </div>
  );
}

function MatchSummary({ result }: { result: MatchResult }) {
  const { matched, ambiguous, unmatchedPl, unmatchedCanvas } = result;
  const hasAmbiguous = ambiguous.length > 0;
  const hasUnmatched = unmatchedPl.length > 0;
  const allGood = !hasAmbiguous && !hasUnmatched;

  const variant = allGood ? 'success' : hasUnmatched ? 'danger' : 'warning';
  const icon = allGood
    ? 'bi-check-circle-fill'
    : hasUnmatched
      ? 'bi-exclamation-triangle-fill'
      : 'bi-exclamation-circle-fill';

  return (
    <Alert variant={variant} className="mt-3 d-flex align-items-start gap-2">
      <i className={`bi ${icon}`} />
      <div>
        <strong>{matched.length}</strong> matched, <strong>{ambiguous.length}</strong> ambiguous,{' '}
        <strong>{unmatchedPl.length}</strong> unmatched from PrairieLearn,{' '}
        <strong>{unmatchedCanvas.length}</strong> unmatched from Canvas.
        {unmatchedPl.length > 0 && (
          <div className="mt-1 small">
            Unmatched PrairieLearn students will be exported using their PrairieLearn sign-in
            identifier where Canvas expects a login value.
          </div>
        )}
        {unmatchedCanvas.length > 0 && (
          <div className="mt-1 small">
            Unmatched Canvas students will be omitted (they have no PrairieLearn grades).
          </div>
        )}
      </div>
    </Alert>
  );
}

function AmbiguousMatchTable({
  ambiguous,
  onSelect,
}: {
  ambiguous: AmbiguousMatch[];
  onSelect: (plUid: string, canvasIndex: number) => void;
}) {
  return (
    <div className="mt-3">
      <h6>Resolve ambiguous matches</h6>
      <p className="text-muted small">
        The following PrairieLearn students matched multiple Canvas students. Select the correct
        Canvas student for each.
      </p>
      <div className="table-responsive">
        <table className="table table-sm" aria-label="Ambiguous matches">
          <thead>
            <tr>
              <th>PrairieLearn student</th>
              <th>Canvas match</th>
            </tr>
          </thead>
          <tbody>
            {ambiguous.map((a) => (
              <tr key={a.plStudent.uid}>
                <td>
                  <div>{a.plStudent.userName ?? '(no name)'}</div>
                  <small className="text-muted">{a.plStudent.uid}</small>
                </td>
                <td>
                  <Form.Select
                    size="sm"
                    value={a.selectedCanvasIndex ?? ''}
                    aria-label={`Select Canvas match for ${a.plStudent.userName ?? a.plStudent.uid}`}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val !== '') onSelect(a.plStudent.uid, Number(val));
                    }}
                  >
                    <option value="">Select a Canvas student...</option>
                    {a.candidates.map((c, i) => (
                      <option key={`${c.id}-${c.sisLoginId}`} value={i}>
                        {c.name} ({c.sisLoginId})
                      </option>
                    ))}
                  </Form.Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
