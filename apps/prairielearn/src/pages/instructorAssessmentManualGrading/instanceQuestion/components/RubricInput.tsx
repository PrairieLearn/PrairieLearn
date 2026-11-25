import clsx from 'clsx';
import { type ReactNode, type RefObject, useEffect, useState } from 'react';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';

import { run } from '@prairielearn/run';

import { subscribeToRubricEditorDirtyChange } from '../../../../lib/client/manual-grading-events.js';

import {
  type GradingPanelRubricItem,
  type RubricTreeNode,
  buildRubricTree,
  describeSelectionRule,
  leafItems,
} from '../utils/rubricTree.js';

import type {
  GradingPanelRubricData,
  ManualGradingContext,
} from './InstanceQuestionGradingPanel.types.js';

export function RubricInput({
  adjustmentInputRef,
  adjustmentPercentage,
  adjustmentPoints,
  aiSelectedRubricItemIds,
  context,
  disabled,
  enableKeyboardShortcuts,
  maxPoints,
  maxRubricPoints,
  onAdjustmentPercentageChange,
  onAdjustmentPointsChange,
  onRubricItemChange,
  onShowAdjustment,
  rubricData,
  selectedRubricItemIds,
  showAdjustment,
  showEditRubricButton,
  usePercentage,
}: {
  adjustmentInputRef: RefObject<HTMLInputElement | null>;
  adjustmentPercentage: string;
  adjustmentPoints: string;
  aiSelectedRubricItemIds: Set<string> | null;
  context: ManualGradingContext;
  disabled: boolean;
  enableKeyboardShortcuts: boolean;
  maxPoints: number;
  maxRubricPoints: number;
  onAdjustmentPercentageChange: (value: string) => void;
  onAdjustmentPointsChange: (value: string) => void;
  onRubricItemChange: (id: string, selected: boolean) => void;
  onShowAdjustment: () => void;
  rubricData: GradingPanelRubricData;
  selectedRubricItemIds: Set<string>;
  showAdjustment: boolean;
  showEditRubricButton: boolean;
  usePercentage: boolean;
}) {
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);
  // The rubric editor is a separate React island; it reports unsaved changes
  // that are kept while it is closed.
  useEffect(() => subscribeToRubricEditorDirtyChange(setHasUnsavedEdits), []);

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-1">
        <div className="d-flex align-items-center gap-2 text-secondary ps-1">
          {aiSelectedRubricItemIds && (
            <>
              <span title="AI grading">
                <i className="bi bi-stars" aria-hidden="true" />
                <span className="visually-hidden">AI grading</span>
              </span>
              <span title="Human grading">
                <i className="bi bi-person-fill" aria-hidden="true" />
                <span className="visually-hidden">Human grading</span>
              </span>
            </>
          )}
        </div>
        {!disabled && showEditRubricButton && (
          <button
            type="button"
            className="btn btn-sm btn-link p-0 text-decoration-none"
            onClick={openRubricEditor}
          >
            <i className="bi bi-pencil me-1" aria-hidden="true" />
            Edit rubric
            {hasUnsavedEdits && <span className="text-warning-emphasis"> (unsaved changes)</span>}
          </button>
        )}
      </div>

      <RubricTree
        nodes={buildRubricTree(rubricData.items)}
        aiSelectedRubricItemIds={aiSelectedRubricItemIds}
        context={context}
        disabled={disabled}
        enableKeyboardShortcuts={enableKeyboardShortcuts}
        maxRubricPoints={maxRubricPoints}
        selectedRubricItemIds={selectedRubricItemIds}
        usePercentage={usePercentage}
        onRubricItemChange={onRubricItemChange}
      />

      {(!disabled || showAdjustment) && (
        <div className="d-flex justify-content-end">
          {!showAdjustment ? (
            <>
              <button
                type="button"
                className="btn btn-sm btn-link"
                data-key-binding={enableKeyboardShortcuts ? 'a' : undefined}
                onClick={onShowAdjustment}
              >
                Apply adjustment
                {enableKeyboardShortcuts && (
                  <kbd aria-hidden="true" className="pl-kbd kbd-semi-transparent ms-2">
                    A
                  </kbd>
                )}
              </button>
              <input
                type="number"
                className="d-none"
                tabIndex={-1}
                name="score_manual_adjust_points"
                value=""
                readOnly
              />
              {maxPoints > 0 && (
                <input
                  type="number"
                  className="d-none"
                  tabIndex={-1}
                  name="score_manual_adjust_percent"
                  value=""
                  readOnly
                />
              )}
            </>
          ) : (
            <Form.Group className="w-25" controlId={`rubric-adjustment-${context}`}>
              <Form.Label className="small">
                Adjustment:
                <span className="visually-hidden"> {usePercentage ? 'percent' : 'points'}</span>
              </Form.Label>
              <InputGroup size="sm">
                <Form.Control
                  key={`adjustment-${usePercentage ? 'percentage' : 'points'}-input`}
                  ref={adjustmentInputRef}
                  type="number"
                  step="any"
                  disabled={disabled}
                  name={
                    usePercentage ? 'score_manual_adjust_percent' : 'score_manual_adjust_points'
                  }
                  value={usePercentage ? adjustmentPercentage : adjustmentPoints}
                  onChange={(event) =>
                    usePercentage
                      ? onAdjustmentPercentageChange(event.target.value)
                      : onAdjustmentPointsChange(event.target.value)
                  }
                />
                {usePercentage && <InputGroup.Text>%</InputGroup.Text>}
              </InputGroup>
              {maxPoints > 0 && (
                <input
                  key={`adjustment-${usePercentage ? 'points' : 'percentage'}-hidden-input`}
                  type="number"
                  className="d-none"
                  tabIndex={-1}
                  disabled={disabled}
                  name={
                    usePercentage ? 'score_manual_adjust_points' : 'score_manual_adjust_percent'
                  }
                  value={usePercentage ? adjustmentPoints : adjustmentPercentage}
                  readOnly
                />
              )}
            </Form.Group>
          )}
        </div>
      )}
    </>
  );
}

