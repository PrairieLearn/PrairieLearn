import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useMemo, useRef, useState } from 'react';

import { run } from '@prairielearn/run';
import { NuqsAdapter, useModalState } from '@prairielearn/ui';

import type { StaffAssessmentQuestionRow } from '../../../lib/assessment-question.shared.js';
import type {
  StaffAssessment,
  StaffCourse,
  StaffCourseInstance,
} from '../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type { ZoneAssessmentJson } from '../../../schemas/infoAssessment.js';
import type { QuestionByQidResult } from '../trpc.js';
import type {
  QuestionAlternativeForm,
  SelectedItem,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../types.js';
import {
  addTrackingIds,
  createAltGroupWithTrackingId,
  createAlternativeWithTrackingId,
  createQuestionWithTrackingId,
  createZoneWithTrackingId,
  stripTrackingIds,
} from '../utils/dataTransform.js';
import { computeChangeTracking } from '../utils/modifiedTracking.js';
import {
  buildQuestionMetadata,
  normalizeQuestionPoints,
  questionDisplayName,
} from '../utils/questions.js';
import { createAssessmentQuestionsTrpcClient } from '../utils/trpc-client.js';
import { TRPCProvider, useTRPC, useTRPCClient } from '../utils/trpc-context.js';
import { findQuestionByTrackingId, useAssessmentEditor } from '../utils/useAssessmentEditor.js';

import { EditModeToolbar } from './EditModeToolbar.js';
import { ExamResetNotSupportedModal } from './ExamResetNotSupportedModal.js';
import { ResetQuestionVariantsModal } from './ResetQuestionVariantsModal.js';
import { SplitPane } from './SplitPane.js';
import { DetailPanel } from './detail/DetailPanel.js';
import { AssessmentTree } from './tree/AssessmentTree.js';

/**
 * Collision detection for vertical lists that uses item boundaries instead of
 * center distances. Unlike closestCenter, this works correctly for items of
 * different heights (e.g. a tall alt group next to a short question row).
 */
const verticalBoundaryCollision: CollisionDetection = (args) => {
  const { collisionRect, droppableContainers, droppableRects } = args;
  const centerY = collisionRect.top + collisionRect.height / 2;

  const items = droppableContainers
    .map((c) => {
      const rect = droppableRects.get(c.id);
      return rect ? { id: c.id, top: rect.top, bottom: rect.top + rect.height } : null;
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
    .sort((a, b) => a.top - b.top);

  if (items.length === 0) return [];

  // Use the midpoint between adjacent items as the boundary.
  for (let i = 0; i < items.length - 1; i++) {
    const boundary = (items[i].bottom + items[i + 1].top) / 2;
    if (centerY < boundary) {
      return [{ id: items[i].id }];
    }
  }

  return [{ id: items[items.length - 1].id }];
};

interface AssessmentEditorInnerProps {
  course: StaffCourse;
  courseInstance: StaffCourseInstance;
  questionRows: StaffAssessmentQuestionRow[];
  jsonZones: ZoneAssessmentJson[];
  assessment: StaffAssessment;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  canEdit: boolean;
  csrfToken: string;
  origHash: string;
}

function AssessmentEditorInner({
  course,
  courseInstance,
  questionRows,
  jsonZones,
  urlPrefix,
  assessment,
  hasCoursePermissionPreview,
  canEdit,
  csrfToken,
  origHash,
}: AssessmentEditorInnerProps) {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  const [initialState] = useState(() => ({
    zones: addTrackingIds(jsonZones),
    questionMetadata: Object.fromEntries(
      questionRows.map((r) => [questionDisplayName(course, r), r]),
    ),
    collapsedGroups: new Set<string>(),
    collapsedZones: new Set<string>(),
  }));

  const { zones, questionMetadata, collapsedGroups, collapsedZones, dispatch } =
    useAssessmentEditor(initialState);
  const initialZonesJson = useMemo(() => JSON.stringify(initialState.zones), [initialState.zones]);
  const changeTracking = useMemo(
    () => computeChangeTracking(initialState.zones, zones),
    [initialState.zones, zones],
  );

  const [editMode, setEditMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const isKeyboardDragRef = useRef(false);
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [viewType, setViewType] = useQueryState(
    'view',
    parseAsStringLiteral(['simple', 'detailed']).withDefault('simple'),
  );
  const resetModal = useModalState<string>(null);

  const courseQuestionsQuery = useQuery({
    ...trpc.courseQuestions.queryOptions(),
    enabled: editMode,
  });
  const courseQuestions = courseQuestionsQuery.data ?? [];

  const questionsInAssessment = useMemo(() => {
    const qidToZones = new Map<string, string[]>();
    zones.forEach((zone, index) => {
      const zoneName = zone.title || `Zone ${index + 1}`;
      for (const question of zone.questions) {
        if (question.id) {
          const existing = qidToZones.get(question.id) ?? [];
          existing.push(zoneName);
          qidToZones.set(question.id, existing);
        }
        if (question.alternatives) {
          for (const alt of question.alternatives) {
            if (alt.id) {
              const existing = qidToZones.get(alt.id) ?? [];
              existing.push(zoneName);
              qidToZones.set(alt.id, existing);
            }
          }
        }
      }
    });
    return qidToZones;
  }, [zones]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Custom collision detection:
  // 1. For standalone question drags (mouse only): check if the cursor is inside
  //    an alt group's merge zone. If yes, return the merge zone so the question
  //    can be merged into the group on drop. The merge zone is inset from the alt
  //    group edges so the top/bottom resolve to reorder instead of merge.
  // 2. Fall back to boundary-based vertical collision (not closestCenter) to
  //    determine reorder position. closestCenter uses item centers, which breaks
  //    for items of very different heights — tall alt groups have centers far from
  //    their edges, making it impossible to position items immediately above/below.
  const collisionDetection: CollisionDetection = (args) => {
    const activeData = args.active.data.current;
    const activeType = activeData?.type;

    // For standalone questions, check merge zones via rect containment first.
    // Skip merge zones for keyboard drags — sortableKeyboardCoordinates can't
    // navigate to droppables that aren't part of a SortableContext, which causes
    // the keyboard sensor to get stuck.
    if (activeType === 'question' && !activeData?.hasAlternatives && !isKeyboardDragRef.current) {
      const dragCenterY = args.collisionRect.top + args.collisionRect.height / 2;
      for (const container of args.droppableContainers) {
        if (container.data.current?.type !== 'merge-zone') continue;
        const rect = args.droppableRects.get(container.id);
        if (!rect) continue;
        // Inset the merge zone so the edges of the alt group body still resolve
        // to reorder. This gives the user room to drag past the group without
        // accidentally triggering a merge.
        const inset = Math.min(20, (rect.bottom - rect.top) / 4);
        if (dragCenterY >= rect.top + inset && dragCenterY <= rect.bottom - inset) {
          return [{ id: container.id }];
        }
      }
    }

    // Filter alternatives and merge zones for question drags; only merge zones for others.
    const filtered = args.droppableContainers.filter((c) => {
      const type = c.data.current?.type;
      if (activeType === 'question' && type === 'alternative') return false;
      if (type === 'merge-zone') return false;
      return true;
    });

    return verticalBoundaryCollision({ ...args, droppableContainers: filtered });
  };

  const positionByStableId = useMemo(() => {
    const map: Record<
      string,
      { zoneIndex: number; questionIndex: number; alternativeIndex?: number }
    > = {};
    zones.forEach((zone, zoneIndex) => {
      zone.questions.forEach((question, questionIndex) => {
        map[question.trackingId] = { zoneIndex, questionIndex };
        question.alternatives?.forEach((alt, alternativeIndex) => {
          map[alt.trackingId] = { zoneIndex, questionIndex, alternativeIndex };
        });
      });
    });
    return map;
  }, [zones]);

  const handleAddQuestion = (zoneTrackingId: string) => {
    setSelectedItem({ type: 'picker', zoneTrackingId });
  };

  const handleQuestionPicked = async (qid: string) => {
    if (selectedItem?.type === 'altGroupPicker') {
      let questionData: QuestionByQidResult;
      try {
        questionData = await trpcClient.questionByQid.query({ qid });
      } catch {
        return;
      }

      const metadata = buildQuestionMetadata({
        data: questionData,
        assessment,
        courseInstance,
        course,
        courseQuestions,
      });

      // Remove from current location if already in assessment (move behavior)
      if (questionsInAssessment.has(qid)) {
        handleRemoveQuestionByQid(qid);
      }

      if (selectedItem.altGroupTrackingId) {
        // Adding to existing alt group
        const newAlt = { ...createAlternativeWithTrackingId(), id: qid } as QuestionAlternativeForm;
        dispatch({
          type: 'ADD_ALTERNATIVE',
          altGroupTrackingId: selectedItem.altGroupTrackingId,
          alternative: newAlt,
          questionData: metadata,
        });
      } else {
        // Creating new alt group: first question picked creates the group
        const newAltGroup = createAltGroupWithTrackingId();
        const firstAlt = {
          ...createAlternativeWithTrackingId(),
          id: qid,
        } as QuestionAlternativeForm;
        newAltGroup.alternatives = [firstAlt];

        // Don't pass questionData to ADD_QUESTION — it stores metadata under
        // question.id, which is undefined for alt groups. Store it separately.
        dispatch({
          type: 'ADD_QUESTION',
          zoneTrackingId: selectedItem.zoneTrackingId,
          question: newAltGroup,
        });
        dispatch({
          type: 'UPDATE_QUESTION_METADATA',
          questionId: qid,
          questionData: metadata,
        });

        // Update selection so subsequent picks add to this group
        setSelectedItem({
          type: 'altGroupPicker',
          zoneTrackingId: selectedItem.zoneTrackingId,
          altGroupTrackingId: newAltGroup.trackingId,
        });
      }
      // Stay in picker for "add another" behavior
      return;
    }

    if (selectedItem?.type !== 'picker') return;

    if (selectedItem.returnToSelection) {
      // Returning to a question detail panel after picking a new QID
      const returnTo = selectedItem.returnToSelection;
      if (returnTo.type === 'question' || returnTo.type === 'alternative') {
        const questionTrackingId = returnTo.questionTrackingId;

        let questionData: QuestionByQidResult;
        try {
          questionData = await trpcClient.questionByQid.query({ qid });
        } catch {
          return;
        }

        const found = findQuestionByTrackingId(zones, questionTrackingId);
        if (found) {
          const oldId =
            returnTo.type === 'alternative'
              ? found.question.alternatives?.find(
                  (a) => a.trackingId === returnTo.alternativeTrackingId,
                )?.id
              : found.question.id;

          dispatch({
            type: 'UPDATE_QUESTION_METADATA',
            questionId: qid,
            oldQuestionId: oldId,
            questionData: buildQuestionMetadata({
              data: questionData,
              assessment,
              courseInstance,
              course,
              courseQuestions,
            }),
          });

          if (returnTo.type === 'alternative') {
            dispatch({
              type: 'UPDATE_QUESTION',
              questionTrackingId,
              alternativeTrackingId: returnTo.alternativeTrackingId,
              question: { id: qid },
            });
          } else {
            dispatch({
              type: 'UPDATE_QUESTION',
              questionTrackingId,
              question: { id: qid },
            });
          }
        }

        setSelectedItem(returnTo);
      }
      return;
    }

    // Adding a new question to a zone
    let questionData: QuestionByQidResult;
    try {
      questionData = await trpcClient.questionByQid.query({ qid });
    } catch {
      return;
    }

    // Remove from current location if already in assessment (move behavior)
    if (questionsInAssessment.has(qid)) {
      handleRemoveQuestionByQid(qid);
    }

    const newQuestion = {
      id: qid,
      ...createQuestionWithTrackingId(),
    } as ZoneQuestionBlockForm;

    dispatch({
      type: 'ADD_QUESTION',
      zoneTrackingId: selectedItem.zoneTrackingId,
      question: newQuestion,
      questionData: buildQuestionMetadata({
        data: questionData,
        assessment,
        courseInstance,
        course,
        courseQuestions,
      }),
    });

    // Stay in picker for "add another" behavior
  };

  const handlePickerDone = () => {
    if (selectedItem?.type === 'altGroupPicker' && selectedItem.altGroupTrackingId) {
      // After adding to an alt group, select the alt group detail panel
      setSelectedItem({
        type: 'altGroup',
        questionTrackingId: selectedItem.altGroupTrackingId,
      });
      return;
    }
    if (selectedItem?.type === 'picker' && selectedItem.returnToSelection) {
      setSelectedItem(selectedItem.returnToSelection);
      return;
    }
    setSelectedItem(null);
  };

  const handlePickQuestion = (currentSelection: SelectedItem) => {
    if (!currentSelection) return;
    const zoneTrackingId = run(() => {
      if (currentSelection.type === 'question' || currentSelection.type === 'alternative') {
        return zones.find((z) =>
          z.questions.some((q) => q.trackingId === currentSelection.questionTrackingId),
        )?.trackingId;
      }
      return undefined;
    });
    if (!zoneTrackingId) return;
    setSelectedItem({ type: 'picker', zoneTrackingId, returnToSelection: currentSelection });
  };

  const handleUpdateQuestion = (
    questionTrackingId: string,
    updatedQuestion: Partial<ZoneQuestionBlockForm> | Partial<QuestionAlternativeForm>,
    alternativeTrackingId?: string,
  ) => {
    const normalized = normalizeQuestionPoints(
      updatedQuestion as ZoneQuestionBlockForm | QuestionAlternativeForm,
    );

    dispatch({
      type: 'UPDATE_QUESTION',
      questionTrackingId,
      question: normalized,
      alternativeTrackingId,
    });
  };

  const handleDeleteQuestion = (
    questionTrackingId: string,
    questionId: string,
    alternativeTrackingId?: string,
  ) => {
    // Clear selection if the deleted item was selected
    if (
      selectedItem?.type === 'question' &&
      selectedItem.questionTrackingId === questionTrackingId
    ) {
      setSelectedItem(null);
    }
    if (
      selectedItem?.type === 'alternative' &&
      selectedItem.alternativeTrackingId === alternativeTrackingId
    ) {
      setSelectedItem(null);
    }

    dispatch({
      type: 'DELETE_QUESTION',
      questionTrackingId,
      questionId,
      alternativeTrackingId,
    });
  };

  const handleRemoveQuestionByQid = (qid: string) => {
    dispatch({ type: 'REMOVE_QUESTION_BY_QID', qid });
  };

  const handleAddZone = () => {
    const zone = createZoneWithTrackingId({
      questions: [] as ZoneAssessmentForm['questions'],
      lockpoint: false,
      canSubmit: [],
      canView: [],
    } as Omit<ZoneAssessmentForm, 'trackingId'>);
    dispatch({ type: 'ADD_ZONE', zone });
    setSelectedItem({ type: 'zone', zoneTrackingId: zone.trackingId });
  };

  const handleUpdateZone = (zoneTrackingId: string, zone: Partial<ZoneAssessmentForm>) => {
    dispatch({ type: 'UPDATE_ZONE', zoneTrackingId, zone });
  };

  const handleDeleteZone = (zoneTrackingId: string) => {
    if (selectedItem?.type === 'zone' && selectedItem.zoneTrackingId === zoneTrackingId) {
      setSelectedItem(null);
    }
    dispatch({ type: 'DELETE_ZONE', zoneTrackingId });
  };

  const handleAddAltGroup = (zoneTrackingId: string) => {
    const newAltGroup = createAltGroupWithTrackingId();
    dispatch({
      type: 'ADD_QUESTION',
      zoneTrackingId,
      question: newAltGroup,
    });
    setSelectedItem({
      type: 'altGroup',
      questionTrackingId: newAltGroup.trackingId,
    });
  };

  const handleAddToAltGroup = (altGroupTrackingId: string) => {
    const zoneTrackingId = zones.find((z) =>
      z.questions.some((q) => q.trackingId === altGroupTrackingId),
    )?.trackingId;
    if (!zoneTrackingId) return;
    setSelectedItem({ type: 'altGroupPicker', zoneTrackingId, altGroupTrackingId });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    const activeType = active.data.current?.type as 'zone' | 'question' | 'alternative' | undefined;

    // Zone reorder
    if (activeType === 'zone') {
      const fromZoneIndex = zones.findIndex((z) => z.trackingId === activeIdStr);
      if (fromZoneIndex === -1) return;

      const toZoneIndex = zones.findIndex((z) => z.trackingId === overIdStr);
      if (toZoneIndex === -1 || fromZoneIndex === toZoneIndex) return;

      const isDraggingDown = fromZoneIndex < toZoneIndex;
      let beforeZoneTrackingId: string | null;

      if (isDraggingDown) {
        const nextIndex = toZoneIndex + 1;
        beforeZoneTrackingId = nextIndex < zones.length ? zones[nextIndex].trackingId : null;
      } else {
        beforeZoneTrackingId = zones[toZoneIndex].trackingId;
      }

      dispatch({
        type: 'REORDER_ZONE',
        zoneTrackingId: activeIdStr,
        beforeZoneTrackingId,
      });
      return;
    }

    // Alternative reorder within same group
    if (activeType === 'alternative') {
      const fromPos = positionByStableId[activeIdStr];
      const toPos = positionByStableId[overIdStr];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!fromPos || !toPos) return;
      if (fromPos.alternativeIndex == null || toPos.alternativeIndex == null) return;

      // Only handle within-group reorder here; cross-group is handled in handleDragOver
      const fromBlock = zones[fromPos.zoneIndex].questions[fromPos.questionIndex];
      const toBlock = zones[toPos.zoneIndex].questions[toPos.questionIndex];
      if (fromBlock.trackingId !== toBlock.trackingId) return;
      if (fromPos.alternativeIndex === toPos.alternativeIndex) return;

      const alts = fromBlock.alternatives!;
      const isDraggingDown = fromPos.alternativeIndex < toPos.alternativeIndex;
      const beforeAlternativeTrackingId = isDraggingDown
        ? (alts[toPos.alternativeIndex + 1]?.trackingId ?? null)
        : alts[toPos.alternativeIndex].trackingId;

      dispatch({
        type: 'REORDER_ALTERNATIVE',
        alternativeTrackingId: activeIdStr,
        toAltGroupTrackingId: fromBlock.trackingId,
        beforeAlternativeTrackingId,
      });
      return;
    }

    // Merge standalone question into alt group via merge zone
    if (over.data.current?.type === 'merge-zone') {
      const altGroupTrackingId = over.data.current.altGroupTrackingId as string;
      dispatch({
        type: 'MERGE_QUESTION_INTO_ALT_GROUP',
        questionTrackingId: activeIdStr,
        toAltGroupTrackingId: altGroupTrackingId,
        beforeAlternativeTrackingId: null,
      });
      return;
    }

    // Question block reorder within same zone
    const fromPosition = positionByStableId[activeIdStr];
    const rawToPosition = positionByStableId[overIdStr];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!fromPosition || !rawToPosition) return;

    // If "over" resolved to an alternative inside an alt group, use the alt group's position
    const toPosition =
      rawToPosition.alternativeIndex != null
        ? { zoneIndex: rawToPosition.zoneIndex, questionIndex: rawToPosition.questionIndex }
        : rawToPosition;

    const fromZone = zones[fromPosition.zoneIndex];
    const toZone = zones[toPosition.zoneIndex];

    if (fromZone.trackingId !== toZone.trackingId) return;
    if (fromPosition.questionIndex === toPosition.questionIndex) return;

    const isDraggingDown = fromPosition.questionIndex < toPosition.questionIndex;
    const beforeQuestionTrackingId = isDraggingDown
      ? (toZone.questions[toPosition.questionIndex + 1]?.trackingId ?? null)
      : toZone.questions[toPosition.questionIndex].trackingId;

    dispatch({
      type: 'REORDER_QUESTION',
      questionTrackingId: activeIdStr,
      toZoneTrackingId: toZone.trackingId,
      beforeQuestionTrackingId,
    });
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;

    const activeType = active.data.current?.type as 'zone' | 'question' | 'alternative' | undefined;
    const overType = over.data.current?.type as string | undefined;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    // Merge zone — handled in handleDragEnd, ignore during dragOver
    if (overType === 'merge-zone') return;

    if (activeType === 'alternative') {
      const fromPos = positionByStableId[activeIdStr];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!fromPos) return;
      // After extraction, the item becomes a question block (no alternativeIndex).
      // dnd-kit's active.data.current.type stays frozen as 'alternative', so guard here.
      if (fromPos.alternativeIndex == null) return;
      const fromBlock = zones[fromPos.zoneIndex].questions[fromPos.questionIndex];

      // Alternative dragged over empty zone drop target → extract to zone
      const targetZone = zones.find((z) => `${z.trackingId}-empty-drop` === overIdStr);
      if (targetZone) {
        dispatch({
          type: 'EXTRACT_ALTERNATIVE_TO_QUESTION',
          alternativeTrackingId: activeIdStr,
          toZoneTrackingId: targetZone.trackingId,
          beforeQuestionTrackingId: null,
        });
        setSelectedItem(null);
        return;
      }

      const toPos = positionByStableId[overIdStr];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!toPos) return;

      if (overType === 'alternative' && toPos.alternativeIndex != null) {
        // Alternative dragged over alternative in different group → cross-group move
        const toBlock = zones[toPos.zoneIndex].questions[toPos.questionIndex];
        if (fromBlock.trackingId !== toBlock.trackingId) {
          dispatch({
            type: 'REORDER_ALTERNATIVE',
            alternativeTrackingId: activeIdStr,
            toAltGroupTrackingId: toBlock.trackingId,
            beforeAlternativeTrackingId: toBlock.alternatives![toPos.alternativeIndex].trackingId,
          });
        }
        return;
      }

      if (overType === 'question') {
        // Alternative dragged over a question block → extract to zone
        const toZone = zones[toPos.zoneIndex];
        dispatch({
          type: 'EXTRACT_ALTERNATIVE_TO_QUESTION',
          alternativeTrackingId: activeIdStr,
          toZoneTrackingId: toZone.trackingId,
          beforeQuestionTrackingId: toZone.questions[toPos.questionIndex].trackingId,
        });
        setSelectedItem(null);
      }
      return;
    }

    if (activeType === 'question') {
      const fromPosition = positionByStableId[activeIdStr];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!fromPosition) return;
      const fromZone = zones[fromPosition.zoneIndex];

      // Question dragged over empty zone drop target → cross-zone move
      const targetZone = zones.find((z) => `${z.trackingId}-empty-drop` === overIdStr);
      if (targetZone && fromZone.trackingId !== targetZone.trackingId) {
        dispatch({
          type: 'REORDER_QUESTION',
          questionTrackingId: activeIdStr,
          toZoneTrackingId: targetZone.trackingId,
          beforeQuestionTrackingId: null,
        });
        return;
      }

      const toPos = positionByStableId[overIdStr];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!toPos) return;

      // Cross-zone question reorder
      const toZone = zones[toPos.zoneIndex];
      if (fromZone.trackingId !== toZone.trackingId) {
        dispatch({
          type: 'REORDER_QUESTION',
          questionTrackingId: activeIdStr,
          toZoneTrackingId: toZone.trackingId,
          beforeQuestionTrackingId: toZone.questions[toPos.questionIndex].trackingId,
        });
      }
    }
  };

  const isAllExpanded = collapsedZones.size === 0 && collapsedGroups.size === 0;

  const saveButtonDisabled =
    JSON.stringify(zones) === initialZonesJson || zones.some((zone) => zone.questions.length === 0);

  const saveButtonDisabledReason = zones.some((zone) => zone.questions.length === 0)
    ? 'Cannot save: one or more zones have no questions'
    : undefined;

  const zonesForSave = useMemo(() => stripTrackingIds(zones), [zones]);

  const toggleExpandCollapse = () => {
    if (isAllExpanded) {
      dispatch({ type: 'COLLAPSE_ALL' });
    } else {
      dispatch({ type: 'EXPAND_ALL' });
    }
  };

  const zoneDisplayName = (trackingId: string) => {
    const index = zones.findIndex((z) => z.trackingId === trackingId);
    if (index === -1) return 'Zone';
    return zones[index].title || `Zone ${index + 1}`;
  };

  const rightTitle = run(() => {
    if (!selectedItem) return undefined;
    switch (selectedItem.type) {
      case 'zone': {
        const name = zoneDisplayName(selectedItem.zoneTrackingId);
        return editMode ? `Edit ${name.toLowerCase()}` : name;
      }
      case 'question':
        return editMode ? 'Edit question' : 'Question';
      case 'alternative':
        return editMode ? 'Edit alternative' : 'Alternative';
      case 'altGroup':
        return editMode ? 'Edit alternative group' : 'Alternative group';
      case 'picker': {
        const name = zoneDisplayName(selectedItem.zoneTrackingId);
        return `Adding to ${name}`;
      }
      case 'altGroupPicker': {
        const name = zoneDisplayName(selectedItem.zoneTrackingId);
        return selectedItem.altGroupTrackingId
          ? `Adding to alternative group in ${name}`
          : `Creating alternative group in ${name}`;
      }
    }
  });

  const rightHeaderAction = run(() => {
    if (selectedItem?.type === 'picker' || selectedItem?.type === 'altGroupPicker') {
      return (
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={handlePickerDone}
        >
          Done
        </button>
      );
    }
    return undefined;
  });

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        autoScroll={false}
        onDragStart={(event: DragStartEvent) => {
          setIsDragging(true);
          setActiveDragId(String(event.active.id));
          isKeyboardDragRef.current = event.activatorEvent instanceof KeyboardEvent;
        }}
        onDragOver={handleDragOver}
        onDragEnd={(event: DragEndEvent) => {
          setIsDragging(false);
          setActiveDragId(null);
          isKeyboardDragRef.current = false;
          handleDragEnd(event);
        }}
        onDragCancel={() => {
          setIsDragging(false);
          setActiveDragId(null);
          isKeyboardDragRef.current = false;
        }}
      >
        <div data-dragging={isDragging || undefined}>
          <SplitPane
            forceOpen={selectedItem}
            rightTitle={rightTitle}
            rightHeaderAction={rightHeaderAction}
            left={
              <AssessmentTree
                zones={zones}
                questionMetadata={questionMetadata}
                editMode={editMode}
                viewType={viewType}
                selectedItem={selectedItem}
                setSelectedItem={setSelectedItem}
                collapsedGroups={collapsedGroups}
                collapsedZones={collapsedZones}
                changeTracking={changeTracking}
                urlPrefix={urlPrefix}
                hasCoursePermissionPreview={hasCoursePermissionPreview}
                assessmentType={assessment.type}
                dispatch={dispatch}
                isAllExpanded={isAllExpanded}
                editControls={
                  <EditModeToolbar
                    csrfToken={csrfToken}
                    origHash={origHash}
                    zones={zonesForSave}
                    editMode={editMode}
                    canEdit={canEdit && !!origHash}
                    setEditMode={setEditMode}
                    saveButtonDisabled={saveButtonDisabled}
                    saveButtonDisabledReason={saveButtonDisabledReason}
                    onCancel={() => {
                      dispatch({ type: 'RESET' });
                      setEditMode(false);
                    }}
                  />
                }
                onAddQuestion={handleAddQuestion}
                onAddAltGroup={handleAddAltGroup}
                onAddToAltGroup={handleAddToAltGroup}
                onAddZone={handleAddZone}
                onDeleteQuestion={handleDeleteQuestion}
                onDeleteZone={handleDeleteZone}
                onViewTypeChange={setViewType}
                onToggleExpandCollapse={toggleExpandCollapse}
              />
            }
            right={
              <DetailPanel
                selectedItem={selectedItem}
                zones={zones}
                questionMetadata={questionMetadata}
                editMode={editMode}
                assessmentType={assessment.type}
                urlPrefix={urlPrefix}
                courseId={course.id}
                hasCoursePermissionPreview={hasCoursePermissionPreview}
                courseQuestions={courseQuestions}
                courseQuestionsLoading={courseQuestionsQuery.isLoading}
                questionsInAssessment={questionsInAssessment}
                currentAssessmentId={assessment.id}
                onUpdateZone={handleUpdateZone}
                onUpdateQuestion={handleUpdateQuestion}
                onDeleteQuestion={handleDeleteQuestion}
                onDeleteZone={handleDeleteZone}
                onQuestionPicked={handleQuestionPicked}
                onPickQuestion={handlePickQuestion}
                onRemoveQuestionByQid={handleRemoveQuestionByQid}
                onResetButtonClick={resetModal.showWithData}
              />
            }
          />
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDragId ? (
            <DragPreview
              activeDragId={activeDragId}
              zones={zones}
              questionMetadata={questionMetadata}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
      {assessment.type === 'Homework' ? (
        <ResetQuestionVariantsModal
          csrfToken={csrfToken}
          assessmentQuestionId={resetModal.data ?? ''}
          show={resetModal.show}
          onHide={resetModal.onHide}
          onExited={resetModal.onExited}
        />
      ) : (
        <ExamResetNotSupportedModal
          show={resetModal.show}
          onHide={resetModal.onHide}
          onExited={resetModal.onExited}
        />
      )}
    </>
  );
}

