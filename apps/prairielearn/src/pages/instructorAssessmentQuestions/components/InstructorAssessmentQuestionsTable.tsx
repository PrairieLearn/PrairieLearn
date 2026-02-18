import {
  type Active,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  KeyboardSensor,
  type Over,
  PointerSensor,
  closestCenter,
  useDndMonitor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';

import { useModalState } from '@prairielearn/ui';

import type { StaffAssessmentQuestionRow } from '../../../lib/assessment-question.js';
import type { StaffAssessment, StaffCourse } from '../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type { ZoneAssessmentJson } from '../../../schemas/infoAssessment.js';
import type {
  QuestionAlternativeForm,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
  ParsedDragEvent,
} from '../types.js';
import {
  addTrackingIds,
  createQuestionWithTrackingId,
  createZoneWithTrackingId,
  findQuestionByTrackingId,
  getInsertBeforeId,
  stripTrackingIds,
} from '../utils/dataTransform.js';
import { normalizeQuestionPoints, questionDisplayName } from '../utils/questions.js';
import { createAssessmentQuestionsTrpcClient } from '../utils/trpc-client.js';
import { TRPCProvider, useTRPC } from '../utils/trpc-context.js';
import { useAssessmentEditor } from '../utils/useAssessmentEditor.js';

import { AssessmentZone } from './AssessmentZone.js';
import { EditQuestionModal } from './EditQuestionModal.js';
import { EditZoneModal, type EditZoneModalData } from './EditZoneModal.js';
import { ExamResetNotSupportedModal } from './ExamResetNotSupportedModal.js';
import { QuestionPickerModal } from './QuestionPickerModal.js';
import { ResetQuestionVariantsModal } from './ResetQuestionVariantsModal.js';

/**
 * Consolidated state for the question picker and edit modal flow.
 * This replaces the previously scattered state pieces (selectedQuestionIds,
 * editQuestionModal, questionPickerModal, pickerContext).
 */
interface EditingStateCreate {
  status: 'editing';
  mode: 'create';
  zoneTrackingId: string;
  question: ZoneQuestionBlockForm;
  existingQids: string[];
}

interface EditingStateEdit {
  status: 'editing';
  mode: 'edit';
  questionTrackingId: string;
  alternativeTrackingId?: string;
  question: ZoneQuestionBlockForm | QuestionAlternativeForm;
  zoneQuestionBlock?: ZoneQuestionBlockForm;
  originalQuestionId?: string;
}

interface EditingStateCreateGroup {
  status: 'editing';
  mode: 'create-group';
  zoneTrackingId: string;
  group: ZoneQuestionBlockForm;
}

interface EditingStateEditGroup {
  status: 'editing';
  mode: 'edit-group';
  questionTrackingId: string;
  group: ZoneQuestionBlockForm;
}

type EditingState =
  | EditingStateCreate
  | EditingStateEdit
  | EditingStateCreateGroup
  | EditingStateEditGroup;

type QuestionEditState =
  | { status: 'idle' }
  | {
      status: 'picking';
      zoneTrackingId: string;
      /** If returning to edit modal after picking, preserve that context */
      returnToEdit?: EditingStateCreate | EditingStateEdit;
    }
  | EditingState;

/**
 * Parses dnd-kit Active and Over objects into a typed context for drag handlers.
 */
function parseDragEvent(active: Active, over: Over): ParsedDragEvent {
  return {
    activeId: String(active.id),
    overId: String(over.id),
    activeType: active.data.current?.type as ParsedDragEvent['activeType'],
    overType: over.data.current?.type as ParsedDragEvent['overType'],
    activeGroupTrackingId: active.data.current?.groupTrackingId as string | undefined,
    overGroupTrackingId: over.data.current?.groupTrackingId as string | undefined,
  };
}

interface DropTarget {
  zoneTrackingId: string;
  beforeQuestionTrackingId: string | null;
}

/**
 * Finds which alternative group contains an item by its trackingId.
 * Returns the group's trackingId, or null if not found in any group.
 */
function findContainingGroup(zones: ZoneAssessmentForm[], trackingId: string): string | null {
  for (const zone of zones) {
    for (const question of zone.questions) {
      if (question.alternatives?.some((a) => a.trackingId === trackingId)) {
        return question.trackingId;
      }
    }
  }
  return null;
}

function resolveDropTarget(
  overId: string,
  overType: ParsedDragEvent['overType'],
  zones: ZoneAssessmentForm[],
  positionByStableId: Record<string, { zoneIndex: number; questionIndex: number }>,
): DropTarget | null {
  // Don't resolve group-drop targets here - let specific handlers deal with those
  if (overType === 'group-drop') return null;

  // Check if hovering over zone header (sortable zone)
  const zoneByTrackingId = zones.find((z) => z.trackingId === overId);
  if (zoneByTrackingId) {
    return { zoneTrackingId: zoneByTrackingId.trackingId, beforeQuestionTrackingId: null };
  }

  // Check if hovering over empty zone droppable
  const emptyZoneMatch = zones.find((z) => `${z.trackingId}-empty-drop` === overId);
  if (emptyZoneMatch) {
    return { zoneTrackingId: emptyZoneMatch.trackingId, beforeQuestionTrackingId: null };
  }

  // Check if hovering over a question
  let toPosition = positionByStableId[overId];

  // If overId is an alternative inside a group, use the group's position
  if (!toPosition) {
    const containingGroupId = findContainingGroup(zones, overId);
    if (containingGroupId) {
      toPosition = positionByStableId[containingGroupId];
    }
  }

  if (toPosition) {
    const toZone = zones[toPosition.zoneIndex];
    return {
      zoneTrackingId: toZone.trackingId,
      beforeQuestionTrackingId: toZone.questions[toPosition.questionIndex]?.trackingId ?? null,
    };
  }

  return null;
}

/**
 * Monitors drag events to track which group is currently being targeted.
 * Updates state when dragging a question over an alternative group.
 */
function DragTargetMonitor({
  zones,
  setTargetGroupTrackingId,
}: {
  zones: ZoneAssessmentForm[];
  setTargetGroupTrackingId: (id: string | null) => void;
}) {
  useDndMonitor({
    onDragOver(event) {
      const { active, over } = event;
      if (!over) {
        setTargetGroupTrackingId(null);
        return;
      }

      const activeType = active.data.current?.type;

      // Only track for question drags (not alternatives being extracted or zones)
      if (activeType !== 'question') {
        setTargetGroupTrackingId(null);
        return;
      }

      const overType = over.data.current?.type;

      // If over a group-drop target, use its group ID
      if (overType === 'group-drop') {
        const groupId = over.data.current?.groupTrackingId as string | undefined;
        setTargetGroupTrackingId(groupId ?? null);
        return;
      }

      // If over an alternative, find its parent group
      if (overType === 'alternative') {
        const groupId = over.data.current?.groupTrackingId as string | undefined;
        setTargetGroupTrackingId(groupId ?? null);
        return;
      }

      // If over a question that is a group (has alternatives), target that group
      const overId = String(over.id);
      for (const zone of zones) {
        for (const question of zone.questions) {
          if (question.trackingId === overId && question.alternatives) {
            setTargetGroupTrackingId(question.trackingId);
            return;
          }
        }
      }

      setTargetGroupTrackingId(null);
    },
    onDragEnd() {
      setTargetGroupTrackingId(null);
    },
    onDragCancel() {
      setTargetGroupTrackingId(null);
    },
  });

  return null;
}

function EditModeButtons({
  csrfToken,
  origHash,
  zones,
  editMode,
  setEditMode,
  saveButtonDisabled,
  saveButtonDisabledReason,
  isAllExpanded,
  onToggleExpandCollapse,
  onCancel,
}: {
  csrfToken: string;
  origHash: string;
  zones: ZoneAssessmentForm[];
  editMode: boolean;
  setEditMode: (editMode: boolean) => void;
  saveButtonDisabled: boolean;
  saveButtonDisabledReason?: string;
  isAllExpanded: boolean;
  onToggleExpandCollapse: () => void;
  onCancel: () => void;
}) {
  if (!editMode) {
    return (
      <div className="d-flex gap-2">
        <button className="btn btn-sm btn-light" type="button" onClick={onToggleExpandCollapse}>
          {isAllExpanded ? (
            <>
              <i className="bi bi-chevron-contract" aria-hidden="true" /> Collapse all
            </>
          ) : (
            <>
              <i className="bi bi-chevron-expand" aria-hidden="true" /> Expand all
            </>
          )}
        </button>
        <button className="btn btn-sm btn-light" type="button" onClick={() => setEditMode(true)}>
          <i className="fa fa-edit" aria-hidden="true" /> Edit questions
        </button>
      </div>
    );
  }

  const saveButton = (
    <button className="btn btn-sm btn-light mx-1" type="submit" disabled={saveButtonDisabled}>
      <i className="fa fa-save" aria-hidden="true" /> Save and sync
    </button>
  );

  // Strip trackingIds before saving - they are only used for drag-and-drop identity
  const zonesForSave = stripTrackingIds(zones);

  return (
    <form method="POST">
      <input type="hidden" name="__action" value="save_questions" />
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <input type="hidden" name="orig_hash" value={origHash} />
      <input type="hidden" name="zones" value={JSON.stringify(zonesForSave)} />
      {saveButtonDisabledReason ? (
        <span title={saveButtonDisabledReason} style={{ cursor: 'not-allowed' }}>
          {saveButton}
        </span>
      ) : (
        saveButton
      )}
      <button className="btn btn-sm btn-light" type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

/**
 * The full table and form, and handles state management and modals.
 *
 * Renders assessment zones with AssessmentZone.
 */
function InstructorAssessmentQuestionsTableInner({
  course,
  questionRows,
  jsonZones,
  urlPrefix,
  assessment,
  assessmentSetName,
  hasCoursePermissionPreview,
  canEdit,
  csrfToken,
  origHash,
}: {
  course: StaffCourse;
  questionRows: StaffAssessmentQuestionRow[];
  jsonZones: ZoneAssessmentJson[];
  assessment: StaffAssessment;
  assessmentSetName: string;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  canEdit: boolean;
  csrfToken: string;
  origHash: string;
}) {
  const trpc = useTRPC();
  // Initialize editor state from JSON zones
  const initialZones = addTrackingIds(jsonZones);

  // Initially collapse alternative groups with multiple alternatives (not in edit mode)
  const initialCollapsedGroups = new Set<string>();
  for (const zone of initialZones) {
    for (const question of zone.questions) {
      if ((question.alternatives?.length ?? 0) > 1) {
        initialCollapsedGroups.add(question.trackingId);
      }
    }
  }

  const initialState = {
    zones: initialZones,
    questionMetadata: Object.fromEntries(
      questionRows.map((r) => [questionDisplayName(course, r), r]),
    ),
    collapsedGroups: initialCollapsedGroups,
    collapsedZones: new Set<string>(), // Zones start expanded
  };

  const { zones, questionMetadata, collapsedGroups, collapsedZones, dispatch } =
    useAssessmentEditor(initialState);
  const initialZonesRef = useRef(JSON.stringify(initialState.zones));

  // UI-only state
  const [editMode, setEditMode] = useState(false);
  const resetModal = useModalState<string>(null);
  const editZoneModal = useModalState<EditZoneModalData>(null);
  const [targetGroupTrackingId, setTargetGroupTrackingId] = useState<string | null>(null);

  // Fetch course questions on-demand when edit mode is activated
  const courseQuestionsQuery = useQuery({
    ...trpc.courseQuestions.queryOptions(),
    enabled: editMode,
  });
  const courseQuestions = courseQuestionsQuery.data ?? [];

  // Consolidated state for question picker and edit modal flow
  const [questionEditState, setQuestionEditState] = useState<QuestionEditState>({
    status: 'idle',
  });

  // Derived modal visibility
  const showPicker = questionEditState.status === 'picking';
  const showEditModal = questionEditState.status === 'editing';

  // Compute modal data with proper type narrowing
  const editModalData = useMemo(() => {
    if (questionEditState.status !== 'editing') return null;
    switch (questionEditState.mode) {
      case 'create':
        return {
          type: 'create' as const,
          question: questionEditState.question,
          existingQids: questionEditState.existingQids,
        };
      case 'edit':
        return {
          type: 'edit' as const,
          question: questionEditState.question,
          zoneQuestionBlock: questionEditState.zoneQuestionBlock,
          originalQuestionId: questionEditState.originalQuestionId,
        };
      case 'create-group':
        return {
          type: 'create-group' as const,
          group: questionEditState.group,
        };
      case 'edit-group':
        return {
          type: 'edit-group' as const,
          group: questionEditState.group,
        };
    }
  }, [questionEditState]);

  // Helper functions for state transitions
  const openPickerForNew = (zoneTrackingId: string) => {
    setQuestionEditState({ status: 'picking', zoneTrackingId });
  };

  const openPickerToChangeQid = (
    currentFormValues: ZoneQuestionBlockForm | QuestionAlternativeForm,
  ) => {
    if (questionEditState.status !== 'editing') return;
    // Only allow changing QID for question modes, not group modes
    if (questionEditState.mode === 'create-group' || questionEditState.mode === 'edit-group') {
      return;
    }
    const zoneTrackingId =
      questionEditState.mode === 'create'
        ? questionEditState.zoneTrackingId
        : (zones.find((z) =>
            z.questions.some((q) => q.trackingId === questionEditState.questionTrackingId),
          )?.trackingId ?? '');
    // Merge current form values into the original question to preserve unsaved
    // edits (e.g. points/manual points) while keeping extra properties that
    // aren't registered as form fields.
    const questionWithFormValues = {
      ...questionEditState.question,
      ...currentFormValues,
      trackingId: questionEditState.question.trackingId,
    } as typeof questionEditState.question;
    const returnToEdit: EditingState = {
      ...questionEditState,
      question: questionWithFormValues,
    } as EditingState;
    setQuestionEditState({
      status: 'picking',
      zoneTrackingId,
      returnToEdit,
    });
  };

  const openEditForExisting = ({
    question,
    zoneQuestionBlock,
    questionTrackingId,
    alternativeTrackingId,
  }: {
    question: ZoneQuestionBlockForm | QuestionAlternativeForm;
    zoneQuestionBlock?: ZoneQuestionBlockForm;
    questionTrackingId: string;
    alternativeTrackingId?: string;
  }) => {
    setQuestionEditState({
      status: 'editing',
      mode: 'edit',
      questionTrackingId,
      alternativeTrackingId,
      question,
      zoneQuestionBlock,
      originalQuestionId: question.id,
    });
  };

  const openEditForExistingGroup = (group: ZoneQuestionBlockForm) => {
    setQuestionEditState({
      status: 'editing',
      mode: 'edit-group',
      questionTrackingId: group.trackingId,
      group,
    });
  };

  const closeQuestionEditState = () => {
    setQuestionEditState({ status: 'idle' });
  };

  const handlePickerCancel = () => {
    if (questionEditState.status === 'picking' && questionEditState.returnToEdit) {
      // Return to the edit modal without changing the QID
      setQuestionEditState(questionEditState.returnToEdit);
    } else {
      closeQuestionEditState();
    }
  };

  // Questions already in the assessment are those with metadata
  const questionsInAssessment = useMemo(
    () => new Set(Object.keys(questionMetadata)),
    [questionMetadata],
  );

  // dnd-kit sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Map from trackingId to its current position {zoneIndex, questionIndex}
  // This is recomputed when zones change and used by drag handlers
  const positionByStableId = useMemo(() => {
    const map: Record<string, { zoneIndex: number; questionIndex: number }> = {};
    zones.forEach((zone, zoneIndex) => {
      zone.questions.forEach((question, questionIndex) => {
        map[question.trackingId] = { zoneIndex, questionIndex };
      });
    });
    return map;
  }, [zones]);

  // Pre-calculate the starting question number for each zone
  const zoneStartNumbers = useMemo(() => {
    const starts: number[] = [];
    let count = 0;
    zones.forEach((zone) => {
      starts.push(count + 1);
      count += zone.questions.length;
    });
    return starts;
  }, [zones]);

  const handleResetButtonClick = (assessmentQuestionId: string) => {
    resetModal.showWithData(assessmentQuestionId);
  };

  const assessmentType = assessment.type;

  const handleAddAlternativeGroup = (zoneTrackingId: string) => {
    setQuestionEditState({
      status: 'editing',
      mode: 'create-group',
      zoneTrackingId,
      group: {
        trackingId: '' as ZoneQuestionBlockForm['trackingId'],
        alternatives: [],
        numberChoose: 1,
        canSubmit: [],
        canView: [],
      } as ZoneQuestionBlockForm,
    });
  };

  const handleUpdateGroup = (updatedGroup: ZoneQuestionBlockForm) => {
    if (questionEditState.status !== 'editing') return;

    if (questionEditState.mode === 'create-group') {
      dispatch({
        type: 'ADD_ALTERNATIVE_GROUP',
        zoneTrackingId: questionEditState.zoneTrackingId,
        group: createQuestionWithTrackingId(updatedGroup),
      });
    } else if (questionEditState.mode === 'edit-group') {
      dispatch({
        type: 'UPDATE_QUESTION',
        questionTrackingId: questionEditState.questionTrackingId,
        question: updatedGroup,
      });
    }

    closeQuestionEditState();
  };

  const handleQuestionPicked = (qid: string) => {
    if (questionEditState.status !== 'picking') return;

    if (questionEditState.returnToEdit) {
      // Return to edit modal with new QID while preserving other form values
      const returnState = questionEditState.returnToEdit;
      // Type discrimination needed for TypeScript to narrow the union type
      if (returnState.mode === 'create') {
        setQuestionEditState({
          ...returnState,
          question: { ...returnState.question, id: qid },
        });
      } else {
        setQuestionEditState({
          ...returnState,
          question: { ...returnState.question, id: qid },
        });
      }
    } else {
      // Open edit modal for new question
      setQuestionEditState({
        status: 'editing',
        mode: 'create',
        zoneTrackingId: questionEditState.zoneTrackingId,
        question: { id: qid, trackingId: '' } as ZoneQuestionBlockForm,
        existingQids: Object.keys(questionMetadata),
      });
    }
  };

  // Handler for "Add & pick another" button - adds question and reopens picker for same zone
  const handleAddAndPickAnother = () => {
    if (questionEditState.status !== 'editing' || questionEditState.mode !== 'create') return;
    const zoneTrackingId = questionEditState.zoneTrackingId;
    // Will transition to picker after handleUpdateQuestion processes the save
    setQuestionEditState({ status: 'picking', zoneTrackingId });
  };

  const handleUpdateQuestion = (
    updatedQuestion: ZoneQuestionBlockForm | QuestionAlternativeForm,
    // This will only be provided if the QID changed
    newQuestionData: StaffAssessmentQuestionRow | undefined,
  ) => {
    if (!updatedQuestion.id) return;
    if (questionEditState.status !== 'editing') return;

    // Normalize point fields
    const normalizedQuestion = normalizeQuestionPoints(updatedQuestion);

    if (questionEditState.mode === 'create') {
      // Prepare question data for the map if provided
      let preparedQuestionData: StaffAssessmentQuestionRow | undefined;
      if (newQuestionData) {
        preparedQuestionData = {
          ...newQuestionData,
          assessment,
          assessment_question: {
            ...newQuestionData.assessment_question,
            number: 0, // Will be recalculated on save
            number_in_alternative_group: null,
          } as StaffAssessmentQuestionRow['assessment_question'],
          alternative_group: {
            ...newQuestionData.alternative_group,
            number: 0, // Will be recalculated on save
          },
          alternative_group_size: 1,
        };
      }

      dispatch({
        type: 'ADD_QUESTION',
        zoneTrackingId: questionEditState.zoneTrackingId,
        question: {
          ...(normalizedQuestion as ZoneQuestionBlockForm),
          ...createQuestionWithTrackingId(),
        },
        questionData: preparedQuestionData,
      });
    } else if (questionEditState.mode === 'edit') {
      // Update existing question
      if (newQuestionData) {
        dispatch({
          type: 'UPDATE_QUESTION_METADATA',
          questionId: updatedQuestion.id,
          oldQuestionId: questionEditState.originalQuestionId,
          questionData: {
            ...newQuestionData,
            assessment,
            assessment_question: {
              ...newQuestionData.assessment_question,
              number: 0, // Will be recalculated on save
              number_in_alternative_group: null,
            } as StaffAssessmentQuestionRow['assessment_question'],
            alternative_group: {
              ...newQuestionData.alternative_group,
              number: 0, // Will be recalculated on save
            },
            alternative_group_size: 1,
          },
        });
      }

      // Apply point normalization for the update
      const questionWithNormalizedPoints = {
        ...normalizedQuestion,
        points: normalizedQuestion.manualPoints != null ? undefined : normalizedQuestion.points,
        maxPoints:
          normalizedQuestion.manualPoints != null ? undefined : normalizedQuestion.maxPoints,
      };

      dispatch({
        type: 'UPDATE_QUESTION',
        questionTrackingId: questionEditState.questionTrackingId,
        question: questionWithNormalizedPoints,
        alternativeTrackingId: questionEditState.alternativeTrackingId,
      });
    }

    closeQuestionEditState();
  };

  const handleDeleteQuestion = (
    questionTrackingId: string,
    questionId: string,
    alternativeTrackingId?: string,
  ) => {
    dispatch({
      type: 'DELETE_QUESTION',
      questionTrackingId,
      questionId,
      alternativeTrackingId,
    });
  };

  const handleAddZone = () => {
    editZoneModal.showWithData({ type: 'create' });
  };

  const handleEditZone = (zoneTrackingId: string) => {
    const zone = zones.find((z) => z.trackingId === zoneTrackingId);
    if (!zone) return;
    editZoneModal.showWithData({
      type: 'edit',
      zone,
      zoneTrackingId,
    });
  };

  const handleDeleteZone = (zoneTrackingId: string) => {
    dispatch({
      type: 'DELETE_ZONE',
      zoneTrackingId,
    });
  };

  const handleSaveZone = (zone: Partial<ZoneAssessmentForm>, zoneTrackingId?: string) => {
    if (zoneTrackingId === undefined) {
      // Adding a new zone
      dispatch({
        type: 'ADD_ZONE',
        zone: createZoneWithTrackingId({
          ...zone,
          questions: zone.questions ?? [],
        } as Omit<ZoneAssessmentForm, 'trackingId'>),
      });
    } else {
      // Updating an existing zone
      dispatch({
        type: 'UPDATE_ZONE',
        zoneTrackingId,
        zone,
      });
    }
    editZoneModal.hide();
  };

  // Sub-handlers for handleDragEnd - each handles a specific drag scenario
  const handleZoneReorder = (ctx: ParsedDragEvent) => {
    const fromZoneIndex = zones.findIndex((z) => z.trackingId === ctx.activeId);
    if (fromZoneIndex === -1) return;

    const toZoneIndex = zones.findIndex((z) => z.trackingId === ctx.overId);
    if (toZoneIndex === -1 || fromZoneIndex === toZoneIndex) return;

    const beforeZoneTrackingId = getInsertBeforeId(zones, fromZoneIndex, toZoneIndex);

    dispatch({
      type: 'REORDER_ZONE',
      zoneTrackingId: ctx.activeId,
      beforeZoneTrackingId,
    });
  };

  const handleQuestionToGroup = (ctx: ParsedDragEvent) => {
    const groupTrackingId = ctx.overGroupTrackingId;
    if (!groupTrackingId) return;

    // Check if already added to this group during dragOver
    const currentGroupId = findContainingGroup(zones, ctx.activeId);
    if (currentGroupId === groupTrackingId) return;

    // Don't allow dropping a group onto another group
    const sourceResult = findQuestionByTrackingId(zones, ctx.activeId);
    if (!sourceResult || sourceResult.question.alternatives) return;

    dispatch({
      type: 'ADD_TO_ALTERNATIVE_GROUP',
      questionTrackingId: ctx.activeId,
      targetGroupTrackingId: groupTrackingId,
    });
  };

  const handleAlternativeExtract = (ctx: ParsedDragEvent) => {
    const groupTrackingId = ctx.activeGroupTrackingId;
    if (!groupTrackingId) return;

    // If dropped on same group, do nothing (could support reordering later)
    if (ctx.overType === 'group-drop' && ctx.overGroupTrackingId === groupTrackingId) {
      return;
    }

    const dropTarget = resolveDropTarget(ctx.overId, ctx.overType, zones, positionByStableId);
    if (!dropTarget) return;

    dispatch({
      type: 'EXTRACT_FROM_ALTERNATIVE_GROUP',
      groupTrackingId,
      alternativeTrackingId: ctx.activeId,
      toZoneTrackingId: dropTarget.zoneTrackingId,
      beforeQuestionTrackingId: dropTarget.beforeQuestionTrackingId,
    });
  };

  const handleQuestionReorder = (ctx: ParsedDragEvent) => {
    const fromPosition = positionByStableId[ctx.activeId];
    let toPosition = positionByStableId[ctx.overId];

    // If overId is an alternative inside a group, use the group's position
    if (!toPosition && ctx.overGroupTrackingId) {
      toPosition = positionByStableId[ctx.overGroupTrackingId];
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!fromPosition || !toPosition) return;

    const fromZone = zones[fromPosition.zoneIndex];
    const toZone = zones[toPosition.zoneIndex];

    if (fromZone.trackingId !== toZone.trackingId) return;
    if (fromPosition.questionIndex === toPosition.questionIndex) return;

    const beforeQuestionTrackingId = getInsertBeforeId(
      toZone.questions,
      fromPosition.questionIndex,
      toPosition.questionIndex,
    );

    dispatch({
      type: 'REORDER_QUESTION',
      questionTrackingId: ctx.activeId,
      toZoneTrackingId: toZone.trackingId,
      beforeQuestionTrackingId,
    });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;

    const ctx = parseDragEvent(active, over);

    if (ctx.activeType === 'zone') {
      handleZoneReorder(ctx);
    } else if (ctx.overType === 'group-drop' && ctx.activeType === 'question') {
      handleQuestionToGroup(ctx);
    } else if (ctx.activeType === 'alternative') {
      // Check if already extracted during dragOver
      const alreadyExtracted = positionByStableId[ctx.activeId] !== undefined;
      if (alreadyExtracted) {
        // Extracted during drag - do final reorder if needed
        handleQuestionReorder(ctx);
      } else {
        // Not yet extracted - extract now
        handleAlternativeExtract(ctx);
      }
    } else {
      handleQuestionReorder(ctx);
    }
  };

  // Move questions between zones during drag for smooth cross-zone reordering animation
  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;

    const ctx = parseDragEvent(active, over);

    // Only handle question and alternative drags
    if (ctx.activeType !== 'question' && ctx.activeType !== 'alternative') return;

    // Determine current state of the dragged item (may differ from initial activeType)
    const isCurrentlyStandalone = positionByStableId[ctx.activeId] !== undefined;
    const currentGroupId = isCurrentlyStandalone ? null : findContainingGroup(zones, ctx.activeId);

    // Handle hovering over a group-drop target - add question to group during drag
    if (ctx.overType === 'group-drop') {
      const groupTrackingId = ctx.overGroupTrackingId;
      if (!groupTrackingId) return;

      // Only add standalone questions (not alternatives or groups)
      if (!isCurrentlyStandalone) return;

      // Don't add groups (questions with alternatives) to other groups
      const sourceResult = findQuestionByTrackingId(zones, ctx.activeId);
      if (!sourceResult || sourceResult.question.alternatives) return;

      // Check if already added to this group
      const alreadyInGroup = findContainingGroup(zones, ctx.activeId);
      if (alreadyInGroup === groupTrackingId) return;

      dispatch({
        type: 'ADD_TO_ALTERNATIVE_GROUP',
        questionTrackingId: ctx.activeId,
        targetGroupTrackingId: groupTrackingId,
      });
      return;
    }

    // Handle hovering over non-group targets (zones, questions, empty drops)
    const dropTarget = resolveDropTarget(ctx.overId, ctx.overType, zones, positionByStableId);
    if (!dropTarget) return;

    if (currentGroupId) {
      // Currently in a group - check if we should extract
      // Don't extract if hovering over the same group's alternatives
      if (ctx.overGroupTrackingId === currentGroupId) return;

      // Prevent extraction if it would place the item at the end of the zone
      // right next to the group we're extracting from (causes add/extract loops
      // when collision detection bounces between the group and zone header)
      if (ctx.activeType === 'question' && !dropTarget.beforeQuestionTrackingId) {
        const targetZone = zones.find((z) => z.trackingId === dropTarget.zoneTrackingId);
        if (targetZone) {
          const lastQuestion = targetZone.questions[targetZone.questions.length - 1];
          if (lastQuestion?.trackingId === currentGroupId) {
            return; // Don't extract to right after the group
          }
        }
      }

      dispatch({
        type: 'EXTRACT_FROM_ALTERNATIVE_GROUP',
        groupTrackingId: currentGroupId,
        alternativeTrackingId: ctx.activeId,
        toZoneTrackingId: dropTarget.zoneTrackingId,
        beforeQuestionTrackingId: dropTarget.beforeQuestionTrackingId,
      });
      return;
    }

    // Currently standalone - handle cross-zone reordering
    const fromPosition = positionByStableId[ctx.activeId];
    if (!fromPosition) return;

    const fromZone = zones[fromPosition.zoneIndex];

    // Only dispatch reorder if moving to a different zone
    if (fromZone.trackingId !== dropTarget.zoneTrackingId) {
      dispatch({
        type: 'REORDER_QUESTION',
        questionTrackingId: ctx.activeId,
        toZoneTrackingId: dropTarget.zoneTrackingId,
        beforeQuestionTrackingId: dropTarget.beforeQuestionTrackingId,
      });
    }
  };

  // If at least one question has a nonzero unlock score, display the Advance Score column
  const showAdvanceScorePercCol = Object.values(questionMetadata).some(
    (q) => q.assessment_question.effective_advance_score_perc !== 0,
  );

  return (
    <>
      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center">
          <h1>
            {assessmentSetName} {assessment.number}: Questions
          </h1>
          <div className="ms-auto">
            {canEdit && origHash ? (
              <EditModeButtons
                csrfToken={csrfToken}
                origHash={origHash}
                zones={zones}
                editMode={editMode}
                setEditMode={setEditMode}
                saveButtonDisabled={
                  JSON.stringify(zones) === initialZonesRef.current ||
                  zones.some((zone) => zone.questions.length === 0)
                }
                saveButtonDisabledReason={
                  zones.some((zone) => zone.questions.length === 0)
                    ? 'Cannot save: one or more zones have no questions'
                    : undefined
                }
                isAllExpanded={collapsedZones.size === 0 && collapsedGroups.size === 0}
                onToggleExpandCollapse={() => {
                  if (collapsedZones.size === 0 && collapsedGroups.size === 0) {
                    dispatch({ type: 'COLLAPSE_ALL' });
                  } else {
                    dispatch({ type: 'EXPAND_ALL' });
                  }
                }}
                onCancel={() => {
                  dispatch({ type: 'RESET' });
                  setEditMode(false);
                }}
              />
            ) : null}
          </div>
        </div>
        <DndContext
          sensors={sensors}
          // TODO: Explore using pointerWithin instead of closestCenter
          collisionDetection={closestCenter}
          autoScroll={false}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <DragTargetMonitor
            zones={zones}
            setTargetGroupTrackingId={setTargetGroupTrackingId}
          />
          <SortableContext
            items={zones.map((z) => z.trackingId)}
            strategy={verticalListSortingStrategy}
          >
            <div style={{ overflowX: 'auto' }}>
              <table className="table table-sm table-hover mb-0" aria-label="Assessment questions">
                <thead>
                  <tr>
                    {editMode && (
                      <>
                        <th style={{ width: '1%' }}>
                          <span className="visually-hidden">Drag</span>
                        </th>
                        <th>
                          <span className="visually-hidden">Edit</span>
                        </th>
                        <th>
                          <span className="visually-hidden">Delete</span>
                        </th>
                      </>
                    )}
                    <th>
                      <span className="visually-hidden">Name</span>
                    </th>
                    <th>Topic</th>
                    <th>Tags</th>
                    <th>Auto Points</th>
                    <th>Manual Points</th>
                    {showAdvanceScorePercCol && <th>Advance Score</th>}
                    <th>Mean score</th>
                    <th>Num. Submissions Histogram</th>
                    <th>Other Assessments</th>
                    {!editMode && <th className="text-end">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {zones.map((zone, index) => {
                    return (
                      <AssessmentZone
                        key={zone.trackingId}
                        zone={zone}
                        zoneNumber={index + 1}
                        assessmentState={{
                          questionMetadata,
                          editMode,
                          urlPrefix,
                          hasCoursePermissionPreview,
                          canEdit,
                          showAdvanceScorePercCol,
                          assessmentType,
                        }}
                        handleAddQuestion={openPickerForNew}
                        handleAddAlternativeGroup={handleAddAlternativeGroup}
                        handleEditQuestion={openEditForExisting}
                        handleEditGroup={openEditForExistingGroup}
                        handleDeleteQuestion={handleDeleteQuestion}
                        handleResetButtonClick={handleResetButtonClick}
                        handleEditZone={handleEditZone}
                        handleDeleteZone={handleDeleteZone}
                        startingQuestionNumber={zoneStartNumbers[index]}
                        collapsedGroups={collapsedGroups}
                        collapsedZones={collapsedZones}
                        dispatch={dispatch}
                        targetGroupTrackingId={targetGroupTrackingId}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SortableContext>
        </DndContext>
        {editMode && (
          <div className="card-footer">
            <button className="btn btn-sm btn-primary" type="button" onClick={handleAddZone}>
              <i className="fa fa-plus" aria-hidden="true" /> Add zone
            </button>
          </div>
        )}
      </div>
      {assessmentType === 'Homework' ? (
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
      {editMode && (
        <EditQuestionModal
          show={showEditModal}
          data={editModalData}
          assessmentType={assessmentType === 'Homework' ? 'Homework' : 'Exam'}
          handleUpdateQuestion={handleUpdateQuestion}
          handleUpdateGroup={handleUpdateGroup}
          onHide={closeQuestionEditState}
          onPickQuestion={openPickerToChangeQid}
          onAddAndPickAnother={handleAddAndPickAnother}
        />
      )}
      {editMode && <EditZoneModal {...editZoneModal} handleSaveZone={handleSaveZone} />}
      {editMode && (
        <QuestionPickerModal
          show={showPicker}
          courseQuestions={courseQuestions}
          isLoading={courseQuestionsQuery.isLoading}
          questionsInAssessment={questionsInAssessment}
          urlPrefix={urlPrefix}
          currentQid={
            questionEditState.status === 'picking'
              ? (questionEditState.returnToEdit?.question.id ?? null)
              : null
          }
          currentAssessmentId={assessment.id}
          onHide={handlePickerCancel}
          onQuestionSelected={handleQuestionPicked}
        />
      )}
    </>
  );
}

export function InstructorAssessmentQuestionsTable({
  trpcCsrfToken,
  ...innerProps
}: Parameters<typeof InstructorAssessmentQuestionsTableInner>[0] & {
  trpcCsrfToken: string;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createAssessmentQuestionsTrpcClient(trpcCsrfToken));
  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <InstructorAssessmentQuestionsTableInner {...innerProps} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

InstructorAssessmentQuestionsTable.displayName = 'InstructorAssessmentQuestionsTable';