interface RubricTreeProps {
  aiSelectedRubricItemIds: Set<string> | null;
  context: ManualGradingContext;
  disabled: boolean;
  enableKeyboardShortcuts: boolean;
  maxRubricPoints: number;
  onRubricItemChange: (id: string, selected: boolean) => void;
  selectedRubricItemIds: Set<string>;
  usePercentage: boolean;
}

/** Opens the rubric editor, which is hidden on this page until a grader asks for it. */
export function openRubricEditor() {
  // TODO: RubricSettings is a separate React island. Keep this DOM bridge until the
  // page is hydrated under a shared React root.
  const panel = document.getElementById('rubric-setting');
  if (panel && !panel.classList.contains('show')) {
    document.querySelector<HTMLElement>('[data-bs-target="#rubric-setting"]')?.click();
  }
  (document.getElementById('rubric-editor') ?? panel)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

function formatPoints(points: number, usePercentage: boolean, maxRubricPoints: number) {
  const displayed = usePercentage
    ? Math.round((points * 10000) / maxRubricPoints) / 100
    : Math.round(points * 100) / 100;
  return `[${points >= 0 ? '+' : ''}${displayed}${usePercentage ? '%' : ''}]`;
}

function RubricTree({ nodes, ...props }: RubricTreeProps & { nodes: RubricTreeNode[] }) {
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set());
  const toggleCollapsed = (id: string) =>
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const renderNode = (
    node: RubricTreeNode,
    parent: GradingPanelRubricItem | null,
    parentChildren: string[],
  ): ReactNode =>
    node.item.isGroup ? (
      <RubricGroup
        key={node.item.id}
        node={node}
        collapsed={collapsedGroupIds.has(node.item.id)}
        renderNode={renderNode}
        onToggleCollapsed={() => toggleCollapsed(node.item.id)}
        {...props}
      />
    ) : (
      <RubricItemRow
        key={node.item.id}
        item={node.item}
        selectionBlocked={run(() => {
          if (parent?.maxSelections == null || parent.maxSelections === 1) return false;
          if (props.selectedRubricItemIds.has(node.item.id)) return false;
          const selectedSiblings = parentChildren.filter((id) =>
            props.selectedRubricItemIds.has(id),
          );
          return selectedSiblings.length >= parent.maxSelections;
        })}
        {...props}
      />
    );

  return <>{nodes.map((node) => renderNode(node, null, []))}</>;
}