function DragPreview({
  activeDragId,
  zones,
  questionMetadata,
}: {
  activeDragId: string;
  zones: ZoneAssessmentForm[];
  questionMetadata: Record<string, StaffAssessmentQuestionRow>;
}) {
  for (const [zoneIndex, zone] of zones.entries()) {
    if (zone.trackingId === activeDragId) {
      return (
        <div className="bg-body-secondary border rounded shadow-sm px-3 py-2 fw-semibold">
          {zone.title || `Zone ${zoneIndex + 1}`}
        </div>
      );
    }
    for (const question of zone.questions) {
      if (question.trackingId === activeDragId) {
        const qData = question.id ? questionMetadata[question.id] : null;
        return (
          <div className="bg-body border rounded shadow-sm px-3 py-2 text-truncate">
            {qData?.question.title ?? question.id ?? 'Alternative group'}
          </div>
        );
      }
      for (const alt of question.alternatives ?? []) {
        if (alt.trackingId === activeDragId) {
          const altData = alt.id ? questionMetadata[alt.id] : null;
          return (
            <div className="bg-body border rounded shadow-sm px-3 py-2 text-truncate">
              {altData?.question.title ?? alt.id}
            </div>
          );
        }
      }
    }
  }
  return null;
}

interface AssessmentEditorProps extends AssessmentEditorInnerProps {
  trpcCsrfToken: string;
  search: string;
}

export function AssessmentEditor({ trpcCsrfToken, search, ...innerProps }: AssessmentEditorProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createAssessmentQuestionsTrpcClient(trpcCsrfToken));
  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <AssessmentEditorInner {...innerProps} />
        </TRPCProvider>
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

AssessmentEditor.displayName = 'AssessmentEditor';
