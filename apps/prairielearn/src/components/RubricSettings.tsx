import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { type CSSProperties, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { Alert, Modal, Overlay, Popover } from 'react-bootstrap';
import { z } from 'zod';

import { downloadAsJSON, executeScripts, parseHTMLElement } from '@prairielearn/browser-utils';
import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

import type { AiGradingGeneralStats } from '../ee/lib/ai-grading/types.js';
import { b64EncodeUnicode } from '../lib/base64-util.js';
import {
  dispatchInstanceQuestionGradingPanelUpdate,
  dispatchRubricEditorDirtyChange,
} from '../lib/client/manual-grading-events.js';
import { mathjaxTypeset } from '../lib/client/mathjax.js';
import type { StaffAssessmentQuestion } from '../lib/client/safe-db-types.js';
import { isSideNavExpanded, setSideNavExpandedTemporarily } from '../lib/client/side-nav.js';
import { verticalBoundaryCollision } from '../lib/client/vertical-boundary-collision.js';
import type { RubricItem } from '../lib/db-types.js';
import type { RenderedRubricItem, RubricData } from '../lib/manualGrading.types.js';
import {
  assignKeyBindings,
  customKeyBindingErrors,
  normalizeKeyBinding,
} from '../lib/rubric-key-bindings.js';

import {
  type EditorTreeRow,
  type TreeGuide,
  depthsFromParents,
  groupWarning,
  hasSubgroup,
  isSortedHighestFirst,
  parentIndex,
  projectDrop,
  removeSubtree,
  rubricPointRange,
  sortChildrenByPoints,
  subgroupBlocker,
  subtreeEnd,
  treeGuides,
} from './RubricSettings.tree.js';
import { CollapseToggleButton } from './tree/CollapseToggleButton.js';
import { DragHandle } from './tree/DragHandle.js';
import { WarningIndicator } from './tree/WarningIndicator.js';

type RubricItemData = Omit<RenderedRubricItem, 'rubric_item' | 'num_submissions'> & {
  rubric_item: Omit<
    RubricItem,
    'rubric_id' | 'id' | 'number' | 'points' | 'show_to_students' | 'parent_id'
  > & {
    id?: string;
    points: number | null;
  };
  /** Nesting depth in the editor; the server derives `parent_id` from it on save. */
  depth: number;
  unique_key: string;
  disagreement_count: number | null;
  num_submissions: number | null;
};

const ExportedRubricItemSchema = z.object({
  order: z.number(),
  points: z.number(),
  description: z.string(),
  explanation: z.string(),
  grader_note: z.string(),
  always_show_to_students: z.boolean(),
  // Optional so that rubrics exported before groups existed can still be imported.
  depth: z.number().int().nonnegative().optional(),
  is_group: z.boolean().optional(),
  min_selections: z.number().int().nullable().optional(),
  max_selections: z.number().int().nullable().optional(),
  /** Only custom keys are exported. */
  key_binding: z.string().nullable().optional(),
});

const ExportedRubricDataSchema = z.object({
  max_extra_points: z.number(),
  min_points: z.number(),
  replace_auto_points: z.boolean(),
  starting_points: z.number(),
  max_points: z.number().nullable(),
  max_manual_points: z.number().nullable(),
  max_auto_points: z.number().nullable(),
  grader_guidelines: z.string().optional(),
  rubric_items: z.array(ExportedRubricItemSchema),
});

type ExportedRubricData = z.infer<typeof ExportedRubricDataSchema>;

function rubricItemEquals(a: RubricItemData['rubric_item'], b: RubricItemData['rubric_item']) {
  return (
    a.id === b.id &&
    a.points === b.points &&
    a.description === b.description &&
    (a.explanation ?? '') === (b.explanation ?? '') &&
    (a.grader_note ?? '') === (b.grader_note ?? '') &&
    a.always_show_to_students === b.always_show_to_students &&
    a.is_group === b.is_group &&
    a.min_selections === b.min_selections &&
    a.max_selections === b.max_selections &&
    a.key_binding === b.key_binding
  );
}

function toEditorRows(
  rubricData: RubricData | null | undefined,
  disagreementCounts: Record<string, number>,
): RubricItemData[] {
  const items = rubricData?.rubric_items ?? [];
  const depths = depthsFromParents(items.map((item) => item.rubric_item));
  return items.map((item, i) => ({
    ...item,
    // The editor holds only custom keys; automatic ones are recomputed as rows move.
    rubric_item: {
      ...item.rubric_item,
      key_binding: item.rubric_item.key_binding_is_custom ? item.rubric_item.key_binding : null,
    },
    depth: depths[i],
    unique_key: `rubric-item-${item.rubric_item.id}`,
    disagreement_count:
      item.rubric_item.id in disagreementCounts ? disagreementCounts[item.rubric_item.id] : null,
  }));
}

function newRubricRow(depth: number, isGroup: boolean): RubricItemData {
  return {
    rubric_item: {
      always_show_to_students: true,
      deleted_at: null,
      description: '',
      explanation: null,
      grader_note: null,
      key_binding: null,
      key_binding_is_custom: false,
      points: isGroup ? 0 : 1,
      is_group: isGroup,
      min_selections: null,
      max_selections: null,
    },
    depth,
    // Use a stable ID for the new row so that it can be used as a key in
    // the list. This is important for React to correctly identify and
    // manage the list items, especially when reordering or deleting rows.
    unique_key: `new-row-${crypto.randomUUID()}`,
    num_submissions: null,
    disagreement_count: null,
  };
}

export function RubricSettings({
  hasCourseInstancePermissionEdit,
  assessmentQuestion,
  rubricData,
  csrfToken,
  aiGradingStats,
  context,
  openedFromGradingPanel = false,
  onSaved,
}: {
  hasCourseInstancePermissionEdit: boolean;
  assessmentQuestion: StaffAssessmentQuestion;
  rubricData: RubricData | null | undefined;
  csrfToken: string;
  aiGradingStats: AiGradingGeneralStats | null;
  context: Record<string, any>;
  /**
   * On the grading page the editor is a mode that the grading panel opens: it
   * is hidden while closed, and its header leads back to grading.
   */
  openedFromGradingPanel?: boolean;
  onSaved?: (data: {
    rubric_data: RubricData | null;
    aiGradingStats: AiGradingGeneralStats | null;
  }) => void;
}) {
  const showAiGradingStats = Boolean(aiGradingStats);
  const rubricItemDataMerged = toEditorRows(rubricData, aiGradingStats?.rubric_stats ?? {});
  const { variant_params, variant_true_answer, submission_submitted_answer } = context;
  const groups = {
    params: variant_params,
    correct_answers: variant_true_answer,
    submitted_answers: submission_submitted_answer,
  };
  const params = Object.entries(groups).flatMap(([groupName, groupParams]) => {
    return Object.keys(groupParams || {}).map((groupParam) => `{{${groupName}.${groupParam}}}`);
  });

  // Define states
  const [rubricItems, setRubricItems] = useState<RubricItemData[]>(rubricItemDataMerged);
  const [replaceAutoPoints, setReplaceAutoPoints] = useState<boolean>(
    rubricData?.rubric.replace_auto_points ?? !assessmentQuestion.max_manual_points,
  );
  const [startingPoints, setStartingPoints] = useState<number>(
    rubricData?.rubric.starting_points ?? 0,
  );
  const [minPoints, setMinPoints] = useState<number | null>(rubricData?.rubric.min_points ?? 0);
  const [maxExtraPoints, setMaxExtraPoints] = useState<number | null>(
    rubricData?.rubric.max_extra_points ?? 0,
  );
  const [tagForGrading, setTagForGrading] = useState<boolean>(false);
  const [graderGuidelines, setGraderGuidelines] = useState<string>(
    rubricData?.rubric.grader_guidelines ?? '',
  );

  const [activeDragKey, setActiveDragKey] = useState<string | null>(null);
  const [overDragKey, setOverDragKey] = useState<string | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [isKeyboardDrag, setIsKeyboardDrag] = useState(false);
  const focusHandleKeyRef = useRef<string | null>(null);
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState<boolean>(false);
  const [groupToDelete, setGroupToDelete] = useState<number | null>(null);
  const [importModalWarning, setImportModalWarning] = useState<string | null>(null);
  const rubricFileRef = useRef<HTMLInputElement>(null);
  const [wasUsingRubric, setWasUsingRubric] = useState<boolean>(Boolean(rubricData?.rubric));
  const [modifiedAt, setModifiedAt] = useState<Date | null>(rubricData?.rubric.modified_at ?? null);
  const [copyPopoverTarget, setCopyPopoverTarget] = useState<HTMLElement | null>(null);
  const [showSavedNotification, setShowSavedNotification] = useState(false);
  const settingsId = useId();

  useEffect(() => {
    // Collapse the course side nav while the rubric editor is open to give the
    // editor more width, and restore it when the editor closes. The editor is a
    // Bootstrap collapse outside of React's control, so listen for its events.
    const settings = document.getElementById('rubric-setting');
    if (!settings) return;
    let collapsedSideNav = false;
    const onShow = (event: Event) => {
      if (event.target !== settings || !isSideNavExpanded()) return;
      collapsedSideNav = true;
      setSideNavExpandedTemporarily(false);
    };
    const onHide = (event: Event) => {
      if (event.target !== settings || !collapsedSideNav) return;
      collapsedSideNav = false;
      setSideNavExpandedTemporarily(true);
    };
    // Leaving the editor on the grading page returns to where the grader was:
    // the top of the submission and of the grading panel.
    const onHidden = (event: Event) => {
      if (event.target !== settings || !openedFromGradingPanel) return;
      document.getElementById('rubric-editor')?.parentElement?.scrollIntoView({ block: 'start' });
      document.querySelector('.js-main-grading-panel')?.scrollIntoView({ block: 'start' });
    };
    settings.addEventListener('show.bs.collapse', onShow);
    settings.addEventListener('hide.bs.collapse', onHide);
    settings.addEventListener('hidden.bs.collapse', onHidden);
    return () => {
      settings.removeEventListener('show.bs.collapse', onShow);
      settings.removeEventListener('hide.bs.collapse', onHide);
      settings.removeEventListener('hidden.bs.collapse', onHidden);
    };
  }, [openedFromGradingPanel]);

  useEffect(() => {
    if (!showSavedNotification) return;
    const t = setTimeout(() => setShowSavedNotification(false), 3000);
    return () => clearTimeout(t);
  }, [showSavedNotification]);

  // Also define default for rubric-related variables
  const defaultRubricItemsRef = useRef<RubricItemData[]>(rubricItemDataMerged);
  const defaultReplaceAutoPointsRef = useRef<boolean>(
    rubricData?.rubric.replace_auto_points ?? !assessmentQuestion.max_manual_points,
  );
  const defaultStartingPointsRef = useRef<number>(rubricData?.rubric.starting_points ?? 0);
  const defaultMinPointsRef = useRef<number>(rubricData?.rubric.min_points ?? 0);
  const defaultMaxExtraPointsRef = useRef<number>(rubricData?.rubric.max_extra_points ?? 0);
  const defaultGraderGuidelinesRef = useRef<string>(rubricData?.rubric.grader_guidelines ?? '');

  // Derived totals
  const pointRange = rubricPointRange(rubricItems);
  const totalPositive = roundPoints(startingPoints + pointRange.max);
  const totalNegative = roundPoints(startingPoints + pointRange.min);

  const maxPoints = roundPoints(
    (replaceAutoPoints
      ? (assessmentQuestion.max_points ?? 0)
      : (assessmentQuestion.max_manual_points ?? 0)) + (maxExtraPoints ?? 0),
  );

  const minRubricScore = roundPoints(minPoints ?? 0);
  const maxPointsShortfall = roundPoints(maxPoints - totalPositive);
  const minPointsShortfall = roundPoints(totalNegative - minRubricScore);

  const defaultRubricItems = defaultRubricItemsRef.current;
  const isDirty = run(() => {
    if (replaceAutoPoints !== defaultReplaceAutoPointsRef.current) return true;
    if (startingPoints !== defaultStartingPointsRef.current) return true;
    if ((minPoints ?? 0) !== defaultMinPointsRef.current) return true;
    if ((maxExtraPoints ?? 0) !== defaultMaxExtraPointsRef.current) return true;
    if (graderGuidelines !== defaultGraderGuidelinesRef.current) return true;
    if (rubricItems.length !== defaultRubricItems.length) return true;
    return rubricItems.some(
      (it, i) =>
        it.depth !== defaultRubricItems[i].depth ||
        !rubricItemEquals(it.rubric_item, defaultRubricItems[i].rubric_item),
    );
  });

  // Unsaved changes survive closing the editor, so the grading panel's "Edit
  // rubric" link points them out. The panel is a separate React island.
  useEffect(() => {
    if (openedFromGradingPanel) dispatchRubricEditorDirtyChange(isDirty);
  }, [isDirty, openedFromGradingPanel]);

  // Handlers
  const addRubricItemRow = () => {
    setRubricItems((prev) => [...prev, newRubricRow(0, false)]);
  };

  const addGroupRow = () => {
    setRubricItems((prev) => [...prev, newRubricRow(0, true), newRubricRow(1, false)]);
  };

  const addItemToGroup = (idx: number) => {
    setRubricItems((prev) => {
      const insertAt = subtreeEnd(prev, idx);
      return [
        ...prev.slice(0, insertAt),
        newRubricRow(prev[idx].depth + 1, false),
        ...prev.slice(insertAt),
      ];
    });
  };

  const addSubgroup = (idx: number) => {
    setRubricItems((prev) => {
      const insertAt = subtreeEnd(prev, idx);
      const depth = prev[idx].depth + 1;
      return [
        ...prev.slice(0, insertAt),
        newRubricRow(depth, true),
        newRubricRow(depth + 1, false),
        ...prev.slice(insertAt),
      ];
    });
  };

  const deleteRow = (idx: number) => {
    setRubricItems((prev) => removeSubtree(prev, idx));
  };

  // Deleting a group also deletes everything inside it, so confirm first
  // unless the group is empty.
  const requestDeleteRow = (idx: number) => {
    if (rubricItems[idx].rubric_item.is_group && subtreeEnd(rubricItems, idx) > idx + 1) {
      setGroupToDelete(idx);
    } else {
      deleteRow(idx);
    }
  };

  // The keyboard drags rows with `onDragHandleKeyDown` instead of dnd-kit's
  // keyboard sensor, which loses track of rows when the grading page's panel
  // scrolls to follow the dragged row.
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // A dragged group's contents are hidden while it is dragged, and collapsed
  // groups hide theirs.
  const activeDragIdx = rubricItems.findIndex((it) => it.unique_key === activeDragKey);
  const isCollapsedGroup = (idx: number) =>
    idx === activeDragIdx ||
    (rubricItems[idx].rubric_item.is_group && collapsedKeys.has(rubricItems[idx].unique_key));
  const hiddenRows = run(() => {
    const hidden = rubricItems.map(() => false);
    for (const [idx] of rubricItems.entries()) {
      if (hidden[idx] || !isCollapsedGroup(idx)) continue;
      for (let child = idx + 1; child < subtreeEnd(rubricItems, idx); child++) hidden[child] = true;
    }
    return hidden;
  });
  const isHidden = (idx: number) => hiddenRows[idx];
  const displayRows = buildDisplayRows(rubricItems, {
    withAddRows: hasCourseInstancePermissionEdit,
    isHidden,
    isCollapsedGroup,
  });
  const toggleCollapsed = (key: string) =>
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const guides = treeGuides(displayRows);
  const customKeys = rubricItems.map((it) =>
    it.rubric_item.is_group ? null : it.rubric_item.key_binding,
  );
  const keyErrors = customKeyBindingErrors(customKeys);
  const automaticKeys = assignKeyBindings(
    rubricItems.map((it, idx) => ({
      isGroup: it.rubric_item.is_group,
      customKey: keyErrors[idx] == null ? customKeys[idx] : null,
    })),
  );
  const columnCount = hasCourseInstancePermissionEdit ? 9 : 8;

  // Dragging moves a row (with its contents) up and down, and dragging it
  // sideways by one indent moves it into or out of a group. The rows around
  // the drop decide which depths are possible; see `projectDrop`.
  const projectDragTo = (activeKey: string | null, overKey: string | null, offsetX: number) => {
    const activeIdx = rubricItems.findIndex((it) => it.unique_key === activeKey);
    const overIdx = rubricItems.findIndex((it) => it.unique_key === overKey);
    if (activeIdx === -1 || overIdx === -1) return null;
    return projectDrop(rubricItems, {
      activeIdx,
      overIdx,
      depthOffset: Math.round(offsetX / TREE_INDENT),
      isCollapsed: (idx) =>
        rubricItems[idx].rubric_item.is_group && collapsedKeys.has(rubricItems[idx].unique_key),
    });
  };
  const dropProjection = projectDragTo(activeDragKey, overDragKey, dragOffsetX);
  const describeDrop = () => {
    if (activeDragIdx === -1) return '';
    const name = rubricItems[activeDragIdx].rubric_item.description || 'Untitled row';
    if (!dropProjection) return `${name} can't be dropped here.`;
    const { rows, depth } = dropProjection;
    const at = rows.findIndex((it) => it.unique_key === activeDragKey);
    const parent = parentIndex(rows, at);
    const siblings = rows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row, idx }) => row.depth === depth && parentIndex(rows, idx) === parent);
    const position = `position ${siblings.findIndex(({ idx }) => idx === at) + 1} of ${siblings.length}`;
    const where =
      parent == null
        ? 'at the top level'
        : `in ${rows[parent].rubric_item.description || 'an untitled group'}`;
    return `${name} will be dropped ${where}, ${position}.`;
  };
  const endDrag = () => {
    setActiveDragKey(null);
    setOverDragKey(null);
    setDragOffsetX(0);
    setIsKeyboardDrag(false);
  };
  const visibleKeys = rubricItems.filter((_, idx) => !isHidden(idx)).map((it) => it.unique_key);
  const onDragHandleKeyDown = (key: string, event: KeyboardEvent<HTMLElement>) => {
    const isDropKey = event.key === ' ' || event.key === 'Enter';
    if (!isKeyboardDrag) {
      if (!isDropKey || activeDragKey != null) return;
      event.preventDefault();
      setActiveDragKey(key);
      setOverDragKey(key);
      setDragOffsetX(0);
      setIsKeyboardDrag(true);
      return;
    }
    if (key !== activeDragKey) return;
    event.preventDefault();
    if (isDropKey) {
      if (dropProjection) {
        setRubricItems(dropProjection.rows);
        // The row's handle moves in the page, so focus it again once it's there.
        focusHandleKeyRef.current = key;
      }
      endDrag();
    } else if (event.key === 'Escape') {
      endDrag();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const next = visibleKeys.indexOf(overDragKey ?? key) + (event.key === 'ArrowDown' ? 1 : -1);
      if (next >= 0 && next < visibleKeys.length) setOverDragKey(visibleKeys[next]);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      // Step one level from where the row would land now, so that extra
      // presses past the deepest or shallowest level don't need undoing.
      const activeDepth = rubricItems[activeDragIdx].depth;
      const current = dropProjection?.depth ?? activeDepth;
      const wanted = current + (event.key === 'ArrowRight' ? 1 : -1);
      setDragOffsetX((wanted - activeDepth) * TREE_INDENT);
    }
  };
  useEffect(() => {
    // Return focus to a row's drag handle after it was moved with the keyboard.
    const key = focusHandleKeyRef.current;
    if (key == null) return;
    focusHandleKeyRef.current = null;
    document
      .querySelector<HTMLElement>(`tr[data-rubric-key="${key}"] [aria-label="Drag to reorder"]`)
      ?.focus();
  }, [rubricItems]);

  // Uses the event's own position: with quick key presses, the drop can
  // arrive before the last move has been rendered.
  const onDragEnd = ({ active, over, delta }: DragEndEvent) => {
    const projection = projectDragTo(String(active.id), over ? String(over.id) : null, delta.x);
    if (projection) setRubricItems(projection.rows);
    endDrag();
  };

  // Sorting a group that is already highest-first flips it to lowest-first.
  const sortGroupByPoints = (idx: number) =>
    setRubricItems((prev) =>
      sortChildrenByPoints(
        prev,
        idx,
        isSortedHighestFirst(prev, idx) ? 'lowest-first' : 'highest-first',
      ),
    );

  const updateRubricItem = (idx: number, patch: Partial<RubricItemData['rubric_item']>) => {
    setRubricItems((prev) => {
      const next = prev.slice();
      next[idx] = {
        ...next[idx],
        rubric_item: {
          ...next[idx].rubric_item,
          ...patch,
        },
      };
      return next;
    });
  };

  const onCancel = () => {
    setRubricItems(defaultRubricItemsRef.current);
    setReplaceAutoPoints(defaultReplaceAutoPointsRef.current);
    setStartingPoints(defaultStartingPointsRef.current);
    setMinPoints(defaultMinPointsRef.current);
    setMaxExtraPoints(defaultMaxExtraPointsRef.current);
    setGraderGuidelines(defaultGraderGuidelinesRef.current);
    setSettingsError(null);
  };

  const exportRubric = () => {
    // Need to check for validity since we don't want to export a rubric when it's not completed
    if (!reportInputValidity()) {
      return;
    }
    const rubricData: ExportedRubricData = {
      max_extra_points: maxExtraPoints ?? 0,
      min_points: minPoints ?? 0,
      replace_auto_points: replaceAutoPoints,
      starting_points: startingPoints,
      max_points: assessmentQuestion.max_points,
      max_manual_points: assessmentQuestion.max_manual_points,
      max_auto_points: assessmentQuestion.max_auto_points,
      grader_guidelines: graderGuidelines,
      rubric_items: rubricItems.map((it, idx) => ({
        order: idx,
        points: it.rubric_item.points ?? 0,
        description: it.rubric_item.description,
        explanation: it.rubric_item.explanation ?? '',
        grader_note: it.rubric_item.grader_note ?? '',
        always_show_to_students: it.rubric_item.always_show_to_students,
        depth: it.depth,
        is_group: it.rubric_item.is_group,
        min_selections: it.rubric_item.min_selections,
        max_selections: it.rubric_item.max_selections,
        key_binding: it.rubric_item.key_binding,
      })),
    };

    const { course_short_name, course_instance_short_name, assessment_tid, question_qid } = context;
    const exportFileName =
      `${course_short_name}__${course_instance_short_name}__${assessment_tid}__${question_qid}__rubric_settings`.replaceAll(
        /[^a-zA-Z0-9_-]/g,
        '_',
      ) + '.json';
    downloadAsJSON(rubricData, exportFileName);
  };

  /**
   * Rounds the points for a rubric item to two decimal places
   * @param points original points
   * @returns rounded points
   */
  function roundPoints(points: number) {
    return Math.round(Number(points) * 100) / 100;
  }

  const resetImportModal = () => {
    setImportModalWarning(null);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
  };

  const importRubric = async () => {
    const input = rubricFileRef.current;
    if (!input?.files || input.files.length === 0) {
      setImportModalWarning('Please select a file to import.');
      return;
    }
    const file = input.files[0];

    try {
      const fileContent = await file.text();
      if (fileContent.trim() === '') {
        return;
      }
      let parsedData;
      try {
        parsedData = ExportedRubricDataSchema.parse(JSON.parse(fileContent));
      } catch {
        setImportModalWarning('Error parsing JSON file, please check the file format.');
        return;
      }

      // This factor scales the imported rubric point values to ensure that they
      // are correctly aligned with the point values of the recipient question.
      let scaleFactor = 1;

      if (!parsedData.max_auto_points || parsedData.replace_auto_points) {
        // If the rubric does not use auto points, or if it replaces auto points,
        // then the scale factor is based on max_points (the total point gs of the rubric)
        const maxPoints = assessmentQuestion.max_points ?? 0;

        if (maxPoints > 0 && parsedData.max_points) {
          scaleFactor = maxPoints / parsedData.max_points;
        }
      } else {
        // If the rubric uses auto points and does not replace them, it
        // applies only to the manual points of the assessment question.
        // Therefore, we base the scale factor on max_manual_points.
        const maxManualPoints = assessmentQuestion.max_manual_points ?? 0;

        if (maxManualPoints > 0 && parsedData.max_manual_points) {
          scaleFactor = maxManualPoints / parsedData.max_manual_points;
        }
      }
      setMaxExtraPoints(roundPoints((parsedData.max_extra_points || 0) * scaleFactor));
      setMinPoints(roundPoints((parsedData.min_points || 0) * scaleFactor));
      setReplaceAutoPoints(Boolean(parsedData.replace_auto_points));
      setStartingPoints(roundPoints((parsedData.starting_points || 0) * scaleFactor));

      const rubricItems = parsedData.rubric_items;

      const scaledRubricItems: RubricItemData[] = Array.from(rubricItems, (rubricItem) => ({
        rubric_item: {
          always_show_to_students: rubricItem.always_show_to_students,
          deleted_at: null,
          description: rubricItem.description,
          explanation: rubricItem.explanation,
          grader_note: rubricItem.grader_note,
          key_binding: normalizeKeyBinding(rubricItem.key_binding),
          key_binding_is_custom: false,
          points: roundPoints(rubricItem.points * scaleFactor),
          is_group: rubricItem.is_group ?? false,
          min_selections: rubricItem.min_selections ?? null,
          max_selections: rubricItem.max_selections ?? null,
        },
        depth: rubricItem.depth ?? 0,
        unique_key: `imported-row-${crypto.randomUUID()}`,
        num_submissions: null,
        disagreement_count: null,
      }));

      setGraderGuidelines(parsedData.grader_guidelines ?? '');
      setRubricItems(scaledRubricItems);

      closeImportModal();
    } catch {
      setImportModalWarning('Error reading file content.');
    }
  };

  const copyMustachePattern = async (e: React.MouseEvent, param: string) => {
    const button = e.currentTarget as HTMLElement;
    await navigator.clipboard.writeText(param);
    button.animate(
      [
        { backgroundColor: '', color: '', offset: 0 },
        { backgroundColor: '#000', color: '#fff', offset: 0.5 },
        { backgroundColor: '', color: '', offset: 1 },
      ],
      500,
    );
    setCopyPopoverTarget(button);
    setTimeout(() => setCopyPopoverTarget(null), 1000);
  };

  const reportInputValidity = () => {
    // Performs validation on the all inputs
    // This will make sure that all non-nullable inputs are filled, and number inputs parse as numbers
    const inputs = document.querySelectorAll<HTMLInputElement>('#rubric-editor input');
    const textareas = document.querySelectorAll<HTMLTextAreaElement>('#rubric-editor textarea');
    return (
      Array.from(inputs).every((input) => input.reportValidity()) &&
      Array.from(textareas).every((input) => input.reportValidity())
    );
  };

  const submitSettings = async (use_rubric: boolean) => {
    if (use_rubric && !reportInputValidity()) return;
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const payload = {
        __csrf_token: csrfToken,
        __action: 'modify_rubric_settings',
        use_rubric,
        modified_at: modifiedAt?.toISOString() ?? '',
        replace_auto_points: replaceAutoPoints,
        starting_points: startingPoints,
        min_points: minPoints,
        max_extra_points: maxExtraPoints,
        grader_guidelines: graderGuidelines,
        rubric_items: rubricItems.map((it, idx) => ({
          id: it.rubric_item.id,
          order: idx,
          points: it.rubric_item.points,
          description: it.rubric_item.description,
          explanation: it.rubric_item.explanation,
          grader_note: it.rubric_item.grader_note,
          always_show_to_students: it.rubric_item.always_show_to_students,
          depth: it.depth,
          is_group: it.rubric_item.is_group,
          min_selections: it.rubric_item.min_selections,
          max_selections: it.rubric_item.max_selections,
          key_binding: it.rubric_item.key_binding,
        })),
        tag_for_manual_grading: tagForGrading,
      };

      const res = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let data: { err: any };
        try {
          data = (await res.json()) ?? {};
        } catch {
          data = { err: `Error: ${res.statusText}` };
        }
        if (data.err) {
          return setSettingsError(data.err);
        }
      }
      // Need to handle response separated for assessment question and instance question pages
      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const data = await res.json();

        if (data.submissionPanel && data.submissionId) {
          const oldSubmission = document.getElementById(`submission-${data.submissionId}`);
          if (oldSubmission) {
            const newSubmission = parseHTMLElement(document, data.submissionPanel);
            oldSubmission.replaceWith(newSubmission);
            executeScripts(newSubmission);
            await mathjaxTypeset([newSubmission]);
          }
        }

        if (data.gradingPanelProps) {
          // TODO: The instance-question grading panel is a separate React island. Keep this event
          // bridge until RubricSettings and the grading panel share a root.
          dispatchInstanceQuestionGradingPanelUpdate({
            gradingPanelProps: data.gradingPanelProps,
            preserveValues: true,
          });
        }

        // Since we are preserving the temporary rubric item selection in the instance question page, the page is not refreshed
        // after saving. Suppose we start with setting A, and update it to B and save it. Ideally we would expect a "Discard changes"
        // to reset to B instead of A. We are updating the default values with B so "Discard changes" would reset correctly.
        const rubricData = data.rubric_data as RubricData | null;
        const rubric = rubricData?.rubric ?? null;
        defaultRubricItemsRef.current = toEditorRows(
          rubricData,
          data.aiGradingStats?.rubric_stats ?? {},
        );
        defaultReplaceAutoPointsRef.current =
          rubric?.replace_auto_points ?? !assessmentQuestion.max_manual_points;
        defaultStartingPointsRef.current = rubric?.starting_points ?? 0;
        defaultMinPointsRef.current = rubric?.min_points ?? 0;
        defaultMaxExtraPointsRef.current = rubric?.max_extra_points ?? 0;
        defaultGraderGuidelinesRef.current = rubric?.grader_guidelines ?? '';
        setWasUsingRubric(Boolean(rubric));
        setModifiedAt(rubric ? new Date(rubric.modified_at) : null);
        onCancel();
        if (use_rubric) {
          setShowSavedNotification(true);
        }
        onSaved?.({ rubric_data: rubricData, aiGradingStats: data.aiGradingStats ?? null });
      } else {
        window.location.replace(res.url);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="rubric-editor"
      className="card overflow-hidden mb-3"
      style={{ scrollMarginTop: '10px' }}
    >
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <input type="hidden" name="__action" value="modify_rubric_settings" />
      <input type="hidden" name="modified_at" value={modifiedAt?.toISOString() ?? ''} />
      <input type="hidden" name="starting_points" value={startingPoints} />
      <input type="hidden" name="max_extra_points" value={maxExtraPoints ?? ''} />
      <input type="hidden" name="min_points" value={minPoints ?? ''} />
      {openedFromGradingPanel ? (
        <div className="card-header d-flex align-items-center">
          <h2>Editing rubric</h2>
          {/* Also the toggle that the grading panel's "Edit rubric" link clicks to open the editor. */}
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm text-nowrap ms-auto"
            data-bs-toggle="collapse"
            data-bs-target="#rubric-setting"
            aria-controls="rubric-setting"
          >
            <i className="bi bi-arrow-left me-1" aria-hidden="true" />
            Back to grading
          </button>
        </div>
      ) : (
        <div className="card-header collapsible-card-header d-flex align-items-center">
          <h2>Rubric settings</h2>
          <button
            type="button"
            className="expand-icon-container btn btn-secondary btn-sm text-nowrap ms-auto collapsed"
            data-bs-toggle="collapse"
            data-bs-target="#rubric-setting"
            aria-expanded="false"
            aria-controls="rubric-setting"
            aria-label="Toggle rubric settings"
          >
            <i className="bi bi-chevron-up ms-1 expand-icon" aria-hidden="true" />
          </button>
        </div>
      )}
      <div
        id="rubric-setting"
        className="js-collapsible-card-body p-2 collapse"
        style={{ scrollMarginTop: '10px' }}
      >
        {/* While a save is in flight, lock the whole panel so subsequent edits
            can't be lost to the in-progress request. */}
        <fieldset disabled={isSubmitting} className="border-0 p-0 m-0">
          {/* Settings */}
          <div className="row g-4 mb-3">
            <div className="col-12 col-lg-6">
              <h3 className="h6 fw-semibold mb-2">Scoring</h3>
              {assessmentQuestion.max_auto_points != null &&
                assessmentQuestion.max_auto_points > 0 && (
                  <div className="mb-3" role="radiogroup" aria-labelledby={`${settingsId}-apply`}>
                    <div id={`${settingsId}-apply`} className="form-label mb-1">
                      Apply rubric to
                    </div>
                    <div className="form-check">
                      <label className="form-check-label">
                        <input
                          className="form-check-input"
                          type="radio"
                          checked={!replaceAutoPoints}
                          disabled={!hasCourseInstancePermissionEdit}
                          onChange={() => {
                            setReplaceAutoPoints(false);
                            if (startingPoints !== 0) {
                              setStartingPoints(assessmentQuestion.max_manual_points ?? 0);
                            }
                          }}
                        />
                        Manual points (out of {assessmentQuestion.max_manual_points}, keep auto
                        points)
                      </label>
                      <InfoButton
                        label="More information about applying rubric to manual points"
                        title="If the rubric is applied to manual points only, then a student's auto points are kept, and the rubric items will be added to (or subtracted from) the autograder results."
                      />
                    </div>
                    <div className="form-check">
                      <label className="form-check-label">
                        <input
                          className="form-check-input"
                          type="radio"
                          checked={replaceAutoPoints}
                          disabled={!hasCourseInstancePermissionEdit}
                          onChange={() => {
                            setReplaceAutoPoints(true);
                            if (startingPoints !== 0) {
                              setStartingPoints(assessmentQuestion.max_points ?? 0);
                            }
                          }}
                        />
                        Total points (out of {assessmentQuestion.max_points}, ignore auto points)
                      </label>
                      <InfoButton
                        label="More information about applying rubric to total points"
                        title={`If the rubric is applied to total points, then a student's auto points will be ignored, and the rubric items will be based on the total points of the question (${assessmentQuestion.max_points} points).`}
                      />
                    </div>
                  </div>
                )}

              <div className="mb-3" role="radiogroup" aria-labelledby={`${settingsId}-start`}>
                <div id={`${settingsId}-start`} className="form-label mb-1">
                  Grading mode
                  <InfoButton
                    label="More information about grading mode"
                    title="This setting only affects starting points. Rubric items may always be added with positive or negative points."
                  />
                </div>
                <div className="form-check">
                  <label className="form-check-label">
                    <input
                      className="form-check-input"
                      type="radio"
                      checked={startingPoints === 0}
                      disabled={!hasCourseInstancePermissionEdit}
                      onChange={() => setStartingPoints(0)}
                    />
                    Positive grading (start at zero, add points)
                  </label>
                </div>
                <div className="form-check">
                  <label className="form-check-label">
                    <input
                      className="form-check-input"
                      type="radio"
                      checked={startingPoints !== 0}
                      disabled={!hasCourseInstancePermissionEdit}
                      onChange={() =>
                        setStartingPoints(
                          replaceAutoPoints
                            ? (assessmentQuestion.max_points ?? 0)
                            : (assessmentQuestion.max_manual_points ?? 0),
                        )
                      }
                    />
                    Negative grading (start at{' '}
                    {replaceAutoPoints
                      ? assessmentQuestion.max_points
                      : assessmentQuestion.max_manual_points}
                    , subtract penalties)
                  </label>
                </div>
              </div>

              <div className="row g-3 mb-3">
                <div className="col-6">
                  <label className="form-label mb-1" htmlFor={`${settingsId}-min`}>
                    Minimum rubric score
                  </label>
                  <InfoButton
                    label="More information about minimum rubric score"
                    title="By default, penalties applied by rubric items cannot cause the rubric to have negative points. This value overrides this limit, e.g., for penalties that affect auto points or the assessment as a whole."
                  />
                  <input
                    id={`${settingsId}-min`}
                    className="form-control"
                    type="number"
                    value={minPoints ?? ''}
                    disabled={!hasCourseInstancePermissionEdit}
                    required
                    onInput={({ currentTarget }) =>
                      setMinPoints(
                        currentTarget.value.length > 0 ? Number(currentTarget.value) : null,
                      )
                    }
                  />
                </div>
                <div className="col-6">
                  <label className="form-label mb-1" htmlFor={`${settingsId}-max`}>
                    Maximum extra credit
                  </label>
                  <InfoButton
                    label="More information about maximum extra credit"
                    title="By default, points are limited to the maximum points assigned to the question, and credit assigned by rubric items do not violate this limit. This value allows rubric points to extend beyond this limit, e.g., for bonus credit."
                  />
                  <input
                    id={`${settingsId}-max`}
                    className="form-control"
                    type="number"
                    value={maxExtraPoints ?? ''}
                    disabled={!hasCourseInstancePermissionEdit}
                    required
                    onInput={({ currentTarget }) =>
                      setMaxExtraPoints(
                        currentTarget.value.length > 0 ? Number(currentTarget.value) : null,
                      )
                    }
                  />
                </div>
              </div>

              {/* Applies to the next save rather than being stored with the rubric. */}
              <div className="form-check border-top pt-2">
                <label className="form-check-label">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={tagForGrading}
                    disabled={!hasCourseInstancePermissionEdit}
                    onChange={() => setTagForGrading(!tagForGrading)}
                  />
                  Require all graded submissions to be manually graded/reviewed
                </label>
                <InfoButton
                  label="More information about requiring manual grading"
                  title="Changes in rubric item values update the points for all previously graded submissions. If this option is selected, these submissions will also be tagged for manual grading, requiring a review by a grader."
                />
              </div>
            </div>

            <div className="col-12 col-lg-6 d-flex flex-column">
              <label className="h6 fw-semibold mb-2" htmlFor="grader_guidelines">
                Grader guidelines{' '}
                <span className="small fw-normal text-muted">(not shown to students)</span>
              </label>
              <textarea
                id="grader_guidelines"
                name="grader_guidelines"
                className="form-control flex-grow-1"
                style={{ minHeight: '6rem' }}
                rows={5}
                value={graderGuidelines}
                disabled={!hasCourseInstancePermissionEdit}
                onChange={(e) => setGraderGuidelines(e.currentTarget.value)}
              />
              {params.length > 0 && (
                <div className="small text-muted mt-2">
                  Variables for the student's variant, usable in rubric items (click to copy):
                  <div
                    className="d-flex flex-wrap gap-1 mt-1"
                    style={{ maxHeight: '4.5rem', overflowY: 'auto' }}
                  >
                    {params.map((param) => (
                      <button
                        key={param}
                        type="button"
                        className="btn btn-sm btn-light border py-0 px-1"
                        onClick={(e) => copyMustachePattern(e, param)}
                      >
                        <code>{param}</code>
                      </button>
                    ))}
                  </div>
                  {copyPopoverTarget && (
                    <Overlay target={copyPopoverTarget} placement="top" show>
                      {(props) => (
                        <Popover {...props}>
                          <Popover.Body>Copied!</Popover.Body>
                        </Popover>
                      )}
                    </Overlay>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Rubric table */}
          <div className="table-responsive">
            <DndContext
              sensors={dragSensors}
              collisionDetection={verticalBoundaryCollision}
              // Rows are hidden when a drag starts, so keep measuring the rows
              // that are left instead of using their positions from before.
              measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
              accessibility={{
                screenReaderInstructions: {
                  draggable:
                    'To pick up a rubric row, press space or enter. Use the up and down arrow keys to move it, and the right and left arrow keys to move it into or out of a group. Press space or enter again to drop it, or escape to cancel.',
                },
                // Where the row will land is announced by the live region below,
                // which follows the latest drag position.
                announcements: {
                  onDragStart: () => undefined,
                  onDragMove: () => undefined,
                  onDragOver: () => undefined,
                  onDragEnd: () => 'Dropped.',
                  onDragCancel: () => 'Moving cancelled.',
                },
              }}
              onDragStart={({ active }) => {
                setActiveDragKey(String(active.id));
                setOverDragKey(String(active.id));
              }}
              onDragOver={({ over }) => setOverDragKey(over ? String(over.id) : null)}
              onDragMove={({ delta }) => setDragOffsetX(delta.x)}
              onDragEnd={onDragEnd}
              onDragCancel={endDrag}
            >
              <div
                className={clsx('small text-primary mb-2', !isKeyboardDrag && 'visually-hidden')}
                aria-live="assertive"
                data-testid="rubric-drop-status"
              >
                {describeDrop()}
                {isKeyboardDrag &&
                  ' Use the arrow keys to move it, space or enter to drop it, or escape to cancel.'}
              </div>
              <table className="table table-sm border-bottom mb-3" aria-label="Rubric items">
                <thead>
                  <tr className="table-light fw-bold">
                    <td style={{ width: '1px' }} />
                    <td>Points</td>
                    <td className="text-nowrap">
                      Key
                      <InfoButton
                        label="More information about keyboard shortcuts"
                        title="The key that selects the item while grading. Leave blank to use the next free digit, shown in gray."
                      />
                    </td>
                    <td>Description</td>
                    <td>Detailed explanation</td>
                    <td>Grader note</td>
                    <td>
                      Always show
                      <InfoButton
                        label="More information about showing items to students"
                        title="Students always see checked items. They see unchecked items only when the item is selected for their submission."
                      />
                    </td>
                    {showAiGradingStats ? <td>AI agreement</td> : <td>In use</td>}
                    {hasCourseInstancePermissionEdit && (
                      <td className="rubric-actions-cell" style={{ width: '1px' }}>
                        <span className="visually-hidden">Actions</span>
                      </td>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rubricItems.length > 0 ? (
                    <SortableContext
                      items={rubricItems
                        .filter((_, idx) => !isHidden(idx))
                        .map((it) => it.unique_key)}
                      strategy={verticalListSortingStrategy}
                    >
                      {displayRows.map((row, position) => {
                        if (row.kind === 'add') {
                          return (
                            <AddToGroupRow
                              key={`add-${rubricItems[row.groupIdx].unique_key}`}
                              groupDepth={rubricItems[row.groupIdx].depth}
                              groupName={rubricItems[row.groupIdx].rubric_item.description}
                              guides={guides[position]}
                              columnCount={columnCount}
                              subgroupBlocker={subgroupBlocker(rubricItems, row.groupIdx)}
                              onAddItem={() => addItemToGroup(row.groupIdx)}
                              onAddGroup={() => addSubgroup(row.groupIdx)}
                            />
                          );
                        }
                        const { idx } = row;
                        const it = rubricItems[idx];
                        return (
                          <RubricRow
                            key={it.unique_key}
                            item={it}
                            isKeyboardDragging={isKeyboardDrag && idx === activeDragIdx}
                            dropIndicator={
                              isKeyboardDrag &&
                              it.unique_key === overDragKey &&
                              overDragKey !== activeDragKey
                                ? idx < activeDragIdx
                                  ? 'before'
                                  : 'after'
                                : null
                            }
                            dragState={
                              idx !== activeDragIdx
                                ? null
                                : dropProjection
                                  ? { depth: dropProjection.depth }
                                  : 'invalid'
                            }
                            guides={guides[position]}
                            hasChildren={(displayRows.at(position + 1)?.depth ?? -1) > it.depth}
                            collapse={
                              it.rubric_item.is_group && subtreeEnd(rubricItems, idx) > idx + 1
                                ? {
                                    isCollapsed: isCollapsedGroup(idx),
                                    itemCount: rubricItems
                                      .slice(idx + 1, subtreeEnd(rubricItems, idx))
                                      .filter((child) => !child.rubric_item.is_group).length,
                                    toggle: () => toggleCollapsed(it.unique_key),
                                  }
                                : null
                            }
                            pointRange={
                              it.rubric_item.is_group && subtreeEnd(rubricItems, idx) > idx + 1
                                ? rubricPointRange(
                                    rubricItems
                                      .slice(idx, subtreeEnd(rubricItems, idx))
                                      .map((row) => ({ ...row, depth: row.depth - it.depth })),
                                  )
                                : null
                            }
                            warning={groupWarning(rubricItems, idx)}
                            showAiGradingStats={showAiGradingStats}
                            submissionCount={aiGradingStats?.submission_rubric_count ?? 0}
                            hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
                            ruleDisabled={it.rubric_item.is_group && hasSubgroup(rubricItems, idx)}
                            keyBinding={{ automatic: automaticKeys[idx], error: keyErrors[idx] }}
                            deleteRow={() => requestDeleteRow(idx)}
                            sortByPoints={
                              // Only groups of two or more items, without subgroups, can be sorted.
                              it.rubric_item.is_group &&
                              !hasSubgroup(rubricItems, idx) &&
                              subtreeEnd(rubricItems, idx) - idx > 2
                                ? {
                                    sortedHighestFirst: isSortedHighestFirst(rubricItems, idx),
                                    sort: () => sortGroupByPoints(idx),
                                  }
                                : null
                            }
                            updateRubricItem={(patch) => updateRubricItem(idx, patch)}
                            onHandleKeyDown={(event) => onDragHandleKeyDown(it.unique_key, event)}
                          />
                        );
                      })}
                    </SortableContext>
                  ) : (
                    <tr>
                      <td colSpan={columnCount} className="text-muted py-3">
                        This question does not have any rubric items.
                        {hasCourseInstancePermissionEdit && (
                          <>
                            {' '}
                            <button
                              type="button"
                              className="btn btn-link p-0 align-baseline text-decoration-none"
                              onClick={addRubricItemRow}
                            >
                              Add item
                            </button>
                            {wasUsingRubric && (
                              <>
                                , or{' '}
                                <button
                                  type="button"
                                  className="btn btn-link p-0 align-baseline text-decoration-none"
                                  onClick={() => submitSettings(false)}
                                >
                                  Disable rubric
                                </button>{' '}
                                to switch back to manual grade input.
                              </>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="table-light">
                  <tr>
                    <td colSpan={columnCount}>
                      <div className="d-flex flex-wrap column-gap-4 row-gap-1 small">
                        <span>
                          <span className="fw-semibold">Max score from items:</span> {totalPositive}{' '}
                          / {maxPoints} points
                          {maxPointsShortfall > 0 && rubricItems.length > 0 && (
                            <span className="ms-2">
                              <WarningIndicator
                                tooltipId="rubric-max-shortfall"
                                label={`${maxPointsShortfall} below maximum`}
                                body={`Selecting items can reach at most ${totalPositive} of the ${maxPoints} points for this question.`}
                              />
                            </span>
                          )}
                        </span>
                        <span>
                          <span className="fw-semibold">Min score from items:</span> {totalNegative}{' '}
                          / {minRubricScore} points
                          {minPointsShortfall > 0 && rubricItems.length > 0 && (
                            <span className="ms-2">
                              <WarningIndicator
                                tooltipId="rubric-min-shortfall"
                                label={`${minPointsShortfall} above minimum`}
                                body={`Selecting items can go down to ${totalNegative} points, above the minimum score of ${minRubricScore}.`}
                              />
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
              <DragOverlay dropAnimation={null}>
                {activeDragIdx === -1 ? null : (
                  <RubricDragPreview item={rubricItems[activeDragIdx]} />
                )}
              </DragOverlay>
            </DndContext>
          </div>

          <DeleteGroupModal
            rows={rubricItems}
            groupIndex={groupToDelete}
            onCancel={() => setGroupToDelete(null)}
            onConfirm={() => {
              if (groupToDelete != null) deleteRow(groupToDelete);
              setGroupToDelete(null);
            }}
          />

          <Alert
            show={showSavedNotification}
            variant="success"
            role="status"
            aria-live="polite"
            dismissible
            onClose={() => setShowSavedNotification(false)}
          >
            Rubric saved
          </Alert>
          {settingsError && (
            <Alert
              key={settingsError}
              variant="danger"
              dismissible
              onClose={() => setSettingsError(null)}
            >
              {settingsError}
            </Alert>
          )}

          <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
            {hasCourseInstancePermissionEdit && rubricItems.length > 0 && (
              <>
                <button type="button" className="btn btn-secondary" onClick={addRubricItemRow}>
                  Add item
                </button>
                <button type="button" className="btn btn-secondary" onClick={addGroupRow}>
                  Add group
                </button>
              </>
            )}
            <button type="button" className="btn btn-primary" onClick={exportRubric}>
              <i className="bi bi-download" aria-hidden="true" /> Export rubric
            </button>
            {hasCourseInstancePermissionEdit && (
              <button
                id="import-rubric-button"
                type="button"
                className="btn btn-primary"
                onClick={() => setShowImportModal(!showImportModal)}
              >
                <i className="bi bi-upload" aria-hidden="true" /> Import rubric
              </button>
            )}
            <Modal
              show={showImportModal}
              size="lg"
              onHide={closeImportModal}
              onExited={resetImportModal}
            >
              <Modal.Header closeButton>
                <Modal.Title>Import rubric settings</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <label className="form-label" htmlFor="rubric-settings-file-input">
                  Choose file
                </label>
                <input
                  ref={rubricFileRef}
                  type="file"
                  name="file"
                  className="form-control"
                  id="rubric-settings-file-input"
                  accept="application/json,.json"
                  required
                />
                {importModalWarning && (
                  <div
                    key={importModalWarning}
                    className="alert alert-warning alert-dismissible fade show"
                    role="alert"
                  >
                    {importModalWarning}
                    <button
                      type="button"
                      className="btn-close"
                      aria-label="Close"
                      onClick={() => setImportModalWarning(null)}
                    />
                  </div>
                )}
              </Modal.Body>
              <Modal.Footer>
                <button type="button" className="btn btn-secondary" onClick={closeImportModal}>
                  Cancel
                </button>
                <button
                  id="upload-rubric-file-button"
                  type="button"
                  className="btn btn-primary"
                  onClick={() => importRubric()}
                >
                  Upload file
                </button>
              </Modal.Footer>
            </Modal>
            {hasCourseInstancePermissionEdit && (
              <InfoButton
                label="More information about importing rubrics"
                title="Imported rubric point values will be scaled to match the maximum points for this question."
              />
            )}
            {hasCourseInstancePermissionEdit && (
              <div className="ms-auto d-flex gap-2">
                {wasUsingRubric && (
                  <button
                    type="button"
                    className="btn btn-outline-danger"
                    onClick={() => setShowDeleteConfirmModal(true)}
                  >
                    Delete rubric
                  </button>
                )}
                <Modal
                  show={showDeleteConfirmModal}
                  onHide={() => setShowDeleteConfirmModal(false)}
                >
                  <Modal.Header closeButton>
                    <Modal.Title>Delete rubric?</Modal.Title>
                  </Modal.Header>
                  <Modal.Body>
                    This will remove the rubric and clear any rubric-derived scores from previously
                    graded submissions. This action cannot be undone.
                  </Modal.Body>
                  <Modal.Footer>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowDeleteConfirmModal(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => {
                        setShowDeleteConfirmModal(false);
                        void submitSettings(false);
                      }}
                    >
                      Delete rubric
                    </button>
                  </Modal.Footer>
                </Modal>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!isDirty || isSubmitting}
                  onClick={onCancel}
                >
                  Discard changes
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!isDirty || isSubmitting}
                  onClick={() => submitSettings(true)}
                >
                  <i className="bi bi-floppy" aria-hidden="true" /> Save
                </button>
              </div>
            )}
          </div>
        </fieldset>
      </div>
    </div>
  );
}

/**
 * The key that selects an item while grading. Blank uses the automatic key,
 * shown as the placeholder.
 */
function KeyBindingInput({
  customKey,
  automaticKey,
  error,
  disabled,
  onChange,
}: {
  customKey: string | null;
  automaticKey: string | null;
  error: string | null;
  disabled: boolean;
  onChange: (key: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  // Use native validity too, so saving and exporting stop at an invalid key
  // the same way they stop at other invalid fields.
  useEffect(() => {
    inputRef.current?.setCustomValidity(error ?? '');
  }, [error]);
  return (
    <div className="position-relative">
      <input
        ref={inputRef}
        type="text"
        className={clsx('form-control text-center', error && 'is-invalid')}
        // Bootstrap's invalid icon would cover the key in such a narrow box.
        style={{ width: '3rem', paddingInline: '0.25rem', backgroundImage: 'none' }}
        maxLength={1}
        value={customKey?.toUpperCase() ?? ''}
        placeholder={automaticKey?.toUpperCase() ?? '–'}
        title={automaticKey ? undefined : 'No free digit is left. Choose a key for this item.'}
        aria-label="Keyboard shortcut"
        aria-invalid={error ? true : undefined}
        aria-errormessage={error ? errorId : undefined}
        disabled={disabled}
        onChange={(e) => onChange(normalizeKeyBinding(e.currentTarget.value))}
      />
      {error && (
        <div
          id={errorId}
          className="invalid-tooltip"
          style={{ width: 'max-content', maxWidth: '16rem' }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function InfoButton({ label, title }: { label: string; title: string }) {
  const tooltipId = useId();
  return (
    <OverlayTrigger placement="bottom" tooltip={{ props: { id: tooltipId }, body: title }}>
      <button type="button" className="btn btn-sm btn-ghost py-0 px-1" aria-label={label}>
        <i className="bi bi-question-circle text-muted" aria-hidden="true" />
      </button>
    </OverlayTrigger>
  );
}

/**
 * A one-line text box that opens up while it is being edited, so that rubric
 * rows stay short but longer text is still comfortable to write.
 */
function RubricRowTextarea({
  value,
  label,
  disabled,
  onChange,
}: {
  value: string;
  label: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [isFocused, setIsFocused] = useState(false);
  return (
    <textarea
      className="form-control"
      rows={isFocused ? 4 : 1}
      /**
       * In one of the previous versions, explanation wasn't displayed correctly
       * when used this way. We fixed it by making the textarea uncontrolled and
       * putting the explanation text in the body of the textarea element.
       * However, this method will not work well with "Discard changes".
       */
      value={value}
      maxLength={10000}
      style={{ minWidth: '12rem' }}
      aria-label={label}
      disabled={disabled}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onInput={(e) => onChange(e.currentTarget.value)}
    />
  );
}

function RubricRow({
  item,
  dragState,
  onHandleKeyDown,
  isKeyboardDragging,
  dropIndicator,
  guides,
  hasChildren,
  collapse,
  pointRange,
  warning,
  showAiGradingStats,
  submissionCount,
  ruleDisabled,
  deleteRow,
  keyBinding,
  sortByPoints,
  updateRubricItem,
  hasCourseInstancePermissionEdit,
}: {
  item: RubricItemData;
  /** While this row is dragged: the depth it will land at, or 'invalid' if it can't be dropped here. */
  dragState: { depth: number } | 'invalid' | null;
  onHandleKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  isKeyboardDragging: boolean;
  /** While dragging with the keyboard: the row lands just before or after this one. */
  dropIndicator: 'before' | 'after' | null;
  guides: TreeGuide[];
  hasChildren: boolean;
  /** For groups: whether the contents are hidden (collapsed, or while dragging the group). */
  collapse: { isCollapsed: boolean; itemCount: number; toggle: () => void } | null;
  /** For groups: the points that selecting items inside could add. */
  pointRange: { min: number; max: number } | null;
  warning: { label: string; body: string } | null;
  showAiGradingStats: boolean;
  submissionCount: number;
  ruleDisabled: boolean;
  deleteRow: () => void;
  /** The key the item gets if it has no custom key, and what's wrong with its custom key. */
  keyBinding: { automatic: string | null; error: string | null };
  sortByPoints: { sortedHighestFirst: boolean; sort: () => void } | null;
  updateRubricItem: (patch: Partial<RubricItemData['rubric_item']>) => void;
  hasCourseInstancePermissionEdit: boolean;
}) {
  const isGroup = item.rubric_item.is_group;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.unique_key,
    disabled: !hasCourseInstancePermissionEdit,
  });
  // While dragged, the row is drawn at the depth it will land at.
  const depth = dragState != null && dragState !== 'invalid' ? dragState.depth : item.depth;
  const [isEditing, setIsEditing] = useState(false);
  const sortLabel = sortByPoints?.sortedHighestFirst
    ? 'Sort items by points, lowest first'
    : 'Sort items by points, highest first';
  return (
    <tr
      ref={setNodeRef}
      style={{
        // Group rows are tinted with their level's color.
        ...(isGroup && {
          '--bs-table-bg': groupTint(depth),
        }),
        opacity: isDragging ? 0.5 : undefined,
        ...(dragState === 'invalid' && { '--bs-table-bg-state': 'var(--bs-danger-bg-subtle)' }),
        // Use Translate, not Transform: dnd-kit's full transform includes scaleX/scaleY,
        // which visually warps variable-height rows.
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={clsx(
        'tree-row rubric-editor-row',
        dropIndicator && `rubric-drop-${dropIndicator}`,
      )}
      data-rubric-key={item.unique_key}
      data-testid={isGroup ? 'rubric-editor-group' : 'rubric-editor-item'}
      // Highlight the whole row while one of its fields has focus.
      onFocus={() => setIsEditing(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setIsEditing(false);
      }}
    >
      <td
        className={clsx(
          'text-nowrap align-middle position-relative',
          warning && 'tree-row-warning-indicator',
        )}
      >
        {dragState == null && (
          <TreeGuideLines
            guides={guides}
            groupDepth={isGroup && hasChildren && !collapse?.isCollapsed ? item.depth : null}
          />
        )}
        <div
          className="d-flex align-items-center"
          style={{ paddingLeft: `${depth * TREE_INDENT}px` }}
        >
          {hasCourseInstancePermissionEdit ? (
            <DragHandle
              attributes={{
                ...attributes,
                'aria-pressed': isKeyboardDragging || attributes['aria-pressed'],
              }}
              listeners={{ ...listeners, onKeyDown: onHandleKeyDown }}
              // The handle is as wide as one indent level, so that the guide
              // lines run down from the middle of a group's handle.
              className="d-inline-flex justify-content-center"
              style={{ width: `${TREE_INDENT}px` }}
            />
          ) : (
            <span className="d-inline-block" style={{ width: `${TREE_INDENT}px` }} />
          )}
          {collapse && (
            <CollapseToggleButton
              isCollapsed={collapse.isCollapsed}
              ariaLabel={`${collapse.isCollapsed ? 'Expand' : 'Collapse'} ${item.rubric_item.description || 'group'}`}
              onToggle={collapse.toggle}
            />
          )}
        </div>
        {item.rubric_item.id && (
          <>
            <input
              type="hidden"
              name={`rubric_item[${item.rubric_item.id}][id]`}
              value={item.rubric_item.id}
            />
            <input
              type="hidden"
              name={`rubric_item[${item.rubric_item.id}][points]`}
              value={item.rubric_item.points ?? ''}
            />
            <input
              type="hidden"
              name={`rubric_item[${item.rubric_item.id}][description]`}
              value={item.rubric_item.description}
            />
            <input
              type="hidden"
              name={`rubric_item[${item.rubric_item.id}][explanation]`}
              value={b64EncodeUnicode(item.rubric_item.explanation ?? '')}
            />
            <input
              type="hidden"
              name={`rubric_item[${item.rubric_item.id}][grader_note]`}
              value={b64EncodeUnicode(item.rubric_item.grader_note ?? '')}
            />
            <input
              type="hidden"
              name={`rubric_item[${item.rubric_item.id}][always_show_to_students]`}
              value={item.rubric_item.always_show_to_students ? 'true' : 'false'}
            />
          </>
        )}
      </td>

      <td className="align-middle">
        {isGroup ? (
          <SelectionRuleInput
            item={item}
            disabled={!hasCourseInstancePermissionEdit || ruleDisabled}
            disabledReason={
              ruleDisabled ? 'Rules can only be set on groups that contain only items.' : null
            }
            updateRubricItem={updateRubricItem}
          />
        ) : (
          <input
            type="number"
            className="form-control"
            style={{ width: '5rem' }}
            step="any"
            value={item.rubric_item.points ?? ''}
            aria-label="Points"
            disabled={!hasCourseInstancePermissionEdit}
            required
            onInput={({ currentTarget }) =>
              updateRubricItem({
                // currentTarget.value will be an empty string if the input is not valid yet
                // so we can use this to check for partially done inputs such as just a "-" as well
                points: currentTarget.value.length > 0 ? Number(currentTarget.value) : null,
              })
            }
          />
        )}
      </td>

      <td className="align-middle">
        {!isGroup && (
          <KeyBindingInput
            customKey={item.rubric_item.key_binding}
            automaticKey={keyBinding.automatic}
            error={keyBinding.error}
            disabled={!hasCourseInstancePermissionEdit}
            onChange={(key_binding) => updateRubricItem({ key_binding })}
          />
        )}
      </td>

      <td className="align-middle">
        <div className="d-flex align-items-center gap-2" style={{ paddingLeft: `${depth}rem` }}>
          <input
            type="text"
            className={clsx('form-control', isGroup && 'fw-semibold')}
            maxLength={100}
            style={{ minWidth: '12rem' }}
            value={item.rubric_item.description}
            placeholder={isGroup ? 'Group name' : undefined}
            aria-label={isGroup ? 'Group name' : 'Description'}
            disabled={!hasCourseInstancePermissionEdit}
            required
            onInput={(e) => updateRubricItem({ description: e.currentTarget.value })}
          />
          {isGroup && (
            <span className="d-inline-flex align-items-center gap-1 flex-shrink-0">
              {warning && (
                <WarningIndicator
                  tooltipId={`${item.unique_key}-warning`}
                  label={warning.label}
                  body={warning.body}
                />
              )}
              {collapse?.isCollapsed && (
                <span className="badge color-blue3">
                  {collapse.itemCount} item{collapse.itemCount === 1 ? '' : 's'}
                </span>
              )}
              {pointRange && (
                <OverlayTrigger
                  placement="top"
                  tooltip={{
                    props: { id: `${item.unique_key}-points` },
                    body: 'Points that selecting items in this group can add, following its rules',
                  }}
                >
                  <button type="button" className="btn btn-badge color-blue3 text-nowrap">
                    {formatPointRange(pointRange)}
                  </button>
                </OverlayTrigger>
              )}
            </span>
          )}
        </div>
      </td>

      <td className="align-middle">
        <RubricRowTextarea
          value={item.rubric_item.explanation ?? ''}
          label="Explanation"
          disabled={!hasCourseInstancePermissionEdit}
          onChange={(explanation) => updateRubricItem({ explanation })}
        />
      </td>

      <td className="align-middle">
        <RubricRowTextarea
          value={item.rubric_item.grader_note ?? ''}
          label="Grader note"
          disabled={!hasCourseInstancePermissionEdit}
          onChange={(grader_note) => updateRubricItem({ grader_note })}
        />
      </td>

      <td className="align-middle text-center">
        <input
          type="checkbox"
          className="form-check-input"
          checked={item.rubric_item.always_show_to_students}
          aria-label="Always show to students"
          disabled={!hasCourseInstancePermissionEdit}
          onChange={(e) => updateRubricItem({ always_show_to_students: e.currentTarget.checked })}
        />
      </td>

      {isGroup ? (
        <td className="align-middle text-muted">&mdash;</td>
      ) : showAiGradingStats ? (
        <td className="align-middle">
          {submissionCount === 0 ? (
            <span>&mdash;</span>
          ) : item.disagreement_count == null ? (
            <span>New</span>
          ) : item.disagreement_count ? (
            <>
              <i className="bi bi-x-square-fill text-danger" aria-hidden="true" />{' '}
              <span className="text-muted">
                ({item.disagreement_count}/{submissionCount} disagree)
              </span>
            </>
          ) : (
            <>
              <i className="bi bi-check-square-fill text-success" aria-hidden="true" />
              <span className="visually-hidden">All submissions agree</span>
            </>
          )}
        </td>
      ) : (
        <td className="text-nowrap align-middle">
          {item.num_submissions == null
            ? 'New'
            : item.num_submissions === 0
              ? 'No'
              : item.num_submissions === 1
                ? '1 submission'
                : `${item.num_submissions} submissions`}
        </td>
      )}

      {hasCourseInstancePermissionEdit && (
        <td className="rubric-actions-cell align-middle text-nowrap text-end">
          {/* Shown while the row is hovered or being edited, like the assessment question editor. */}
          <div className={clsx('d-inline-flex', !isEditing && 'hover-show')}>
            {isGroup && (
              <button
                type="button"
                className="btn btn-sm border-0 text-muted"
                aria-label={sortLabel}
                title={sortByPoints ? sortLabel : 'Groups of two or more items can be sorted'}
                disabled={!sortByPoints}
                onClick={sortByPoints?.sort}
              >
                <i
                  className={clsx(
                    'bi',
                    sortByPoints?.sortedHighestFirst
                      ? 'bi-sort-numeric-down'
                      : 'bi-sort-numeric-down-alt',
                  )}
                  aria-hidden="true"
                />
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm border-0 text-muted tree-delete-btn"
              aria-label={isGroup ? 'Delete group and its items' : 'Delete'}
              title={isGroup ? 'Delete group and its items' : 'Delete item'}
              onClick={deleteRow}
            >
              <i className="bi bi-trash3" aria-hidden="true" />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

/** What follows the pointer while a row is dragged, styled like the assessment question editor's. */
function RubricDragPreview({ item }: { item: RubricItemData }) {
  const isGroup = item.rubric_item.is_group;
  return (
    <div
      className={clsx(
        'd-inline-block border rounded shadow-sm px-3 py-2',
        isGroup ? 'bg-body-secondary fw-semibold' : 'bg-body',
      )}
    >
      {item.rubric_item.description || (isGroup ? 'Untitled group' : 'Untitled item')}
    </div>
  );
}

/** "Up to 3 pts", or "-1 to 3 pts" when items can also take points away. */
function formatPointRange({ min, max }: { min: number; max: number }) {
  const round = (points: number) => Math.round(points * 100) / 100;
  return min < 0 ? `${round(min)} to ${round(max)} pts` : `Up to ${round(max)} pts`;
}

/**
 * Draws a row's part of the tree in the first column: a line for each
 * enclosing group, colored like that group's level, with a branch into this
 * row's drag handle from its parent. A group with children also starts its own
 * line below its handle. The lines meet across rows, since each one spans the
 * full cell.
 */
function TreeGuideLines({
  guides,
  groupDepth,
}: {
  guides: TreeGuide[];
  groupDepth: number | null;
}) {
  const lineX = (level: number) => `calc(0.25rem + ${level * TREE_INDENT + TREE_INDENT / 2 - 1}px)`;
  const lineColor = (level: number) =>
    `color-mix(in srgb, ${nestingLevelColor(level)} 60%, transparent)`;
  const line = (key: string, level: number, style: CSSProperties) => (
    <div
      key={key}
      className="position-absolute pe-none"
      style={{ left: lineX(level), background: lineColor(level), ...style }}
      aria-hidden="true"
    />
  );
  return (
    <>
      {guides.flatMap((guide, level) => {
        if (guide === 'none') return [];
        const vertical = line(`v${level}`, level, {
          top: 0,
          bottom: guide === 'end' ? '50%' : '-1px',
          width: '2px',
        });
        if (guide === 'pass') return [vertical];
        return [
          vertical,
          line(`h${level}`, level, {
            top: 'calc(50% - 1px)',
            height: '2px',
            // Reaches to just before the child's grip, which is narrower than its handle.
            width: `${TREE_INDENT / 2 + 7}px`,
          }),
        ];
      })}
      {groupDepth != null &&
        line('group', groupDepth, { top: 'calc(50% + 0.6rem)', bottom: '-1px', width: '2px' })}
    </>
  );
}

type DisplayRow =
  | { kind: 'row'; idx: number; depth: number; rubric_item: RubricItemData['rubric_item'] }
  | { kind: 'add'; groupIdx: number; depth: number; rubric_item: EditorTreeRow['rubric_item'] };

/**
 * The rows the table shows, in order: each rubric row, plus (when editing is
 * allowed) an "Add item" row at the end of each group. Treating the add rows
 * as the groups' last children lets the guide lines run down to them.
 */
function buildDisplayRows(
  rows: RubricItemData[],
  {
    withAddRows,
    isHidden,
    isCollapsedGroup,
  }: {
    withAddRows: boolean;
    isHidden: (idx: number) => boolean;
    /** A group whose contents are hidden, such as one being dragged, gets no add row. */
    isCollapsedGroup: (idx: number) => boolean;
  },
): DisplayRow[] {
  const display: DisplayRow[] = [];
  const openGroups: number[] = [];
  const closeGroupsTo = (depth: number) => {
    while (openGroups.length > 0) {
      const groupIdx = openGroups[openGroups.length - 1];
      if (rows[groupIdx].depth < depth) break;
      openGroups.pop();
      display.push({
        kind: 'add',
        groupIdx,
        depth: rows[groupIdx].depth + 1,
        rubric_item: { is_group: false, points: null, min_selections: null, max_selections: null },
      });
    }
  };
  rows.forEach((row, idx) => {
    if (isHidden(idx)) return;
    closeGroupsTo(row.depth);
    display.push({ kind: 'row', idx, depth: row.depth, rubric_item: row.rubric_item });
    if (withAddRows && row.rubric_item.is_group && !isCollapsedGroup(idx)) openGroups.push(idx);
  });
  closeGroupsTo(0);
  return display;
}

/**
 * A shallow row at the end of a group for adding an item or a subgroup to it.
 * It is tinted like the group's own row, so the two rows bracket the group.
 */
function AddToGroupRow({
  groupDepth,
  groupName,
  guides,
  columnCount,
  subgroupBlocker,
  onAddItem,
  onAddGroup,
}: {
  groupDepth: number;
  groupName: string;
  guides: TreeGuide[];
  columnCount: number;
  /** Why a subgroup can't be added here, or null if it can. */
  subgroupBlocker: string | null;
  onAddItem: () => void;
  onAddGroup: () => void;
}) {
  const target = groupName ? `to ${groupName}` : 'to group';
  const blockerId = useId();
  const buttonClass =
    'btn btn-sm btn-link text-muted text-decoration-none px-0 py-0 d-inline-flex align-items-center';
  return (
    <tr style={{ '--bs-table-bg': groupTint(groupDepth) } as CSSProperties}>
      <td colSpan={columnCount} className="position-relative py-0">
        <TreeGuideLines guides={guides} groupDepth={null} />
        <div
          className="d-flex align-items-center gap-3"
          style={{ paddingLeft: `${(groupDepth + 1) * TREE_INDENT}px` }}
        >
          <button
            type="button"
            className={buttonClass}
            aria-label={`Add item ${target}`}
            onClick={onAddItem}
          >
            <span className="d-inline-block text-center" style={{ width: `${TREE_INDENT}px` }}>
              <i className="bi bi-plus-lg" aria-hidden="true" />
            </span>
            Add item
          </button>
          {subgroupBlocker == null ? (
            <button
              type="button"
              className={buttonClass}
              aria-label={`Add group ${target}`}
              onClick={onAddGroup}
            >
              <i className="bi bi-collection me-1" aria-hidden="true" />
              Add group
            </button>
          ) : (
            <>
              {/* Not `disabled`, which would block the hover and focus that show the reason. */}
              <OverlayTrigger
                trigger={['hover', 'focus']}
                placement="top"
                tooltip={{ body: subgroupBlocker, props: { id: `${blockerId}-tooltip` } }}
              >
                <button
                  type="button"
                  className={clsx(buttonClass, 'opacity-50')}
                  style={{ cursor: 'not-allowed' }}
                  aria-label={`Add group ${target}`}
                  aria-describedby={blockerId}
                  aria-disabled="true"
                >
                  <i className="bi bi-collection me-1" aria-hidden="true" />
                  Add group
                </button>
              </OverlayTrigger>
              <span id={blockerId} className="visually-hidden">
                {subgroupBlocker}
              </span>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

const TREE_INDENT = 24;

const NESTING_LEVEL_COLORS = ['var(--bs-primary)', 'var(--bs-purple)'];

function nestingLevelColor(level: number) {
  return NESTING_LEVEL_COLORS[level % NESTING_LEVEL_COLORS.length];
}

function groupTint(level: number) {
  return `color-mix(in srgb, ${nestingLevelColor(level)} 12%, var(--bs-body-bg))`;
}

function DeleteGroupModal({
  rows,
  groupIndex,
  onCancel,
  onConfirm,
}: {
  rows: RubricItemData[];
  groupIndex: number | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const group = groupIndex == null ? null : rows[groupIndex];
  const contents =
    groupIndex == null ? [] : rows.slice(groupIndex + 1, subtreeEnd(rows, groupIndex));
  const itemCount = contents.filter((row) => !row.rubric_item.is_group).length;
  const groupCount = contents.length - itemCount;
  const describeCount = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? '' : 's'}`;
  const contentsText = [
    itemCount > 0 && describeCount(itemCount, 'item'),
    groupCount > 0 && describeCount(groupCount, 'group'),
  ]
    .filter(Boolean)
    .join(' and ');

  return (
    <Modal show={group != null} onHide={onCancel}>
      <Modal.Header closeButton>
        <Modal.Title>Delete group?</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        Deleting{' '}
        {group?.rubric_item.description ? (
          <strong>{group.rubric_item.description}</strong>
        ) : (
          'this group'
        )}{' '}
        will also delete the {contentsText} inside it. To keep them, move them out of the group
        first. You can undo this with "Discard changes" until you save.
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-danger" onClick={onConfirm}>
          Delete group
        </button>
      </Modal.Footer>
    </Modal>
  );
}

type SelectionRulePreset = 'none' | 'up-to-one' | 'exactly-one' | 'at-least-one' | 'custom';

const SELECTION_RULE_PRESETS: Record<
  Exclude<SelectionRulePreset, 'custom'>,
  { label: string; min_selections: number | null; max_selections: number | null }
> = {
  none: { label: 'Any number', min_selections: null, max_selections: null },
  'up-to-one': { label: 'Up to one', min_selections: null, max_selections: 1 },
  'exactly-one': { label: 'Exactly one', min_selections: 1, max_selections: 1 },
  'at-least-one': { label: 'At least one', min_selections: 1, max_selections: null },
};

function SelectionRuleInput({
  item,
  disabled,
  disabledReason,
  updateRubricItem,
}: {
  item: RubricItemData;
  disabled: boolean;
  disabledReason: string | null;
  updateRubricItem: (patch: Partial<RubricItemData['rubric_item']>) => void;
}) {
  const { min_selections, max_selections } = item.rubric_item;
  const matchingPreset = (
    Object.entries(SELECTION_RULE_PRESETS) as [
      Exclude<SelectionRulePreset, 'custom'>,
      (typeof SELECTION_RULE_PRESETS)['none'],
    ][]
  ).find(
    ([, preset]) =>
      preset.min_selections === min_selections && preset.max_selections === max_selections,
  )?.[0];
  const [showCustom, setShowCustom] = useState(matchingPreset == null);
  const value: SelectionRulePreset = showCustom ? 'custom' : (matchingPreset ?? 'custom');
  const parseLimit = (input: string) => (input.length > 0 ? Number(input) : null);

  return (
    <div style={{ minWidth: '9rem' }} title={disabledReason ?? undefined}>
      <select
        className="form-select form-select-sm"
        aria-label="Items that can be selected"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const selected = e.currentTarget.value as SelectionRulePreset;
          setShowCustom(selected === 'custom');
          if (selected !== 'custom') {
            const { min_selections, max_selections } = SELECTION_RULE_PRESETS[selected];
            updateRubricItem({ min_selections, max_selections });
          }
        }}
      >
        {Object.entries(SELECTION_RULE_PRESETS).map(([key, preset]) => (
          <option key={key} value={key}>
            {preset.label}
          </option>
        ))}
        <option value="custom">Custom</option>
      </select>
      {value === 'custom' && (
        <div className="d-flex gap-1 mt-1">
          <input
            type="number"
            className="form-control form-control-sm"
            min={0}
            step={1}
            placeholder="Min"
            aria-label="Minimum selections"
            value={min_selections ?? ''}
            disabled={disabled}
            onInput={({ currentTarget }) =>
              updateRubricItem({ min_selections: parseLimit(currentTarget.value) })
            }
          />
          <input
            type="number"
            className="form-control form-control-sm"
            min={1}
            step={1}
            placeholder="Max"
            aria-label="Maximum selections"
            value={max_selections ?? ''}
            disabled={disabled}
            onInput={({ currentTarget }) =>
              updateRubricItem({ max_selections: parseLimit(currentTarget.value) })
            }
          />
        </div>
      )}
    </div>
  );
}

RubricSettings.displayName = 'RubricSettings';