function RubricGroup({
  node,
  collapsed,
  onToggleCollapsed,
  renderNode,
  selectedRubricItemIds,
  usePercentage,
  maxRubricPoints,
  context,
}: RubricTreeProps & {
  node: RubricTreeNode;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  renderNode: (
    node: RubricTreeNode,
    parent: GradingPanelRubricItem | null,
    parentChildren: string[],
  ) => ReactNode;
}) {
  const { item } = node;
  const rule = describeSelectionRule(item);
  const childIds = node.children.map((child) => child.item.id);
  const selectedChildCount = childIds.filter((id) => selectedRubricItemIds.has(id)).length;
  const selectedLeaves = leafItems(node).filter((leaf) => selectedRubricItemIds.has(leaf.id));
  const selectedPoints = selectedLeaves.reduce((sum, leaf) => sum + leaf.points, 0);
  const needsSelection = item.minSelections != null && selectedChildCount < item.minSelections;
  const childrenId = `rubric-group-${context}-${item.id}`;

  return (
    <div className="pb-1" data-testid="rubric-group">
      <button
        type="button"
        className="btn btn-sm w-100 d-flex align-items-start gap-2 text-start px-1 border-0"
        aria-expanded={!collapsed}
        aria-controls={childrenId}
        onClick={onToggleCollapsed}
      >
        <i
          className={clsx('bi mt-1', collapsed ? 'bi-chevron-right' : 'bi-chevron-down')}
          aria-hidden="true"
        />
        <span className="flex-grow-1">
          <span
            className="fw-semibold"
            data-testid="rubric-group-description"
            // oxlint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: item.descriptionRendered }}
          />
          {rule && (
            <span
              className={clsx(
                'badge ms-2 align-text-bottom',
                needsSelection ? 'text-bg-warning' : 'text-bg-light border',
              )}
              data-testid="rubric-group-rule"
            >
              {needsSelection && (
                <i className="bi bi-exclamation-triangle me-1" aria-hidden="true" />
              )}
              {rule}
            </span>
          )}
        </span>
        {selectedLeaves.length > 0 && (
          <span
            className={clsx(
              'small text-nowrap',
              `text-${selectedPoints >= 0 ? 'success' : 'danger'}`,
            )}
          >
            {collapsed && <span className="text-muted me-1">{selectedLeaves.length} selected</span>}
            <strong>{formatPoints(selectedPoints, usePercentage, maxRubricPoints)}</strong>
          </span>
        )}
      </button>
      {(item.explanationRendered || item.graderNoteRendered) && !collapsed && (
        <div className="small text-muted ms-4 mb-1">
          <div
            // oxlint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: item.explanationRendered }}
          />
          <div
            // oxlint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: item.graderNoteRendered }}
          />
        </div>
      )}
      {/* Collapsed groups stay mounted so their selected checkboxes are still submitted. */}
      <div id={childrenId} className="rubric-tree-children" hidden={collapsed}>
        {node.children.map((child) => renderNode(child, item, childIds))}
      </div>
    </div>
  );
}

function RubricItemRow({
  item,
  selectionBlocked,
  aiSelectedRubricItemIds,
  context,
  disabled,
  enableKeyboardShortcuts,
  maxRubricPoints,
  onRubricItemChange,
  selectedRubricItemIds,
  usePercentage,
}: RubricTreeProps & { item: GradingPanelRubricItem; selectionBlocked: boolean }) {
  const id = item.id;
  const selected = selectedRubricItemIds.has(id);
  const inputId = `rubric-item-${context}-${id}`;
  const aiSelected = aiSelectedRubricItemIds?.has(id);
  const keyBinding = enableKeyboardShortcuts ? item.keyBinding : null;

  return (
    <div>
      <label
        htmlFor={inputId}
        className={clsx(
          'js-selectable-rubric-item-label rubric-tree-item w-100 border rounded px-1 d-flex align-items-start',
          selected && 'bg-primary-subtle border-primary-subtle',
          selectionBlocked && 'opacity-50',
        )}
        style={{ borderColor: selected ? undefined : 'transparent' }}
      >
        {aiSelectedRubricItemIds && (
          <input
            type="checkbox"
            className="mx-2 mt-1"
            name="rubric_item_selected_ai"
            value={id}
            checked={aiSelected}
            title={aiSelected ? 'Selected by AI' : 'Not selected by AI'}
            disabled
            readOnly
          />
        )}
        <input
          id={inputId}
          type="checkbox"
          name="rubric_item_selected_manual"
          className="js-selectable-rubric-item me-2 mt-1"
          value={id}
          checked={selected}
          disabled={disabled || selectionBlocked}
          data-key-binding={keyBinding ?? undefined}
          onChange={(event) => onRubricItemChange(id, event.target.checked)}
        />
        {keyBinding && (
          <kbd aria-hidden="true" className="pl-kbd kbd-semi-transparent me-2 mt-1">
            {keyBinding}
          </kbd>
        )}
        <div className="flex-grow-1">
          <div
            data-testid="rubric-item-description"
            // The rendered fields come from the server's Markdown renderer.
            // oxlint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: item.descriptionRendered }}
          />
          <div
            className="small text-muted"
            data-testid="rubric-item-explanation"
            // oxlint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: item.explanationRendered }}
          />
          <div
            className="small text-muted"
            data-testid="rubric-item-grader-note"
            // oxlint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: item.graderNoteRendered }}
          />
        </div>
        <span className={`ms-2 text-nowrap text-${item.points >= 0 ? 'success' : 'danger'}`}>
          <strong>
            <span data-testid="rubric-item-points">
              {formatPoints(item.points, usePercentage, maxRubricPoints)}
            </span>
          </strong>
        </span>
      </label>
    </div>
  );
}
