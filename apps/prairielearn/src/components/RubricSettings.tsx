import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { omit } from 'es-toolkit';
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Overlay, Popover } from 'react-bootstrap';
import { z } from 'zod';

import { downloadAsJSON, executeScripts, parseHTMLElement } from '@prairielearn/browser-utils';
import { run } from '@prairielearn/run';

import type { AiGradingGeneralStats } from '../ee/lib/ai-grading/types.js';
import { b64EncodeUnicode } from '../lib/base64-util.js';
import { dispatchInstanceQuestionGradingPanelUpdate } from '../lib/client/manual-grading-events.js';
import { mathjaxTypeset } from '../lib/client/mathjax.js';
import type { StaffAssessmentQuestion } from '../lib/client/safe-db-types.js';
import { isSideNavExpanded, setSideNavExpandedTemporarily } from '../lib/client/side-nav.js';
import { verticalBoundaryCollision } from '../lib/client/vertical-boundary-collision.js';
import type { RubricItem } from '../lib/db-types.js';
import type { RenderedRubricItem, RubricData } from '../lib/manualGrading.types.js';

import {
  canIndent,
  depthsFromParents,
  hasSubgroup,
  indent,
  moveAmongSiblings,
  moveToSibling,
  outdent,
  parentIndex,
  removeSubtree,
  rubricPointRange,
  subtreeEnd,
} from './RubricSettings.tree.js';

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
    a.max_selections === b.max_selections
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
  onSaved,
}: {
  hasCourseInstancePermissionEdit: boolean;
  assessmentQuestion: StaffAssessmentQuestion;
  rubricData: RubricData | null | undefined;
  csrfToken: string;
  aiGradingStats: AiGradingGeneralStats | null;
  context: Record<string, any>;
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
    settings.addEventListener('show.bs.collapse', onShow);
    settings.addEventListener('hide.bs.collapse', onHide);
    return () => {
      settings.removeEventListener('show.bs.collapse', onShow);
      settings.removeEventListener('hide.bs.collapse', onHide);
    };
  }, []);

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

  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Dragging reorders a row among its siblings; the indent buttons move rows
  // into or out of groups. The dragged row's own contents are hidden while it
  // is dragged, and each sibling counts as one block (a group together with
  // its contents) when deciding where the row lands.
  const activeDragIdx = rubricItems.findIndex((it) => it.unique_key === activeDragKey);
  const hiddenEnd = activeDragIdx === -1 ? -1 : subtreeEnd(rubricItems, activeDragIdx);
  const isHiddenWhileDragging = (idx: number) => idx > activeDragIdx && idx < hiddenEnd;
  const parentKeys = rubricItems.map((_, idx) => {
    const parent = parentIndex(rubricItems, idx);
    return parent == null ? null : rubricItems[parent].unique_key;
  });
  const lastKeys = rubricItems.map(
    (_, idx) => rubricItems[subtreeEnd(rubricItems, idx) - 1].unique_key,
  );

  const siblingCollisionDetection: CollisionDetection = (args) => {
    const { active, droppableContainers, droppableRects } = args;
    const siblings = droppableContainers.filter(
      (container) => container.data.current?.parentKey === active.data.current?.parentKey,
    );
    const blockRects = new Map(
      siblings.flatMap((container) => {
        const first = droppableRects.get(container.id);
        if (!first) return [];
        const last = droppableRects.get(container.data.current?.lastKey) ?? first;
        const height = last.top + last.height - first.top;
        return [[container.id, { ...first, height, bottom: first.top + height }] as const];
      }),
    );
    const hits = verticalBoundaryCollision({
      ...args,
      droppableContainers: siblings,
      droppableRects: blockRects,
    });
    if (hits.length === 0) return [];
    const hit = hits[0];
    // When moving down past a group, report its last row so that the whole
    // group slides up to make room.
    const hitIdx = rubricItems.findIndex((it) => it.unique_key === hit.id);
    const activeIdx = rubricItems.findIndex((it) => it.unique_key === active.id);
    return [{ id: hitIdx > activeIdx ? lastKeys[hitIdx] : hit.id }];
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDragKey(null);
    if (!over || active.id === over.id) return;
    const from = rubricItems.findIndex((it) => it.unique_key === active.id);
    // `over` may be the last row inside a sibling group; drop next to that group.
    let to: number | null = rubricItems.findIndex((it) => it.unique_key === over.id);
    while (to != null && parentKeys[to] !== parentKeys[from]) {
      to = parentIndex(rubricItems, to);
    }
    if (to == null) return;
    const moved = moveToSibling(rubricItems, from, to);
    if (moved) setRubricItems(moved.rows);
  };

  const moveUp = (idx: number) => setRubricItems((prev) => moveAmongSiblings(prev, idx, -1));
  const moveDown = (idx: number) => setRubricItems((prev) => moveAmongSiblings(prev, idx, 1));
  const indentRow = (idx: number) => setRubricItems((prev) => indent(prev, idx));
  const outdentRow = (idx: number) => setRubricItems((prev) => outdent(prev, idx));

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
          key_binding: null,
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
          <i className="fa fa-angle-up ms-1 expand-icon" aria-hidden="true" />
        </button>
      </div>
      <div
        id="rubric-setting"
        className="js-collapsible-card-body p-2 collapse"
        style={{ scrollMarginTop: '10px' }}
      >
        {/* While a save is in flight, lock the whole panel so subsequent edits
            can't be lost to the in-progress request. */}
        <fieldset disabled={isSubmitting} className="border-0 p-0 m-0">
          {/* Settings */}
          <div>
            {assessmentQuestion.max_auto_points != null &&
              assessmentQuestion.max_auto_points > 0 && (
                <>
                  <div className="row">
                    <div className="col-12 col-lg-6">
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
                          Apply rubric to manual points (out of{' '}
                          {assessmentQuestion.max_manual_points}, keep auto points)
                        </label>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          data-bs-toggle="tooltip"
                          data-bs-placement="bottom"
                          data-bs-title="If the rubric is applied to manual points only, then a student's auto points are kept, and the rubric items will be added to (or subtracted from) the autograder results."
                          aria-label="More information about applying rubric to manual points"
                        >
                          <i className="fas fa-circle-info" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <div className="col-12 col-lg-6">
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
                          Apply rubric to total points (out of {assessmentQuestion.max_points},
                          ignore auto points)
                        </label>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          data-bs-toggle="tooltip"
                          data-bs-placement="bottom"
                          data-bs-title={`If the rubric is applied to total points, then a student's auto points will be ignored, and the rubric items will be based on the total points of the question (${assessmentQuestion.max_points} points).`}
                          aria-label="More information about applying rubric to total points"
                        >
                          <i className="fas fa-circle-info" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <hr />
                </>
              )}

            <div className="row">
              <div className="col-12 col-xl-4">
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
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    data-bs-toggle="tooltip"
                    data-bs-placement="bottom"
                    data-bs-title="This setting only affects starting points. Rubric items may always be added with positive or negative points."
                    aria-label="More information about grading mode"
                  >
                    <i className="fas fa-circle-info" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="mb-3 col-12 col-md-6 col-xl-3">
                <div className="row">
                  <div className="col-6 col-md-12">
                    <label className="form-label w-100">
                      Minimum rubric score
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        data-bs-toggle="tooltip"
                        data-bs-placement="bottom"
                        data-bs-title="By default, penalties applied by rubric items cannot cause the rubric to have negative points. This value overrides this limit, e.g., for penalties that affect auto points or the assessment as a whole."
                        aria-label="More information about minimum rubric score"
                      >
                        <i className="fas fa-circle-info" aria-hidden="true" />
                      </button>
                      <input
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
                    </label>
                  </div>
                  <div className="col-6 col-md-12">
                    <label className="form-label w-100">
                      Maximum extra credit
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        data-bs-toggle="tooltip"
                        data-bs-placement="bottom"
                        data-bs-title="By default, points are limited to the maximum points assigned to the question, and credit assigned by rubric items do not violate this limit. This value allows rubric points to extend beyond this limit, e.g., for bonus credit."
                        aria-label="More information about maximum extra credit"
                      >
                        <i className="fas fa-circle-info" aria-hidden="true" />
                      </button>
                      <input
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
                    </label>
                  </div>
                </div>
              </div>
              <div className="mb-3 col-12 col-md-6 col-xl-5">
                <label className="form-label" htmlFor="grader_guidelines">
                  Grader guidelines (not shown to students)
                </label>
                <textarea
                  id="grader_guidelines"
                  name="grader_guidelines"
                  className="form-control"
                  rows={5}
                  value={graderGuidelines}
                  disabled={!hasCourseInstancePermissionEdit}
                  onChange={(e) => setGraderGuidelines(e.currentTarget.value)}
                />
              </div>
            </div>
          </div>

          {/* Rubric table */}
          <div className="table-responsive">
            <DndContext
              sensors={dragSensors}
              collisionDetection={siblingCollisionDetection}
              // Rows are hidden when a drag starts, so keep measuring the rows
              // that are left instead of using their positions from before.
              measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
              onDragStart={({ active }) => setActiveDragKey(String(active.id))}
              onDragEnd={onDragEnd}
              onDragCancel={() => setActiveDragKey(null)}
            >
              <table className="table table-sm border-bottom mb-3" aria-label="Rubric items">
                <thead>
                  <tr className="table-light fw-bold">
                    <td style={{ width: '1px' }} />
                    <td>Points</td>
                    <td>Description</td>
                    <td>Detailed explanation</td>
                    <td>Grader note</td>
                    <td>Show to students</td>
                    {showAiGradingStats ? <td>AI agreement</td> : <td>In use</td>}
                  </tr>
                </thead>
                <tbody>
                  {rubricItems.length > 0 ? (
                    <SortableContext
                      items={rubricItems
                        .filter((_, idx) => !isHiddenWhileDragging(idx))
                        .map((it) => it.unique_key)}
                      strategy={verticalListSortingStrategy}
                    >
                      {rubricItems.map((it, idx) =>
                        isHiddenWhileDragging(idx) ? null : (
                          <RubricRow
                            key={it.unique_key}
                            item={it}
                            parentKey={parentKeys[idx]}
                            lastKey={lastKeys[idx]}
                            hiddenChildCount={idx === activeDragIdx ? hiddenEnd - idx - 1 : 0}
                            showAiGradingStats={showAiGradingStats}
                            submissionCount={aiGradingStats?.submission_rubric_count ?? 0}
                            hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
                            canIndent={canIndent(rubricItems, idx)}
                            canOutdent={parentIndex(rubricItems, idx) != null}
                            ruleDisabled={it.rubric_item.is_group && hasSubgroup(rubricItems, idx)}
                            deleteRow={() => requestDeleteRow(idx)}
                            moveUp={() => moveUp(idx)}
                            moveDown={() => moveDown(idx)}
                            indentRow={() => indentRow(idx)}
                            outdentRow={() => outdentRow(idx)}
                            addItemToGroup={() => addItemToGroup(idx)}
                            updateRubricItem={(patch) => updateRubricItem(idx, patch)}
                          />
                        ),
                      )}
                    </SortableContext>
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-muted py-3">
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
                    <td colSpan={7}>
                      <div className="d-flex flex-wrap column-gap-4 row-gap-1 small">
                        <span>
                          <span className="fw-semibold">Max score from items:</span> {totalPositive}{' '}
                          / {maxPoints} points
                          {maxPointsShortfall > 0 && rubricItems.length > 0 && (
                            <span className="text-muted ms-2">
                              <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" />{' '}
                              {maxPointsShortfall} below maximum
                            </span>
                          )}
                        </span>
                        <span>
                          <span className="fw-semibold">Min score from items:</span> {totalNegative}{' '}
                          / {minRubricScore} points
                          {minPointsShortfall > 0 && rubricItems.length > 0 && (
                            <span className="text-muted ms-2">
                              <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" />{' '}
                              {minPointsShortfall} above minimum
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
                  <RubricDragPreview
                    item={rubricItems[activeDragIdx]}
                    childCount={subtreeEnd(rubricItems, activeDragIdx) - activeDragIdx - 1}
                  />
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
          <div className="mb-3 gap-1 d-flex">
            {hasCourseInstancePermissionEdit && rubricItems.length > 0 && (
              <>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={addRubricItemRow}
                >
                  Add item
                </button>
                <button type="button" className="btn btn-sm btn-secondary" onClick={addGroupRow}>
                  Add group
                </button>
              </>
            )}
            <button type="button" className="btn btn-sm btn-primary" onClick={exportRubric}>
              <i className="fas fa-download" aria-hidden="true" /> Export rubric
            </button>
            {hasCourseInstancePermissionEdit && (
              <button
                id="import-rubric-button"
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => setShowImportModal(!showImportModal)}
              >
                <i className="fas fa-upload" aria-hidden="true" /> Import rubric
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
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                data-bs-toggle="tooltip"
                data-bs-placement="bottom"
                data-bs-title="Imported rubric point values will be scaled to match the maximum points for this question."
                aria-label="More information about importing rubrics"
              >
                <i className="fas fa-circle-info" aria-hidden="true" />
              </button>
            )}
          </div>
          {params.length > 0 && (
            <div className="small form-text text-muted">
              Rubric items may use these entries, which are replaced with the corresponding values
              for the student variant (click to copy):
              <ul style={{ maxHeight: '7rem', overflowY: 'auto' }}>
                {params.map((param) => (
                  <li key={`${param}`}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={(e) => copyMustachePattern(e, param)}
                    >
                      <code>{param}</code>
                    </button>
                  </li>
                ))}
                {copyPopoverTarget && (
                  <Overlay target={copyPopoverTarget} placement="right" show>
                    {(props) => (
                      <Popover {...props}>
                        <Popover.Body>Copied!</Popover.Body>
                      </Popover>
                    )}
                  </Overlay>
                )}
              </ul>
            </div>
          )}
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

          {/* Footer actions */}
          <div className="form-check">
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
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              data-bs-toggle="tooltip"
              data-bs-placement="bottom"
              data-bs-title="Changes in rubric item values update the points for all previously graded submissions. If this option is selected, these submissions will also be tagged for manual grading, requiring a review by a grader."
              aria-label="More information about requiring manual grading"
            >
              <i className="fas fa-circle-info" aria-hidden="true" />
            </button>
          </div>
          {hasCourseInstancePermissionEdit && (
            <div className="text-end">
              {wasUsingRubric && (
                <button
                  type="button"
                  className="btn btn-link btn-sm me-auto text-danger"
                  onClick={() => setShowDeleteConfirmModal(true)}
                >
                  Delete rubric
                </button>
              )}
              <Modal show={showDeleteConfirmModal} onHide={() => setShowDeleteConfirmModal(false)}>
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
                className="btn btn-secondary me-2"
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
                Save
              </button>
            </div>
          )}
        </fieldset>
      </div>
    </div>
  );
}

function RubricRow({
  item,
  parentKey,
  lastKey,
  hiddenChildCount,
  showAiGradingStats,
  submissionCount,
  canIndent,
  canOutdent,
  ruleDisabled,
  deleteRow,
  moveUp,
  moveDown,
  indentRow,
  outdentRow,
  addItemToGroup,
  updateRubricItem,
  hasCourseInstancePermissionEdit,
}: {
  item: RubricItemData;
  /** The parent group's `unique_key`, so that rows are only dropped among siblings. */
  parentKey: string | null;
  /** `unique_key` of the last row inside this row's group, or of this row itself. */
  lastKey: string;
  /** Number of rows inside this group that are hidden while it is dragged. */
  hiddenChildCount: number;
  showAiGradingStats: boolean;
  submissionCount: number;
  canIndent: boolean;
  canOutdent: boolean;
  ruleDisabled: boolean;
  deleteRow: () => void;
  moveUp: () => void;
  moveDown: () => void;
  indentRow: () => void;
  outdentRow: () => void;
  addItemToGroup: () => void;
  updateRubricItem: (patch: Partial<RubricItemData['rubric_item']>) => void;
  hasCourseInstancePermissionEdit: boolean;
}) {
  const isGroup = item.rubric_item.is_group;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.unique_key,
    data: { parentKey, lastKey },
    disabled: !hasCourseInstancePermissionEdit,
  });
  // Each nesting level gets a colored stripe at the start of the row, so rows
  // in the same group line up visually. A group shows its own stripe too, and
  // its row is tinted with its level's color.
  const stripeCount = isGroup ? item.depth + 1 : item.depth;
  const stripes = Array.from(
    { length: stripeCount },
    (_, level) => `inset ${(level + 1) * NESTING_STRIPE_WIDTH}px 0 0 ${nestingLevelColor(level)}`,
  );
  return (
    <tr
      ref={setNodeRef}
      style={{
        ...(isGroup && {
          '--bs-table-bg': `color-mix(in srgb, ${nestingLevelColor(item.depth)} 12%, var(--bs-body-bg))`,
        }),
        opacity: isDragging ? 0.4 : undefined,
        // Use Translate, not Transform: dnd-kit's full transform includes scaleX/scaleY,
        // which visually warps variable-height rows.
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      data-testid={isGroup ? 'rubric-editor-group' : 'rubric-editor-item'}
    >
      <td
        className="text-nowrap align-middle"
        style={stripes.length > 0 ? { boxShadow: stripes.join(', ') } : undefined}
      >
        {hasCourseInstancePermissionEdit && (
          <div
            style={{
              paddingLeft: `calc(${item.depth}rem + ${stripeCount * NESTING_STRIPE_WIDTH}px)`,
            }}
          >
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              style={{ cursor: 'grab', touchAction: 'none' }}
              aria-label="Drag to reorder"
              // Native buttons already have the role supplied by dnd-kit.
              {...omit({ ...attributes, ...listeners }, ['role'])}
            >
              <i className="fas fa-grip-vertical" aria-hidden="true" />
            </button>
            <button type="button" className="visually-hidden" aria-label="Move up" onClick={moveUp}>
              <i className="fas fa-arrow-up" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="visually-hidden"
              aria-label="Move down"
              onClick={moveDown}
            >
              <i className="fas fa-arrow-down" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              aria-label="Move out of group"
              title="Move out of group"
              disabled={!canOutdent}
              onClick={outdentRow}
            >
              <i className="bi bi-text-indent-right" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              aria-label="Move into group above"
              title="Move into group above"
              disabled={!canIndent}
              onClick={indentRow}
            >
              <i className="bi bi-text-indent-left" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost text-danger"
              aria-label={isGroup ? 'Delete group and its items' : 'Delete'}
              title={isGroup ? 'Delete group and its items' : undefined}
              onClick={deleteRow}
            >
              <i className="fas fa-trash text-danger" aria-hidden="true" />
            </button>
          </div>
        )}
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
        <div
          className="d-flex align-items-center gap-2"
          style={{ paddingLeft: `${item.depth * 1.5}rem` }}
        >
          {item.depth > 0 && (
            <i className="bi bi-arrow-return-right text-muted" aria-hidden="true" />
          )}
          {isGroup && (
            <i
              className="bi bi-collection"
              style={{ color: nestingLevelColor(item.depth) }}
              aria-hidden="true"
            />
          )}
          <input
            type="text"
            className={clsx('form-control', isGroup && 'fw-semibold')}
            maxLength={100}
            style={{ minWidth: '15rem' }}
            value={item.rubric_item.description}
            placeholder={isGroup ? 'Group name' : undefined}
            aria-label={isGroup ? 'Group name' : 'Description'}
            disabled={!hasCourseInstancePermissionEdit}
            required
            onInput={(e) => updateRubricItem({ description: e.currentTarget.value })}
          />
          {hiddenChildCount > 0 && (
            <span className="small text-muted text-nowrap">+{hiddenChildCount} inside</span>
          )}
          {isGroup && hasCourseInstancePermissionEdit && (
            <button
              type="button"
              className="btn btn-sm btn-ghost text-nowrap"
              aria-label="Add item to group"
              title="Add item to group"
              onClick={addItemToGroup}
            >
              <i className="bi bi-plus-lg" aria-hidden="true" />
            </button>
          )}
        </div>
      </td>

      <td className="align-middle">
        <textarea
          className="form-control"
          /**
           * In one of the previous versions, explanation wasn't displayed correctly
           * when used this way. We fixed it by making the textarea uncontrolled and
           * putting the explanation text in the body of the textarea element.
           * However, this method will not work well with "Discard changes".
           * Ditto for grader note below.
           */
          value={item.rubric_item.explanation ?? ''}
          maxLength={10000}
          style={{ minWidth: '15rem' }}
          aria-label="Explanation"
          disabled={!hasCourseInstancePermissionEdit}
          onInput={(e) => updateRubricItem({ explanation: e.currentTarget.value })}
        />
      </td>

      <td className="align-middle">
        <textarea
          className="form-control"
          value={item.rubric_item.grader_note ?? ''}
          maxLength={10000}
          style={{ minWidth: '15rem' }}
          aria-label="Grader note"
          disabled={!hasCourseInstancePermissionEdit}
          onInput={(e) => updateRubricItem({ grader_note: e.currentTarget.value })}
        />
      </td>

      <td className="align-middle">
        <div className="form-check form-check-inline">
          <label className="form-check-label text-nowrap">
            <input
              type="radio"
              className="form-check-input"
              checked={item.rubric_item.always_show_to_students}
              disabled={!hasCourseInstancePermissionEdit}
              onChange={() => updateRubricItem({ always_show_to_students: true })}
            />
            Always
          </label>
        </div>
        <div className="form-check form-check-inline">
          <label className="form-check-label text-nowrap">
            <input
              type="radio"
              className="form-check-input"
              checked={!item.rubric_item.always_show_to_students}
              disabled={!hasCourseInstancePermissionEdit}
              onChange={() => updateRubricItem({ always_show_to_students: false })}
            />
            If selected
          </label>
        </div>
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
    </tr>
  );
}

/** What follows the pointer while a row is dragged. */
function RubricDragPreview({ item, childCount }: { item: RubricItemData; childCount: number }) {
  const isGroup = item.rubric_item.is_group;
  return (
    <div className="d-inline-flex align-items-center gap-2 bg-body border rounded shadow px-2 py-1">
      <i className="fas fa-grip-vertical text-muted" aria-hidden="true" />
      {isGroup ? (
        <i
          className="bi bi-collection"
          style={{ color: nestingLevelColor(item.depth) }}
          aria-hidden="true"
        />
      ) : (
        <span className="text-muted">{item.rubric_item.points ?? ''}</span>
      )}
      <span className={clsx(isGroup && 'fw-semibold')}>
        {item.rubric_item.description || (isGroup ? 'Untitled group' : 'Untitled item')}
      </span>
      {childCount > 0 && <span className="small text-muted">+{childCount} inside</span>}
    </div>
  );
}

const NESTING_STRIPE_WIDTH = 4;
const NESTING_LEVEL_COLORS = ['var(--bs-primary)', 'var(--bs-purple)'];

function nestingLevelColor(level: number) {
  return NESTING_LEVEL_COLORS[level % NESTING_LEVEL_COLORS.length];
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
